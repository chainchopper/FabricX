import { requireAdmin, readOnlyGuard } from "@/lib/auth";
import { audit, q, q1 } from "@/lib/db";
import { listEndpoints } from "@/lib/endpoints";

// Edit / disable / retire one endpoint. Key handling: `api_key` sets a new
// stored key; `clear_api_key: true` removes it; omitting both leaves the
// stored key untouched. The value is never read back (see ../route.ts).
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const ro = readOnlyGuard();
  if (ro) return ro;
  const { id } = await params;

  const before = await q1<Record<string, unknown>>(
    `SELECT id, label, base_url, credential_ref, status, capabilities,
            timeout_ms, max_tokens_cap, probe_model, notes,
            (api_key_secret IS NOT NULL) AS has_stored_key
       FROM ai_endpoints WHERE id = $1`,
    [id]
  );
  if (!before) return Response.json({ error: "not found" }, { status: 404 });

  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return Response.json({ error: "invalid body" }, { status: 400 });

  // Disabling an endpoint that is actively assigned: the consequence is
  // explicit (§4.1) — the caller must confirm the route falls to its
  // floor, or name a replacement first (handled by assignment swap).
  const newStatus = b.status ? String(b.status) : null;
  if (
    newStatus &&
    newStatus !== "active" &&
    before.status === "active" &&
    b.confirm_floor !== true
  ) {
    const assigned = await q<{ route_id: string }>(
      `SELECT route_id FROM ai_route_assignments WHERE endpoint_id = $1`,
      [id]
    );
    if (assigned.length > 0) {
      return Response.json(
        {
          error:
            "endpoint is assigned to route(s): " +
            assigned.map((a) => a.route_id).join(", ") +
            ". Confirm the route(s) fall to their on-device floor (confirm_floor: true) or swap the assignment first.",
          assigned_routes: assigned.map((a) => a.route_id),
        },
        { status: 409 }
      );
    }
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  const set = (col: string, v: unknown) => {
    sets.push(`${col} = $${vals.length + 1}`);
    vals.push(v);
  };
  if (b.label !== undefined) set("label", String(b.label));
  if (b.base_url !== undefined) set("base_url", String(b.base_url));
  if (b.credential_ref !== undefined)
    set("credential_ref", b.credential_ref ? String(b.credential_ref) : null);
  if (b.api_key) set("api_key_secret", String(b.api_key));
  if (b.clear_api_key === true) set("api_key_secret", null);
  if (b.capabilities !== undefined)
    set("capabilities", JSON.stringify(b.capabilities));
  if (newStatus) set("status", newStatus);
  if (b.timeout_ms !== undefined) set("timeout_ms", Number(b.timeout_ms));
  if (b.max_tokens_cap !== undefined)
    set("max_tokens_cap", b.max_tokens_cap ? Number(b.max_tokens_cap) : null);
  if (b.probe_model !== undefined)
    set("probe_model", b.probe_model ? String(b.probe_model) : null);
  if (b.notes !== undefined) set("notes", b.notes ? String(b.notes) : null);
  if (sets.length === 0)
    return Response.json({ error: "nothing to change" }, { status: 400 });
  sets.push(`updated_at = now()`);
  vals.push(id);
  await q(
    `UPDATE ai_endpoints SET ${sets.join(", ")} WHERE id = $${vals.length}`,
    vals
  );
  await audit(gate.user.username, "endpoint.update", "ai_endpoints", id, before, {
    ...b,
    api_key: b.api_key ? "[stored]" : undefined,
  });
  const updated = (await listEndpoints()).find((e) => e.id === id);
  return Response.json({ endpoint: updated });
}
