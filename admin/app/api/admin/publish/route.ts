import { requireAdmin, readOnlyGuard } from "@/lib/auth";
import { publishConfig } from "@/lib/config";

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const ro = readOnlyGuard();
  if (ro) return ro;
  const b = (await req.json().catch(() => ({}))) as { note?: string };
  const { version, payload } = await publishConfig(
    gate.user.username,
    b.note ?? "published from portal"
  );
  return Response.json({ version, payload });
}
