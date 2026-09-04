import { asTaskInput } from "@/lib/classify";
import { planTicket } from "@/lib/orchestrate";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      task?: string;
      ticket?: string;
      repository?: string;
      branch?: string;
    };
    const input = asTaskInput({
      task: body.task ?? body.ticket ?? "",
      repository: body.repository,
      branch: body.branch,
    });
    if (!input.task.trim()) return Response.json({ error: "task is required." }, { status: 400 });
    return Response.json(planTicket(input));
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
