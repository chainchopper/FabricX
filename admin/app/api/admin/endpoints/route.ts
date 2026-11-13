import { requireAdmin, readOnlyGuard } from "@/lib/auth";
import { audit, newId, q, q1 } from "@/lib/db";
import { listEndpoints } from "@/lib/endpoints";

// Endpoints CRUD (spec §4.1). ADMIN-ONLY surface. The API key value is
// write-only: accepted on create/edit, stored server-side, and NEVER
// returned — responses carry only `credential_configured` booleans and
// the credential_ref string (a reference, not a secret).

const PROVIDER_KINDS = [
  "openai_compatible",
  "meta_model_api",
  "fireworks",
  "ollama",
  "anthropic",
  "private",
];

async function findOrCreateProvider(kind: string, displayName?: string) {
  const existing = await q1<{ id: string }>(
    `SELECT id FROM ai_providers WHERE kind = $1 ORDER BY created_at LIMIT 1`,
    [kind]
  );
  if (existing) return existing.id;
  const id = newId();
  await q(`INSERT INTO ai_providers (id, kind, display_name) VALUES ($1,$2,$3)`, [
    id,
    kind,
    displayName ?? kind,
  ]);
  return id;
}

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  return Response.json({ endpoints: await listEndpoints() });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const ro = readOnlyGuard();
  if (ro) return ro;

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return Response.json({ error: "invalid body" }, { status: 400 });
  const kind = String(b.provider_kind ?? "openai_compatible");
  if (!PROVIDER_KINDS.includes(kind)) {
    return Response.json({ error: `unknown provider kind: ${kind}` }, { status: 400 });
  }
  if (!b.label || !b.base_url) {
    return Response.json({ error: "label and base_url are required" }, { status: 400 });
  }
  const providerId = await findOrCreateProvider(
    kind,
    b.provider_name ? String(b.provider_name) : undefined
  );
  const id = newId();
  await q(
    `INSERT INTO ai_endpoints
       (id, provider_id, label, base_url, credential_ref, api_key_secret,
        capabilities, status, timeout_ms, max_tokens_cap, probe_model, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id,
      providerId,
      String(b.label),
      String(b.base_url),
      b.credential_ref ? String(b.credential_ref) : null,
      b.api_key ? String(b.api_key) : null,
      JSON.stringify(Array.isArray(b.capabilities) ? b.capabilities : []),
      ["draft", "active", "disabled", "retired"].includes(String(b.status))
        ? String(b.status)
        : "draft",
      Number(b.timeout_ms ?? 10000),
      b.max_tokens_cap ? Number(b.max_tokens_cap) : null,
      b.probe_model ? String(b.probe_model) : null,
      b.notes ? String(b.notes) : null,
    ]
  );
  await audit(gate.user.username, "endpoint.create", "ai_endpoints", id, null, {
    label: b.label,
    base_url: b.base_url,
    provider_kind: kind,
    credential: b.api_key ? "stored key" : b.credential_ref ? "ref" : "none",
  });
  const created = (await listEndpoints()).find((e) => e.id === id);
  return Response.json({ endpoint: created }, { status: 201 });
}
