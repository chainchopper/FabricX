import { requireAdmin, readOnlyGuard } from "@/lib/auth";
import { q1 } from "@/lib/db";
import {
  probeAll,
  probeAssignment,
  probeEndpointLevel,
  type EndpointRow,
} from "@/lib/health";

// On-demand probes (§4.3): {all:true} | {route_id} | {endpoint_id}.
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const ro = readOnlyGuard();
  if (ro) return ro;
  const b = (await req.json().catch(() => ({}))) as {
    all?: boolean;
    route_id?: string;
    endpoint_id?: string;
  };

  if (b.all) {
    return Response.json(await probeAll());
  }
  if (b.route_id) {
    const assignment = await q1<{ endpoint_id: string; model_id: string }>(
      `SELECT endpoint_id, model_id FROM ai_route_assignments WHERE route_id = $1`,
      [b.route_id]
    );
    if (!assignment) {
      return Response.json(
        { error: "route has no assignment to probe" },
        { status: 404 }
      );
    }
    const route = await q1<{ route_id: string; shape: string }>(
      `SELECT route_id, shape FROM ai_routes WHERE route_id = $1`,
      [b.route_id]
    );
    const endpoint = await q1<EndpointRow>(
      `SELECT * FROM ai_endpoints WHERE id = $1`,
      [assignment.endpoint_id]
    );
    if (!route || !endpoint) {
      return Response.json({ error: "assignment target missing" }, { status: 404 });
    }
    const check = await probeAssignment(route, assignment, endpoint);
    return Response.json({ check });
  }
  if (b.endpoint_id) {
    const endpoint = await q1<EndpointRow>(
      `SELECT * FROM ai_endpoints WHERE id = $1`,
      [b.endpoint_id]
    );
    if (!endpoint) return Response.json({ error: "unknown endpoint" }, { status: 404 });
    const check = await probeEndpointLevel(endpoint);
    return Response.json({ check });
  }
  return Response.json(
    { error: "pass {all:true}, {route_id}, or {endpoint_id}" },
    { status: 400 }
  );
}
