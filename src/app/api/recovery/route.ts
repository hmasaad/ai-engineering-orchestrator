import { asTaskInput } from "@/lib/classify";
import { executePlan } from "@/lib/orchestrate";
import { compactRecovery, draftRecovery } from "@/lib/recovery";
import type { TaskInput } from "@/lib/types";

export const runtime = "nodejs";

function fromBody(body: {
  task?: string;
  ticket?: string;
  repository?: string;
  branch?: string;
}): TaskInput {
  return asTaskInput({
    task: body.task ?? body.ticket ?? "",
    repository: body.repository,
    branch: body.branch,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      task?: string;
      ticket?: string;
      repository?: string;
      branch?: string;
    };
    const input = fromBody(body);
    if (!input.task.trim()) {
      return Response.json({ error: "task is required." }, { status: 400 });
    }
    const run = executePlan(input);
    return Response.json(compactRecovery(run.recovery ?? draftRecovery(run.plan)));
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
