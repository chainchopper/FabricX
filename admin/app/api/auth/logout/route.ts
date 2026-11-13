import { clearSessionCookie, currentAdmin, revokeCurrentSession } from "@/lib/auth";
import { audit } from "@/lib/db";

export async function POST() {
  const user = await currentAdmin();
  await revokeCurrentSession();
  await clearSessionCookie();
  if (user) {
    await audit(user.username, "auth.logout", "admin_users", user.id, null, null);
  }
  return Response.json({ ok: true });
}
