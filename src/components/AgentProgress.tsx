import type { AgentStepEvent } from "@/lib/types";

export function AgentProgress({
  current,
  message,
  running,
}: {
  current: AgentStepEvent | null;
  message: string;
  running: boolean;
}) {
  if (!running && !message) return null;
  return (
    <div className="rounded-2xl border border-navy/20 bg-navy text-paper px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-paper/70">
        {running ? "Running" : "Idle"}
      </p>
      <p className="mt-1 text-sm">{message || current?.label}</p>
    </div>
  );
}
