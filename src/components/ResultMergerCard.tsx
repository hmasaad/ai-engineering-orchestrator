import { compactMerge, isMerged } from "@/lib/merge";
import type { SharedAgentState } from "@/lib/types";

export function ResultMergerCard({
  state,
  live = false,
}: {
  state: SharedAgentState;
  live?: boolean;
}) {
  const merged = isMerged(state.merged) ? state.merged : compactMerge(state);
  const empty = !isMerged(state.merged);

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        6. Result merger
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">
        {empty ? "Waiting for specialists" : merged.recommendation === "hold" ? "Hold" : "Ready for the gate"}
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        {live
          ? "Agent outputs are folded into one result before the quality gate."
          : "Empty until Agent A / B / C have written to shared state."}
      </p>
      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(
          empty
            ? {
                files_changed: [],
                tests: [],
                security_findings: [],
                review: {},
                recommendation: "quality_gate",
              }
            : merged,
          null,
          2,
        )}
      </pre>
    </section>
  );
}
