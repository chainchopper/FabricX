-- Fabric Admin — migration 0001 (Admin-1 scope)
-- Implements ADMIN-PORTAL-SPEC.md §3 (data model) with the §3.3 Nov 12
-- amendment folded in exactly: ai_routes + ai_route_assignments replace
-- ai_tier_assignments; model_id lives on the assignment, not the endpoint;
-- ai_endpoints carries capabilities JSONB; ai_providers.kind gains `private`;
-- health + alerts are per (endpoint x route).
-- Plain Postgres >= 15. No vendor extensions. UUIDs are generated in app
-- code (no pgcrypto). Tables for later slices (plans, subscriptions, ads,
-- releases, usage) are NOT created here — FAKE NOTHING (law #14): a table
-- ships with the slice that uses it.

-- ---------------------------------------------------------------- config
CREATE TABLE IF NOT EXISTS config_entries (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS config_releases (
  version      INT PRIMARY KEY,
  payload      JSONB NOT NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_by TEXT,
  note         TEXT
);

-- ------------------------------------------------------- providers / AI
CREATE TABLE IF NOT EXISTS ai_providers (
  id           UUID PRIMARY KEY,
  -- Provider-TYPE enum (§3.3). meta_model_api / fireworks / ollama /
  -- anthropic are presets of shape; `private` is Terrell's own endpoint
  -- (5090 / Tailscale / LAN / self-hosted). No type is privileged (§1 #13).
  kind         TEXT NOT NULL CHECK (kind IN
                 ('openai_compatible','meta_model_api','fireworks',
                  'ollama','anthropic','private')),
  display_name TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_endpoints (
  id              UUID PRIMARY KEY,
  provider_id     UUID NOT NULL REFERENCES ai_providers(id),
  label           TEXT NOT NULL,
  base_url        TEXT NOT NULL,
  -- Secret handling (§2.5 as directed for Admin-1): a key is either an
  -- env reference in credential_ref (e.g. 'env:FIREWORKS_API_KEY'), or a
  -- portal-entered key in api_key_secret. api_key_secret is server-side
  -- ONLY: no API route selects it into a response, and it never appears
  -- in the public config payload.
  credential_ref  TEXT,
  api_key_secret  TEXT,
  -- Route-shape flags this endpoint can serve (§3.3). No 'transcription'
  -- flag exists: voice input is a platform service, never a route (§4.2).
  capabilities    JSONB NOT NULL DEFAULT '[]'::jsonb,
  status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','active','disabled','retired')),
  timeout_ms      INT NOT NULL DEFAULT 10000,
  max_tokens_cap  INT,
  -- Model used only by endpoint-level probes while the endpoint is
  -- unassigned (assignments carry their own model_id).
  probe_model     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_routes (
  route_id        TEXT PRIMARY KEY,
  product_label   TEXT NOT NULL,
  shape           TEXT NOT NULL CHECK (shape IN
                    ('chat_completions','segmentation','local')),
  floor           TEXT NOT NULL,
  premium         BOOLEAN NOT NULL DEFAULT false,
  entitlement_key TEXT,
  enabled         BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS ai_route_assignments (
  route_id            TEXT PRIMARY KEY REFERENCES ai_routes(route_id),
  endpoint_id         UUID NOT NULL REFERENCES ai_endpoints(id),
  model_id            TEXT NOT NULL,
  params              JSONB NOT NULL DEFAULT '{}'::jsonb,
  fallback_endpoint_id UUID REFERENCES ai_endpoints(id),
  prior_endpoint_id    UUID REFERENCES ai_endpoints(id),
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by          TEXT
);

-- ---------------------------------------------------------------- health
CREATE TABLE IF NOT EXISTS endpoint_health_checks (
  id          BIGSERIAL PRIMARY KEY,
  endpoint_id UUID NOT NULL REFERENCES ai_endpoints(id),
  route_id    TEXT REFERENCES ai_routes(route_id),
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ok          BOOLEAN NOT NULL,
  http_status INT,
  latency_ms  INT,
  error_class TEXT CHECK (error_class IN
                ('ok','auth','blocked_or_quota','not_found','timeout',
                 'down','slow','bad_response')),
  detail      TEXT
);
CREATE INDEX IF NOT EXISTS idx_health_endpoint_route_time
  ON endpoint_health_checks (endpoint_id, route_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS health_alerts (
  id              UUID PRIMARY KEY,
  endpoint_id     UUID NOT NULL REFERENCES ai_endpoints(id),
  route_id        TEXT REFERENCES ai_routes(route_id),
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at       TIMESTAMPTZ,
  reason          TEXT NOT NULL,
  notified_at     TIMESTAMPTZ,
  notify_detail   TEXT,
  acknowledged_at TIMESTAMPTZ
);
-- One open alert per (endpoint x route) at a time (§4.4).
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_one_open_endpoint
  ON health_alerts (endpoint_id)
  WHERE closed_at IS NULL AND route_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_one_open_route
  ON health_alerts (endpoint_id, route_id)
  WHERE closed_at IS NULL AND route_id IS NOT NULL;

-- ----------------------------------------------------------------- admin
CREATE TABLE IF NOT EXISTS admin_users (
  id                    UUID PRIMARY KEY,
  username              TEXT NOT NULL UNIQUE,
  password_hash         TEXT NOT NULL,       -- argon2id (§2.4)
  totp_secret_enc       TEXT,                -- AES-256-GCM, key from env
  recovery_code_hashes  JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id            UUID PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES admin_users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id        BIGSERIAL PRIMARY KEY,
  at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor     TEXT NOT NULL,
  action    TEXT NOT NULL,
  entity    TEXT NOT NULL,
  entity_id TEXT,
  before    JSONB,
  after     JSONB
);
