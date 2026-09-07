import { asTaskInput, understandTask } from "@/lib/classify";
import { compactTaskPlan } from "@/lib/planner";
import type { TaskInput } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      task?: string;
      ticket?: string;
      repository?: string;
      branch?: string;
    };
    const input: TaskInput = asTaskInput({
      task: body.task ?? body.ticket ?? "",
      repository: body.repository,
      branch: body.branch,
    });
    if (!input.task.trim()) return Response.json({ error: "task is required." }, { status: 400 });
    return Response.json(compactTaskPlan(understandTask(input).taskPlan));
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
