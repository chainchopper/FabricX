import { requireAdmin, readOnlyGuard } from "@/lib/auth";
import { db, q, q1 } from "@/lib/db";
import {
  probeAssignment,
  type EndpointRow,
} from "@/lib/health";

// Route assignment swap (spec §4.5). Step 1 is a REAL probe of the candidate
// endpoint in the target route's shape — it must pass before anything is
// written. On confirm, one transaction updates the assignment
// (prior_endpoint_id <- old endpoint), writes the audit row, and the probe
// of record stands as the assignment's first health check.
export async function PUT(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const ro = readOnlyGuard();
  if (ro) return ro;

  const b = (await req.json().catch(() => null)) as {
    route_id?: string;
    endpoint_id?: string;
    model_id?: string;
    params?: Record<string, unknown>;
    fallback_endpoint_id?: string | null;
  } | null;
  if (!b?.route_id || !b?.endpoint_id || !b?.model_id) {
    return Response.json(
      { error: "route_id, endpoint_id and model_id are required" },
      { status: 400 }
    );
  }

  const route = await q1<{ route_id: string; shape: string; product_label: string }>(
    `SELECT route_id, shape, product_label FROM ai_routes WHERE route_id = $1`,
    [b.route_id]
  );
  if (!route) return Response.json({ error: "unknown route" }, { status: 404 });
  if (route.shape === "local") {
    return Response.json(
      { error: "this route is on-device by construction — no endpoint can be designated for it (§4.2)" },
      { status: 422 }
    );
  }

  const endpoint = await q1<EndpointRow>(
    `SELECT * FROM ai_endpoints WHERE id = $1`,
    [b.endpoint_id]
  );
  if (!endpoint) return Response.json({ error: "unknown endpoint" }, { status: 404 });
  if (endpoint.status === "retired") {
    return Response.json({ error: "endpoint is retired" }, { status: 422 });
  }
  const neededCap = route.shape === "segmentation" ? "segmentation" : "chat";
  if (!(endpoint.capabilities ?? []).includes(neededCap)) {
    return Response.json(
      {
        error: `endpoint "${endpoint.label}" does not declare the "${neededCap}" capability this route's shape requires`,
      },
      { status: 422 }
    );
  }

  // §4.5 step 1: probe in the route's shape — must pass.
  const probeRow = await probeAssignment(
    route,
    { endpoint_id: endpoint.id, model_id: b.model_id },
    endpoint
  );
  if (!probeRow?.ok) {
    return Response.json(
      {
        error: "probe failed — assignment not changed",
        probe: probeRow,
      },
      { status: 422 }
    );
  }

  const before = await q1(
    `SELECT * FROM ai_route_assignments WHERE route_id = $1`,
    [b.route_id]
  );

  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO ai_route_assignments
         (route_id, endpoint_id, model_id, params, fallback_endpoint_id,
          prior_endpoint_id, changed_at, changed_by)
       VALUES ($1,$2,$3,$4,$5,$6, now(), $7)
       ON CONFLICT (route_id) DO UPDATE SET
         endpoint_id = EXCLUDED.endpoint_id,
         model_id = EXCLUDED.model_id,
         params = EXCLUDED.params,
         fallback_endpoint_id = EXCLUDED.fallback_endpoint_id,
         prior_endpoint_id = EXCLUDED.prior_endpoint_id,
         changed_at = now(),
         changed_by = EXCLUDED.changed_by`,
      [
        b.route_id,
        b.endpoint_id,
        b.model_id,
        JSON.stringify(b.params ?? {}),
        b.fallback_endpoint_id ?? null,
        before?.endpoint_id ?? null,
        gate.user.username,
      ]
    );
    await client.query(
      `INSERT INTO admin_audit_log (actor, action, entity, entity_id, before, after)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        gate.user.username,
        "route.assign",
        "ai_route_assignments",
        b.route_id,
        before ? JSON.stringify(before) : null,
        JSON.stringify({
          endpoint_id: b.endpoint_id,
          model_id: b.model_id,
          probe_check_id: probeRow.id,
        }),
      ]
    );
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  const after = await q1(
    `SELECT * FROM ai_route_assignments WHERE route_id = $1`,
    [b.route_id]
  );
  return Response.json({ assignment: after, probe: probeRow });
}
