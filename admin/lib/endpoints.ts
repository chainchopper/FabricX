import { q } from "./db";
import { endpointConfigured } from "./probe";

// Endpoint serialization (spec §4.1, admin-only). The API key value is
// write-only: responses carry only `credential_configured` booleans and
// the credential_ref string (a reference, not a secret).

interface EndpointOut {
  id: string;
  provider_id: string;
  provider_kind: string;
  label: string;
  base_url: string;
  credential_ref: string | null;
  credential_configured: boolean;
  has_stored_key: boolean;
  capabilities: string[];
  status: string;
  timeout_ms: number;
  max_tokens_cap: number | null;
  probe_model: string | null;
  notes: string | null;
  assigned_routes: string[];
  created_at: string;
  updated_at: string;
}

export async function listEndpoints(): Promise<EndpointOut[]> {
  const rows = await q<Record<string, unknown>>(
    `SELECT e.*, p.kind AS provider_kind,
            (e.api_key_secret IS NOT NULL) AS has_stored_key
       FROM ai_endpoints e
       JOIN ai_providers p ON p.id = e.provider_id
      ORDER BY e.created_at`
  );
  const assignments = await q<{ route_id: string; endpoint_id: string }>(
    `SELECT route_id, endpoint_id FROM ai_route_assignments`
  );
  return rows.map((r) => ({
    id: r.id as string,
    provider_id: r.provider_id as string,
    provider_kind: r.provider_kind as string,
    label: r.label as string,
    base_url: r.base_url as string,
    credential_ref: (r.credential_ref as string) ?? null,
    credential_configured: endpointConfigured({
      credential_ref: (r.credential_ref as string) ?? null,
      api_key_secret: r.has_stored_key ? "set" : null,
    }),
    has_stored_key: !!r.has_stored_key,
    capabilities: (r.capabilities as string[]) ?? [],
    status: r.status as string,
    timeout_ms: r.timeout_ms as number,
    max_tokens_cap: (r.max_tokens_cap as number) ?? null,
    probe_model: (r.probe_model as string) ?? null,
    notes: (r.notes as string) ?? null,
    assigned_routes: assignments
      .filter((a) => a.endpoint_id === r.id)
      .map((a) => a.route_id),
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }));
}

