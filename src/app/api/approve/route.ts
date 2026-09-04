import { applyApproval } from "@/lib/orchestrate";
import { saveLatest } from "@/lib/store";
import type { OrchestrationRun } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      run?: OrchestrationRun;
      decision?: "approved" | "rejected";
      note?: string;
    };
    if (!body.run) return Response.json({ error: "Run is required." }, { status: 400 });
    const next = body.decision && body.run.status === "awaiting_approval"
      ? applyApproval(body.run, body.decision, body.note)
      : body.run;
    await saveLatest(next);
    return Response.json(next);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
