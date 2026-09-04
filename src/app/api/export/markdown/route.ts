import { runToMarkdown } from "@/lib/export-markdown";
import type { OrchestrationRun } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { run?: OrchestrationRun };
    if (!body.run) return Response.json({ error: "Run is required." }, { status: 400 });
    return new Response(runToMarkdown(body.run), {
      headers: { "Content-Type": "text/markdown; charset=utf-8" },
    });
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
