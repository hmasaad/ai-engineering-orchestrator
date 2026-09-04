import { loadLatest } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const run = await loadLatest();
  return Response.json({ run });
}
