import { asTaskInput, understandTask } from "@/lib/classify";
import { retrieveLearnings, seedLearnings } from "@/lib/rag";
import { loadLiveLearnings } from "@/lib/learnings-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const task = url.searchParams.get("task")?.trim() ?? "";
  const live = await loadLiveLearnings();
  const seed = seedLearnings();
  if (!task) {
    return Response.json({ seed: seed.length, live: live.length, hits: [] });
  }
  const analysis = understandTask(asTaskInput({ task }));
  const hits = retrieveLearnings(task, analysis, live);
  return Response.json({
    seed: seed.length,
    live: live.length,
    hits: hits.map((hit) => ({
      ticket: hit.ticket,
      pattern: hit.pattern,
      risk: hit.risk,
      score: Math.round(hit.score),
      summary: hit.summary,
      lessons: hit.lessons.slice(0, 3),
      source: hit.source,
    })),
  });
}
