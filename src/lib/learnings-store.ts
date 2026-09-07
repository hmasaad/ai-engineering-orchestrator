import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { seedLearnings } from "./rag";
import type { Learning } from "./types";

const FILE = path.join(process.cwd(), "data", "learnings.json");
const CAP = 200;

async function readLive(): Promise<Learning[]> {
  try {
    const raw = await readFile(FILE, "utf8");
    const parsed = JSON.parse(raw) as { learnings?: Learning[] };
    return Array.isArray(parsed.learnings) ? parsed.learnings : [];
  } catch {
    return [];
  }
}

export async function loadLiveLearnings(): Promise<Learning[]> {
  return readLive();
}

export async function loadCorpus(): Promise<Learning[]> {
  const live = await readLive();
  const seen = new Set(live.map((item) => item.ticket.toLowerCase().trim()));
  const seed = seedLearnings().filter((item) => !seen.has(item.ticket.toLowerCase().trim()));
  return [...live, ...seed];
}

export async function saveLearning(learning: Learning): Promise<void> {
  const live = await readLive();
  const next = [learning, ...live.filter((item) => item.id !== learning.id)].slice(0, CAP);
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify({ learnings: next }, null, 2), "utf8");
}
