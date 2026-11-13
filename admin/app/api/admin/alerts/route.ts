import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const alerts = await q(
    `SELECT a.*, e.label AS endpoint_label, r.product_label AS route_label
       FROM health_alerts a
       JOIN ai_endpoints e ON e.id = a.endpoint_id
       LEFT JOIN ai_routes r ON r.route_id = a.route_id
      ORDER BY (a.closed_at IS NULL) DESC, a.opened_at DESC
      LIMIT 100`
  );
  return Response.json({ alerts });
}
