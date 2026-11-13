import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const rows = await q(
    `SELECT * FROM admin_audit_log ORDER BY id DESC LIMIT 100`
  );
  return Response.json({ audit: rows });
}
