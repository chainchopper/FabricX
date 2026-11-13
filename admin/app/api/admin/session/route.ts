import { currentAdmin } from "@/lib/auth";

export async function GET() {
  const user = await currentAdmin();
  if (!user) return Response.json({ admin: null }, { status: 401 });
  return Response.json({ admin: { username: user.username } });
}
