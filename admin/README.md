# Fabric Admin

The Fabric administration portal + config service (Admin-1 of
`ADMIN-PORTAL-SPEC.md` — the spec lives with the Fabric project docs).
Separate deploy unit from the Fabric app: this folder deploys as its own
Vercel project rooted at `admin/` (domain: `admin.fabric.fanalogy.com`),
or runs on any Node host. An admin outage can never take Fabric down —
the app reads config with a last-good cache and build-time fallback
(spec §2.3; the app-side reader is Admin-2, *not yet implemented*).

## What Admin-1 implements (all real, all verified by tests/admin1-check.mjs)

- Postgres schema, migration `0001` (config, providers/endpoints incl.
  the `private` provider type + capabilities, the route registry +
  route assignments, per-route health checks, health alerts, admin
  user/sessions, audit log).
- Single-operator auth: argon2id password + TOTP (RFC 6238), recovery
  codes, server-side sessions (HttpOnly cookie, 12h), sign-in rate
  limiting, audit-logged logins (spec §2.4).
- Endpoints CRUD incl. `private` endpoints. API keys are write-only:
  entered in the portal, stored server-side, never returned by any API.
  A key may instead be a reference (`env:NAME`) resolved from host env.
- Route registry seeded per spec §4.2: `ghost_consult`,
  `ghost_consult_premium`, `composer`, `see_segmentation`,
  `brain_ondevice`. Voice input is a platform service — deliberately
  not a route.
- Health probes: real minimal inference requests in each assignment's
  own shape (chat vs segmentation), per (endpoint × route), classified
  `ok / auth / blocked_or_quota / not_found / timeout / down / slow /
  bad_response`. On-demand in the panel + `GET|POST /api/cron/probe`
  (shared-secret header or Vercel Cron bearer; `vercel.json` carries
  the 15-minute schedule for the Vercel deploy).
- Alerts: a `blocked_or_quota`/`auth` failure opens an alert on the
  first failure; other failures after two consecutive. Opening fires
  email (SMTP) + webhook notifications in the same request; a passing
  check closes the alert. Open alerts banner every portal page, naming
  the affected route in product terms.
- Public config API `GET /api/public/config`: latest published release,
  HMAC-SHA256 signed (`CONFIG_SIGNING_SECRET`). Payload carries route →
  gateway route IDs + product labels + an opaque assignment revision
  hash ONLY — no provider URLs, model IDs, provider names, or keys
  (law #11; enforced by payload construction, not filtering).
- Assignment swaps follow §4.5: the candidate endpoint is probed in the
  route's shape and must pass before anything is written; the swap is
  one transaction with an audit row and `prior_endpoint_id` recorded
  for one-click rollback. Changes surface in apps on the next config
  publish (the gateway that consumes assignments live is Admin-2,
  *not yet implemented*).
- Break-glass: `ADMIN_READ_ONLY=1` refuses all portal mutations while
  reads, probes, and alerts keep running (§7.4).

## Not yet implemented (per spec §9 — absent, not faked)

- Admin-2: app-side runtime-config consumption + the inference gateway.
- Admin-3: plans/entitlements core. Admin-4: Stripe subscriptions.
- Admin-5: house ads. Admin-6: releases panel. Admin-7: OTA admin.
- Admin-8: claim flow. Admin-9: sponsor ads.
- `docker-compose.yml` from the spec's §8 package sketch is not in
  Admin-1; self-hosting today is the plain Node path below.

## Run it

```sh
# 1. Postgres >= 15, empty database; set env (see .env.example)
export DATABASE_URL=postgres://user:pass@host:5432/fabric_admin
export CONFIG_SIGNING_SECRET=... TOTP_ENC_KEY=... CRON_SECRET=...

npm ci
npm run migrate          # applies db/migrations/*.sql in order
npm run seed             # route registry + starter config v1 (changes nothing)
ADMIN_USERNAME=terrell ADMIN_PASSWORD=... npm run create-admin
#   ^ prints the TOTP secret + otpauth URL + 10 recovery codes ONCE

npm run build && npm start   # or: npm run dev
```

## Deploy

- Vercel: create a separate project with root directory `admin/`, set
  every variable from `.env.example`, deploy by git integration (no
  GitHub Actions — law #8). `vercel.json` registers the 15-minute
  probe cron; set `CRON_SECRET` on the project so Vercel Cron's
  bearer is accepted.
- Any Node host: `npm ci && npm run build && npm start` behind your
  reverse proxy; schedule any external cron to call
  `/api/cron/probe` with the `x-cron-secret` header every 15 minutes.

## Portability (spec §8)

The complete state is one Postgres database + one env file. Move =
`pg_dump` the database, set the same env vars on the new host, restore,
repoint DNS. No vendor-specific storage, queues, or auth anywhere in
this package.

## Verify

```sh
# Terminal 1: app with test alert channels pointed at the check's sinks
ALERT_WEBHOOK_URL=http://127.0.0.1:8791/hook \
SMTP_HOST=127.0.0.1 SMTP_PORT=2525 SMTP_FROM=admin@test.local \
ALERT_EMAIL_TO=ops@test.local PORT=3100 npm run start

# Terminal 2:
ADMIN_TEST_USERNAME=... ADMIN_TEST_PASSWORD=... \
ADMIN_TEST_TOTP_SECRET=... CONFIG_SIGNING_SECRET=... CRON_SECRET=... \
npm run check     # tests/admin1-check.mjs — 33 assertions
```
