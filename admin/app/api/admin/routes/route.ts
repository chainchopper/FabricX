import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";

// Routes + assignments + latest health per (endpoint x route) + open alerts.
// This is the data the dashboard and routes views render (§4.1 panel).
export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;

  const routes = await q(
    `SELECT * FROM ai_routes ORDER BY route_id`
  );
  const assignments = await q(
    `SELECT a.*, e.label AS endpoint_label, e.base_url AS endpoint_base_url,
            e.status AS endpoint_status
       FROM ai_route_assignments a
       JOIN ai_endpoints e ON e.id = a.endpoint_id`
  );
  const latest = await q(
    `SELECT DISTINCT ON (endpoint_id, route_id)
            endpoint_id, route_id, ok, http_status, latency_ms,
            error_class, detail, checked_at
       FROM endpoint_health_checks
      ORDER BY endpoint_id, route_id, checked_at DESC`
  );
  const alerts = await q(
    `SELECT a.*, e.label AS endpoint_label, r.product_label AS route_label
       FROM health_alerts a
       JOIN ai_endpoints e ON e.id = a.endpoint_id
       LEFT JOIN ai_routes r ON r.route_id = a.route_id
      WHERE a.closed_at IS NULL
      ORDER BY a.opened_at`
  );
  return Response.json({ routes, assignments, latest_checks: latest, open_alerts: alerts });
}
