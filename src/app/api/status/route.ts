import { runtimeStatus } from "@/lib/runtime";
import { seedLearnings } from "@/lib/rag";
import { loadLiveLearnings } from "@/lib/learnings-store";

export const runtime = "nodejs";

export async function GET() {
  const live = await loadLiveLearnings();
  const seed = seedLearnings();
  return Response.json({
    ...runtimeStatus(),
    configured: true,
    learnings: {
      seed: seed.length,
      live: live.length,
      total: seed.length + live.length,
    },
  });
}
