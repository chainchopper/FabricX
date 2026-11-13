import { probeAll } from "@/lib/health";

// Platform-cron probe endpoint (spec §4.3 scheduling): the hosting
// platform's cron (e.g. Vercel Cron) or any external scheduler hits this
// every 15 minutes with the shared secret in the x-cron-secret header.
// No GitHub Actions (law #8).
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Accept the shared-secret header (external schedulers) or Vercel Cron's
  // Authorization: Bearer <CRON_SECRET> (sent automatically when the
  // CRON_SECRET env var exists on the project).
  const presented =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secret || presented !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await probeAll();
  return Response.json({ ok: true, ...result, at: new Date().toISOString() });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
