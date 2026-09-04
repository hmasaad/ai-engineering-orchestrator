import { executePlanAsync } from "@/lib/orchestrate";
import { saveLatest } from "@/lib/store";
import type { OrchestrationRun } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  let ticket = "";
  try {
    const body = (await request.json()) as { ticket?: string };
    ticket = body.ticket?.trim() ?? "";
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!ticket) return Response.json({ error: "Ticket is required." }, { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };

      try {
        let last: OrchestrationRun | null = null;
        const run = await executePlanAsync(
          ticket,
          (event) => {
            if (event.type === "analysis") send("analysis", event.run);
            if (event.type === "step") send("step", event.step);
            if (event.type === "artifact") send("artifact", event.run);
            if (event.type === "run") {
              last = event.run;
              send("run", event.run);
            }
            if (event.type === "error") send("error", { message: event.message });
          },
          180,
        );
        last = last ?? run;
        await saveLatest(last);
        send("done", { ok: true, id: last.id });
      } catch (error) {
        send("error", { message: error instanceof Error ? error.message : "Run failed." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
