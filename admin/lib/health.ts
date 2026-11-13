import { newId, q, q1 } from "./db";
import { notifyAlert } from "./notify";
import {
  probeChat,
  probeSegmentation,
  resolveEndpointKey,
  type ProbeResult,
} from "./probe";

// Probe execution + alert lifecycle (spec §4.3 scheduling, §4.4 surfacing).
//
// Alert rule: a single failure with error_class auth|blocked_or_quota opens
// an alert immediately (a block gets no second chance); any other failure
// opens one after TWO consecutive failed checks of the same assignment.
// A passing check closes the open alert for that (endpoint x route) and
// records the down-window via opened_at/closed_at.

export interface EndpointRow {
  id: string;
  provider_id: string;
  label: string;
  base_url: string;
  credential_ref: string | null;
  api_key_secret: string | null;
  capabilities: string[];
  status: string;
  timeout_ms: number;
  probe_model: string | null;
}

export interface CheckRow {
  id: number;
  endpoint_id: string;
  route_id: string | null;
  ok: boolean;
  http_status: number | null;
  latency_ms: number | null;
  error_class: string | null;
  detail: string | null;
  checked_at: string;
}

async function providerKind(providerId: string): Promise<string> {
  const p = await q1<{ kind: string }>(
    `SELECT kind FROM ai_providers WHERE id = $1`,
    [providerId]
  );
  return p?.kind ?? "openai_compatible";
}

async function recordCheck(
  endpointId: string,
  routeId: string | null,
  result: ProbeResult
): Promise<CheckRow> {
  const rows = await q<CheckRow>(
    `INSERT INTO endpoint_health_checks
       (endpoint_id, route_id, ok, http_status, latency_ms, error_class, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [
      endpointId,
      routeId,
      result.ok,
      result.httpStatus,
      result.latencyMs,
      result.errorClass,
      result.detail,
    ]
  );
  return rows[0];
}

export async function evaluateAlerts(
  endpoint: EndpointRow,
  routeId: string | null,
  latest: CheckRow
): Promise<void> {
  const routeLabel = routeId
    ? (
        await q1<{ product_label: string }>(
          `SELECT product_label FROM ai_routes WHERE route_id = $1`,
          [routeId]
        )
      )?.product_label ?? null
    : null;

  if (latest.ok) {
    await q(
      `UPDATE health_alerts SET closed_at = now()
        WHERE endpoint_id = $1 AND route_id IS NOT DISTINCT FROM $2
          AND closed_at IS NULL`,
      [endpoint.id, routeId]
    );
    return;
  }

  const immediate =
    latest.error_class === "auth" || latest.error_class === "blocked_or_quota";
  let shouldOpen = immediate;
  if (!shouldOpen) {
    const recent = await q<{ ok: boolean }>(
      `SELECT ok FROM endpoint_health_checks
        WHERE endpoint_id = $1 AND route_id IS NOT DISTINCT FROM $2
        ORDER BY checked_at DESC LIMIT 2`,
      [endpoint.id, routeId]
    );
    shouldOpen = recent.length >= 2 && recent.every((r) => !r.ok);
  }
  if (!shouldOpen) return;

  const existing = await q1(
    `SELECT id FROM health_alerts
      WHERE endpoint_id = $1 AND route_id IS NOT DISTINCT FROM $2
        AND closed_at IS NULL`,
    [endpoint.id, routeId]
  );
  if (existing) return;

  const alertId = newId();
  const reason = `${latest.error_class}: ${latest.detail ?? ""}`.trim();
  await q(
    `INSERT INTO health_alerts (id, endpoint_id, route_id, reason)
     VALUES ($1,$2,$3,$4)`,
    [alertId, endpoint.id, routeId, reason]
  );
  const channels = await notifyAlert({
    alertId,
    endpointLabel: endpoint.label,
    routeId,
    routeLabel,
    reason,
  });
  const anySent = channels.some((c) => c.sent);
  await q(
    `UPDATE health_alerts
        SET notified_at = CASE WHEN $2 THEN now() ELSE notified_at END,
            notify_detail = $3
      WHERE id = $1`,
    [
      alertId,
      anySent,
      channels
        .map((c) => `${c.channel}: ${c.sent ? "sent" : c.configured ? "FAILED" : "not configured"} — ${c.detail}`)
        .join("; "),
    ]
  );
}

/** Probe one assignment (route shape) and run the alert lifecycle. */
export async function probeAssignment(
  route: { route_id: string; shape: string },
  assignment: { endpoint_id: string; model_id: string },
  endpoint: EndpointRow
): Promise<CheckRow | null> {
  if (route.shape === "local") return null; // on-device route: no gateway call, nothing to probe (§4.2)
  const target = {
    baseUrl: endpoint.base_url,
    apiKey: resolveEndpointKey(endpoint),
    model: assignment.model_id,
    providerKind: await providerKind(endpoint.provider_id),
    timeoutMs: endpoint.timeout_ms,
  };
  const result =
    route.shape === "segmentation"
      ? await probeSegmentation(target)
      : await probeChat(target);
  const row = await recordCheck(endpoint.id, route.route_id, result);
  await evaluateAlerts(endpoint, route.route_id, row);
  return row;
}

/** Probe an unassigned active endpoint at endpoint level (route_id NULL). */
export async function probeEndpointLevel(
  endpoint: EndpointRow
): Promise<CheckRow> {
  const caps = endpoint.capabilities ?? [];
  const target = {
    baseUrl: endpoint.base_url,
    apiKey: resolveEndpointKey(endpoint),
    model: endpoint.probe_model ?? "probe",
    providerKind: await providerKind(endpoint.provider_id),
    timeoutMs: endpoint.timeout_ms,
  };
  const result =
    caps.includes("segmentation") && !caps.includes("chat")
      ? await probeSegmentation(target)
      : await probeChat(target);
  const row = await recordCheck(endpoint.id, null, result);
  await evaluateAlerts(endpoint, null, row);
  return row;
}

/** Cron pass: every non-retired assignment + unassigned active endpoints. */
export async function probeAll(): Promise<{ probed: number }> {
  const assignments = await q<{
    route_id: string;
    shape: string;
    endpoint_id: string;
    model_id: string;
  }>(
    `SELECT a.route_id, r.shape, a.endpoint_id, a.model_id
       FROM ai_route_assignments a
       JOIN ai_routes r ON r.route_id = a.route_id
       JOIN ai_endpoints e ON e.id = a.endpoint_id
      WHERE e.status = 'active'`
  );
  const endpoints = await q<EndpointRow>(
    `SELECT * FROM ai_endpoints WHERE status != 'retired'`
  );
  const byId = new Map(endpoints.map((e) => [e.id, e]));
  let probed = 0;
  const assignedIds = new Set<string>();
  for (const a of assignments) {
    const ep = byId.get(a.endpoint_id);
    if (!ep) continue;
    assignedIds.add(ep.id);
    const row = await probeAssignment(
      { route_id: a.route_id, shape: a.shape },
      { endpoint_id: a.endpoint_id, model_id: a.model_id },
      ep
    );
    if (row) probed++;
  }
  for (const ep of endpoints) {
    if (ep.status === "active" && !assignedIds.has(ep.id)) {
      await probeEndpointLevel(ep);
      probed++;
    }
  }
  return { probed };
}
