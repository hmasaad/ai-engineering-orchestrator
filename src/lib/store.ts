import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { OrchestrationRun } from "./types";

const FILE = path.join(process.cwd(), "data", "latest.json");

export async function saveLatest(run: OrchestrationRun) {
  await mkdir(path.dirname(FILE), { recursive: true });
  await writeFile(FILE, JSON.stringify(run, null, 2), "utf8");
}

export async function loadLatest(): Promise<OrchestrationRun | null> {
  try {
    const raw = await readFile(FILE, "utf8");
    return JSON.parse(raw) as OrchestrationRun;
  } catch {
    return null;
  }
}
