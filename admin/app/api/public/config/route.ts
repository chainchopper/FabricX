import { publicConfig } from "@/lib/config";

// Public config API (spec §2.3): unauthenticated, serves the latest
// published release + HMAC signature. Contains route IDs + product
// labels only — no provider data exists in the payload by construction.
export async function GET() {
  const payload = await publicConfig();
  if (!payload) {
    return Response.json(
      { error: "no config published yet" },
      { status: 404 }
    );
  }
  return Response.json(payload, {
    headers: { "cache-control": "public, max-age=60" },
  });
}
