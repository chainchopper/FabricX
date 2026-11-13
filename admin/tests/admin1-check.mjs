// Admin-1 headless verification (spec §9, Admin-1 row). Run against a
// running admin app + migrated/seeded Postgres:
//   npm run build && npm run start   (with the env below set)
//   node tests/admin1-check.mjs
//
// Required env: DATABASE_URL, CONFIG_SIGNING_SECRET, CRON_SECRET,
//   ADMIN_TEST_USERNAME, ADMIN_TEST_PASSWORD, ADMIN_TEST_TOTP_SECRET
// The app process itself must be started with:
//   ALERT_WEBHOOK_URL=http://127.0.0.1:8791/hook
//   SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_FROM=admin@test.local
//   ALERT_EMAIL_TO=ops@test.local
// because this script runs the webhook listener (8791), SMTP sink (2525)
// and stub providers (8790) that the app talks to. Every check below is a
// real request against real surfaces — no mocks of the app itself.
import { createHmac, createHash } from "node:crypto";
import http from "node:http";
import net from "node:net";

const BASE = process.env.ADMIN_BASE_URL ?? "http://127.0.0.1:3100";
const USERNAME = process.env.ADMIN_TEST_USERNAME ?? "terrell";
const PASSWORD = process.env.ADMIN_TEST_PASSWORD;
const TOTP_SECRET = process.env.ADMIN_TEST_TOTP_SECRET;
const SIGNING_SECRET = process.env.CONFIG_SIGNING_SECRET;
const CRON = process.env.CRON_SECRET;
if (!PASSWORD || !TOTP_SECRET || !SIGNING_SECRET || !CRON) {
  console.error("missing test env (ADMIN_TEST_PASSWORD / ADMIN_TEST_TOTP_SECRET / CONFIG_SIGNING_SECRET / CRON_SECRET)");
  process.exit(2);
}

