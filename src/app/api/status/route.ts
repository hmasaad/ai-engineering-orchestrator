export const runtime = "nodejs";

export async function GET() {
  return Response.json({ configured: true, deterministic: true });
}
