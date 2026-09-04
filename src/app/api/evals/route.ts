import { runEvalSuite } from "@/lib/eval";

export const runtime = "nodejs";

export async function GET() {
  return Response.json(runEvalSuite());
}