let pass = 0, fail = 0;
function check(label, ok, extra = "") {
  if (ok) { pass++; console.log(`  PASS ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${extra ? " — " + extra : ""}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- TOTP
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32decode(s) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0; const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secretB32) {
  const key = b32decode(secretB32);
  const counter = BigInt(Math.floor(Date.now() / 1000 / 30));
  const msg = Buffer.alloc(8); msg.writeBigInt64BE(counter);
  const h = createHmac("sha1", key).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  const code = ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, "0");
}

// ---------------------------------------------------------------- stubs
const webhookHits = [];
const webhookServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => { webhookHits.push(body); res.writeHead(200).end("{}"); });
});
await new Promise((r) => webhookServer.listen(8791, "127.0.0.1", r));

const smtpMessages = [];
const smtpServer = net.createServer((sock) => {
  sock.write("220 sink.test SMTP\r\n");
  let buf = "", inData = false, data = "";
  sock.on("data", (chunk) => {
    buf += chunk.toString();
    for (;;) {
      if (inData) {
        const end = buf.indexOf("\r\n.\r\n");
        if (end < 0) break;
        data += buf.slice(0, end);
        smtpMessages.push(data);
        data = ""; inData = false;
        buf = buf.slice(end + 5);
        sock.write("250 OK\r\n");
        continue;
      }
      const nl = buf.indexOf("\r\n");
      if (nl < 0) break;
      const line = buf.slice(0, nl); buf = buf.slice(nl + 2);
      const cmd = line.split(" ")[0].toUpperCase();
      if (cmd === "EHLO" || cmd === "HELO") sock.write("250 sink.test\r\n");
      else if (cmd === "DATA") { inData = true; sock.write("354 go\r\n"); }
      else if (cmd === "QUIT") { sock.write("221 bye\r\n"); sock.end(); }
      else sock.write("250 OK\r\n");
    }
  });
});
await new Promise((r) => smtpServer.listen(2525, "127.0.0.1", r));

// Stub provider: behavior keyed by the bearer key the probe presents.
const stub = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const key = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const json = (status, obj) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(obj));
    };
    if (key === "bad-key") return json(401, { error: { message: "invalid api key" } });
    if (key === "blocked-key")
      return json(403, { error: { message: "Account suspended: quota exceeded for this billing period" } });
    if (req.url.endsWith("/chat/completions")) {
      return json(200, { choices: [{ message: { role: "assistant", content: "ok" } }] });
    }
    if (req.url.endsWith("/responses")) {
      if (key === "chatonly-key") {
        // A chat-shaped body where a segmentation result was required.
        return json(200, { choices: [{ message: { content: "ok" } }] });
      }
      return json(200, { output: [{ type: "segmentation", masks: [], boxes: [[0, 0, 10, 10]] }] });
    }
    return json(404, { error: "nope" });
  });
});
await new Promise((r) => stub.listen(8790, "127.0.0.1", r));
const STUB = "http://127.0.0.1:8790/v1";

// ---------------------------------------------------------------- http
let cookie = "";
async function req(method, path, body, extraHeaders = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep null */ }
  const setCookie = r.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return { status: r.status, text, json, headers: r.headers };
}

// ================================================================ A. auth
console.log("== A. auth gate (§2.4) ==");
{
  const a = await req("GET", "/api/admin/routes");
  check("unauthenticated admin API refused (401)", a.status === 401, `got ${a.status}`);
  const b = await req("POST", "/api/admin/endpoints", { label: "x", base_url: "http://x" });
  check("unauthenticated admin mutation refused (401)", b.status === 401, `got ${b.status}`);
  const c = await req("GET", "/api/public/config");
  check("public config is public by design (200)", c.status === 200, `got ${c.status}`);
  const bad = await req("POST", "/api/auth/login", { username: USERNAME, password: "wrong-password", totp: "000000" });
  check("wrong password refused (401)", bad.status === 401, `got ${bad.status}`);
  const good = await req("POST", "/api/auth/login", { username: USERNAME, password: PASSWORD, totp: totp(TOTP_SECRET) });
  check("password + TOTP login succeeds", good.status === 200 && good.json?.ok === true, `got ${good.status} ${good.text.slice(0, 120)}`);
  check("session cookie is HttpOnly", (good.headers.get("set-cookie") ?? "").includes("HttpOnly"));
}

// ================================================================ B. config
console.log("== B. public config (§2.3) ==");
let configV1;
{
  const raw = await fetch(BASE + "/api/public/config");
  const text = await raw.text();
  const m = text.match(/^(.*),"signature":"([0-9a-f]{64})"\}$/s);
  check("config payload carries an HMAC signature", !!m);
  if (m) {
    const expected = createHmac("sha256", SIGNING_SECRET).update(m[1] + "}").digest("hex");
    check("signature verifies against CONFIG_SIGNING_SECRET", expected === m[2]);
  }
  configV1 = JSON.parse(text);
  check("starter config is version 1", configV1.config_version === 1, `got ${configV1.config_version}`);
  check(
    "starter routes carry labels + gateway route IDs",
    configV1.routes?.ghost_consult?.label === "Ghostie thinking" &&
      configV1.routes?.ghost_consult?.gateway_route_id === "ghost_consult" &&
      configV1.routes?.see_segmentation?.label?.includes("See")
  );
  check(
    "voice input is NOT a route in the payload (platform service)",
    !("voice_transcription" in (configV1.routes ?? {})) && !("voice" in (configV1.routes ?? {}))
  );
  check(
    "starter payload has no provider URLs / model IDs / keys",
    !/127\.0\.0\.1|api\.meta\.ai|muse-spark|stub-chat|good-key/.test(text)
  );
}

// ================================================================ C. probes
console.log("== C. endpoints + probe classification (§4.3) ==");
async function createEndpoint(body) {
  const r = await req("POST", "/api/admin/endpoints", body);
  if (r.status !== 201) throw new Error(`create failed ${r.status}: ${r.text}`);
  return r;
}
const goodEp = await createEndpoint({
  label: "Stub A (good)", base_url: STUB, provider_kind: "openai_compatible",
  api_key: "good-key", capabilities: ["chat", "segmentation"], probe_model: "stub-chat-1", status: "active",
});
check("endpoint created; key never returned", goodEp.status === 201 && !goodEp.text.includes("good-key") && goodEp.json.endpoint.credential_configured === true);
const badEp = (await createEndpoint({
  label: "Stub bad key", base_url: STUB, provider_kind: "openai_compatible",
  api_key: "bad-key", capabilities: ["chat"], probe_model: "stub-chat-1", status: "active",
})).json.endpoint;
const blockedEp = (await createEndpoint({
  label: "Stub blocked", base_url: STUB, provider_kind: "openai_compatible",
  api_key: "blocked-key", capabilities: ["chat"], probe_model: "stub-chat-1", status: "active",
})).json.endpoint;
const deadEp = (await createEndpoint({
  label: "Dead endpoint", base_url: "http://127.0.0.1:9/v1", provider_kind: "private",
  api_key: "whatever", capabilities: ["chat"], probe_model: "stub-chat-1", status: "active",
})).json.endpoint;

async function probe(endpoint_id) {
  const r = await req("POST", "/api/admin/probe", { endpoint_id });
  return r.json?.check;
}
{
  const c = await probe(goodEp.json.endpoint.id);
  check("good endpoint probes ok (real inference shape)", c?.ok === true && c?.error_class === "ok", JSON.stringify(c));
  const cb = await probe(badEp.id);
  check("wrong key classifies as auth", cb?.error_class === "auth", JSON.stringify(cb));
  const cd = await probe(deadEp.id);
  check("connection refused classifies as down", cd?.error_class === "down", JSON.stringify(cd));
  const ck = await probe(blockedEp.id);
  check("blocked-style 403 classifies as blocked_or_quota (not auth, not down)", ck?.error_class === "blocked_or_quota", JSON.stringify(ck));
}

// ================================================================ D. alerts
console.log("== D. alert fires + real notifications (§4.4) ==");
{
  await sleep(600); // notify is awaited in-request; small settle margin
  const alerts = await req("GET", "/api/admin/alerts");
  const mine = (alerts.json?.alerts ?? []).find(
    (a) => a.endpoint_id === blockedEp.id && a.closed_at === null
  );
  check("blocked_or_quota opened an alert immediately (single failure)", !!mine, JSON.stringify(alerts.json?.alerts?.length));
  check("alert was notified (notified_at set)", !!mine?.notified_at, mine?.notify_detail ?? "");
  check(
    "webhook channel REALLY delivered to the local listener",
    webhookHits.some((h) => h.includes("fabric_admin_alert") && h.includes(blockedEp.id) === false || h.includes("fabric_admin_alert")),
    `${webhookHits.length} hit(s)`
  );
  check(
    "email channel REALLY delivered to the local SMTP sink",
    smtpMessages.some((m) => m.includes("Fabric Admin") || m.includes("failing")),
    `${smtpMessages.length} message(s)`
  );
}

// ================================================================ E. shape discipline
console.log("== E. per-route shapes are real (§4.3/§4.5) ==");
const chatOnlyEp = (await createEndpoint({
  label: "Stub chat-only", base_url: STUB, provider_kind: "openai_compatible",
  api_key: "chatonly-key", capabilities: ["chat"], probe_model: "stub-chat-1", status: "active",
})).json.endpoint;
{
  const okSwap = await req("PUT", "/api/admin/assignments", {
    route_id: "ghost_consult", endpoint_id: chatOnlyEp.id, model_id: "stub-chat-1",
  });
  check("chat assignment with passing chat probe succeeds", okSwap.status === 200, `${okSwap.status} ${okSwap.text.slice(0, 160)}`);

  const capRefused = await req("PUT", "/api/admin/assignments", {
    route_id: "see_segmentation", endpoint_id: chatOnlyEp.id, model_id: "stub-seg-1",
  });
  check("segmentation assignment refused: endpoint lacks the capability", capRefused.status === 422, `got ${capRefused.status}`);

  await req("PATCH", `/api/admin/endpoints/${chatOnlyEp.id}`, {
    capabilities: ["chat", "segmentation"],
  });
  const shapeRefused = await req("PUT", "/api/admin/assignments", {
    route_id: "see_segmentation", endpoint_id: chatOnlyEp.id, model_id: "stub-seg-1",
  });
  check(
    "chat-shaped body fails the SEGMENTATION probe — assignment not made",
    shapeRefused.status === 422 && shapeRefused.json?.probe?.error_class === "bad_response",
    `${shapeRefused.status} ${shapeRefused.text.slice(0, 200)}`
  );
  const routesNow = await req("GET", "/api/admin/routes");
  const seg = (routesNow.json?.assignments ?? []).find((a) => a.route_id === "see_segmentation");
  check("see_segmentation remains unassigned after the failed swap", !seg);
}

// ================================================================ F. swap + publish
console.log("== F. swap takes effect in the next published config (§4.5) ==");
{
  const stubB = (await createEndpoint({
    label: "Stub B (good)", base_url: STUB, provider_kind: "meta_model_api",
    api_key: "good-key", capabilities: ["chat"], probe_model: "stub-chat-1", status: "active",
  })).json.endpoint;

  const first = await req("PUT", "/api/admin/assignments", {
    route_id: "composer", endpoint_id: goodEp.json.endpoint.id, model_id: "stub-chat-1",
  });
  check("composer assigned to Stub A", first.status === 200, `${first.status} ${first.text.slice(0, 140)}`);
  const pub1 = await req("POST", "/api/admin/publish", { note: "check: composer on A" });
  const revA = pub1.json?.payload?.routes?.composer?.assignment_rev;
  check("published config reflects the assignment (opaque rev present)", !!revA, JSON.stringify(pub1.json?.payload?.routes?.composer));

  const swap = await req("PUT", "/api/admin/assignments", {
    route_id: "composer", endpoint_id: stubB.id, model_id: "stub-chat-2",
  });
  check(
    "swap records the prior endpoint for one-click rollback",
    swap.status === 200 && swap.json?.assignment?.prior_endpoint_id === goodEp.json.endpoint.id,
    `${swap.status} ${swap.text.slice(0, 160)}`
  );
  const pub2 = await req("POST", "/api/admin/publish", { note: "check: composer swapped to B" });
  const revB = pub2.json?.payload?.routes?.composer?.assignment_rev;
  check(
    "next published config reflects the swap (rev changed, version bumped)",
    !!revB && revB !== revA && pub2.json?.version === (pub1.json?.version ?? 0) + 1,
    `revA=${revA} revB=${revB}`
  );
  const publicText = (await (await fetch(BASE + "/api/public/config")).text());
  check(
    "published payload STILL leaks no provider URL / model ID / key",
    !publicText.includes("127.0.0.1:8790") && !publicText.includes("stub-chat-2") && !publicText.includes("good-key")
  );
  const auditRows = await req("GET", "/api/admin/audit");
  const actions = (auditRows.json?.audit ?? []).map((a) => a.action);
  check(
    "audit log carries endpoint.create + route.assign + config.publish",
    actions.includes("endpoint.create") && actions.includes("route.assign") && actions.includes("config.publish"),
    actions.slice(0, 12).join(",")
  );
}

// ================================================================ G. cron
console.log("== G. cron probe endpoint (§4.3) ==");
{
  const noSecret = await fetch(BASE + "/api/cron/probe");
  check("cron endpoint refuses without the secret", noSecret.status === 401, `got ${noSecret.status}`);
  const okCron = await fetch(BASE + "/api/cron/probe", {
    headers: { "x-cron-secret": CRON },
  });
  const j = await okCron.json().catch(() => ({}));
  check("cron endpoint probes with the secret", okCron.status === 200 && j.ok === true && j.probed >= 1, `${okCron.status} ${JSON.stringify(j)}`);
}

// ================================================================ done
console.log(`\nadmin1-check: ${pass} passed, ${fail} failed`);
webhookServer.close();
smtpServer.close();
stub.close();
process.exit(fail > 0 ? 1 : 0);
