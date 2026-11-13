import { createHash } from "crypto";
import { audit, q, q1 } from "./db";
import { signConfig } from "./secrets";

// Published-config construction (spec §2.3). The payload is built ONLY
// from ai_routes' product fields + config_entries scalars. Endpoint rows,
// provider names, model IDs and keys cannot appear here — by construction,
// not by filtering (law #11). The one assignment-derived field,
// assignment_rev, is an opaque hash of the assignment row: it lets the app
// (and our checks) tell that a route's serving changed without learning
// anything about what serves it.

export interface RouteRow {
  route_id: string;
  product_label: string;
  shape: string;
  floor: string;
  premium: boolean;
  entitlement_key: string | null;
  enabled: boolean;
}

async function configValue<T>(key: string, fallback: T): Promise<T> {
  const row = await q1<{ value: T }>(
    `SELECT value FROM config_entries WHERE key = $1`,
    [key]
  );
  return row ? row.value : fallback;
}

export async function buildPayload(version: number): Promise<Record<string, unknown>> {
  const routes = await q<RouteRow>(
    `SELECT * FROM ai_routes ORDER BY route_id`
  );
  const assignments = await q<{
    route_id: string;
    endpoint_id: string;
    model_id: string;
    changed_at: string;
  }>(`SELECT route_id, endpoint_id, model_id, changed_at FROM ai_route_assignments`);

  const routesPayload: Record<string, unknown> = {};
  for (const r of routes) {
    const a = assignments.find((x) => x.route_id === r.route_id);
    const entry: Record<string, unknown> = {
      enabled: r.enabled,
      label: r.product_label,
      premium: r.premium,
      gateway_route_id: r.route_id,
      assignment_rev: a
        ? createHash("sha256")
            .update(`${a.endpoint_id}|${a.model_id}|${a.changed_at}`)
            .digest("hex")
            .slice(0, 16)
        : null,
    };
    if (r.premium && r.entitlement_key) {
      entry.requires_entitlement = r.entitlement_key;
    }
    routesPayload[r.route_id] = entry;
  }

  const gatewayBase =
    process.env.PUBLIC_GATEWAY_BASE_URL ??
    "https://admin.fabric.fanalogy.com/api/gateway/v1";
  const ttl = await configValue<number>("ttl_seconds", 900);
  const features = await configValue<Record<string, unknown>>("features", {});
  const versions = await configValue<Record<string, unknown>>("versions", {
    web_min_supported: null,
    native_min_supported: null,
    native_latest_runtime: null,
  });

  return {
    config_version: version,
    published_at: new Date().toISOString(),
    ttl_seconds: ttl,
    gateway: { base_url: gatewayBase },
    routes: routesPayload,
    features,
    versions,
  };
}

/** Publish a new config release: next version, immutable snapshot, audit. */
export async function publishConfig(
  actor: string,
  note: string
): Promise<{ version: number; payload: Record<string, unknown> }> {
  const latest = await q1<{ version: number }>(
    `SELECT version FROM config_releases ORDER BY version DESC LIMIT 1`
  );
  const version = (latest?.version ?? 0) + 1;
  const payload = await buildPayload(version);
  await q(
    `INSERT INTO config_releases (version, payload, published_by, note)
     VALUES ($1,$2,$3,$4)`,
    [version, JSON.stringify(payload), actor, note]
  );
  await audit(actor, "config.publish", "config_releases", String(version), null, {
    version,
    note,
  });
  return { version, payload };
}

/** The public payload: latest release + HMAC signature (§2.3 integrity). */
export async function publicConfig(): Promise<Record<string, unknown> | null> {
  const latest = await q1<{ payload: Record<string, unknown> }>(
    `SELECT payload FROM config_releases ORDER BY version DESC LIMIT 1`
  );
  if (!latest) return null;
  const payload = latest.payload;
  return { ...payload, signature: signConfig(payload) };
}
