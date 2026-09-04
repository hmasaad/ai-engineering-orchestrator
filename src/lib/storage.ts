import type { OrchestrationRun } from "./types";

const KEY = "orchestrator:latest";

export function saveRun(run: OrchestrationRun) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(run));
}

export function loadRun(): OrchestrationRun | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as OrchestrationRun;
  } catch {
    return null;
  }
}

export async function fetchLatest(): Promise<OrchestrationRun | null> {
  const local = loadRun();
  try {
    const response = await fetch("/api/latest");
    if (!response.ok) return local;
    const payload = (await response.json()) as { run?: OrchestrationRun | null };
    return payload.run ?? local;
  } catch {
    return local;
  }
}

export async function fetchStatus() {
  const response = await fetch("/api/status");
  if (!response.ok) return { configured: false };
  return (await response.json()) as { configured: boolean };
}
