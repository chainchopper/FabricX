// Seed (spec §3.2): the §4.2 route registry (voice input is NOT seeded —
// it is a platform service, permanently outside designation) and a starter
// published config equivalent to today's behavior — deploying the admin
// changes nothing for users until the operator publishes a change.
// Idempotent: safe to re-run.
import { createHash, createHmac } from "node:crypto";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  const routes = [
    // route_id, product_label, shape, floor, premium, entitlement_key
    ["ghost_consult", "Ghostie thinking", "chat_completions",
     "On-device WebLLM tier, then the ghost decision table", false, null],
    ["ghost_consult_premium", "Deeper ghost thinking", "chat_completions",
     "On-device WebLLM tier, then the ghost decision table", true, "premium_ai"],
    ["composer", "Open-ended performances", "chat_completions",
     "On-device WebLLM tier, then the built-in interpreter / generative templates", false, null],
    ["see_segmentation", "See — precision masks", "segmentation",
     "On-device GroundingDINO (boxes instead of masks), then no segmentation", false, null],
    ["brain_ondevice", "On-device brain", "local",
     "It is a floor: the in-browser interpreter / ghost decision table", false, null],
  ];
  for (const [route_id, label, shape, floor, premium, key] of routes) {
    await client.query(
      `INSERT INTO ai_routes (route_id, product_label, shape, floor, premium, entitlement_key, enabled)
       VALUES ($1,$2,$3,$4,$5,$6,true)
       ON CONFLICT (route_id) DO NOTHING`,
      [route_id, label, shape, floor, premium, key]
    );
  }
  console.log(`seeded ${routes.length} routes`);

  const existing = await client.query(
    `SELECT version FROM config_releases ORDER BY version DESC LIMIT 1`
  );
  if (!existing.rowCount) {
    // Starter payload (mirrors lib/config.ts buildPayload with no
    // assignments): routes + labels + gateway base only — no provider
    // URLs, model IDs, provider names, or keys (law #11).
    const routesPayload = {};
    for (const [route_id, label, , , premium, key] of routes) {
      const entry = {
        enabled: true,
        label,
        premium,
        gateway_route_id: route_id,
        assignment_rev: null,
      };
      if (premium && key) entry.requires_entitlement = key;
      routesPayload[route_id] = entry;
    }
    const payload = {
      config_version: 1,
      published_at: new Date().toISOString(),
      ttl_seconds: 900,
      gateway: {
        base_url:
          process.env.PUBLIC_GATEWAY_BASE_URL ??
          "https://admin.fabric.fanalogy.com/api/gateway/v1",
      },
      routes: routesPayload,
      features: {},
      versions: {
        web_min_supported: null,
        native_min_supported: null,
        native_latest_runtime: null,
      },
    };
    await client.query(
      `INSERT INTO config_releases (version, payload, published_by, note)
       VALUES (1, $1, 'seed', 'starter config — changes nothing')`,
      [JSON.stringify(payload)]
    );
    console.log("published starter config v1");
    // (The public API signs this payload per-request with
    // CONFIG_SIGNING_SECRET; the seed only proves the HMAC key exists.)
    if (process.env.CONFIG_SIGNING_SECRET) {
      createHmac("sha256", process.env.CONFIG_SIGNING_SECRET)
        .update(JSON.stringify(payload))
        .digest("hex");
    }
    void createHash;
  } else {
    console.log("config releases exist; starter publish skipped");
  }
} finally {
  await client.end();
}
