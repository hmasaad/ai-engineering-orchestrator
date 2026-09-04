import { scoreTicket } from "@/lib/eval";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ticket?: string };
    const ticket = body.ticket?.trim() ?? "";
    if (!ticket) return Response.json({ error: "Ticket is required." }, { status: 400 });
    return Response.json(scoreTicket(ticket));
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
}
