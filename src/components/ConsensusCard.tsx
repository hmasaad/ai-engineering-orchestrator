import { compactConsensus } from "@/lib/consensus";
import type { ConsensusResult } from "@/lib/types";

const STEM = ["Architect", "Performance", "Security", "Developer", "Consensus Engine", "Recommendation"] as const;

export function ConsensusCard({
  result,
  live = false,
}: {
  result: ConsensusResult;
  live?: boolean;
}) {
  const debating = result.recommendation !== "no_debate";
  const decided = result.recommendation === "do_not_migrate" || result.recommendation === "migrate";
  const compact = compactConsensus(result);

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        Agent debate / consensus
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">
        {decided
          ? `${result.decision} · ${result.confidence}%`
          : debating
            ? "Pending specialist debate"
            : "No debate on this ticket"}
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        {live
          ? "High-risk decisions do not trust one agent. Architect, Performance, Security, and Developer speak. Consensus Engine recommends. A person still accepts."
          : "For questions like “Should we migrate from REST to GraphQL?”, run a debate — not a ship plan."}
      </p>

      <ol className="mt-4 flex flex-col items-center">
        {STEM.map((stage, index) => (
          <li key={stage} className="flex flex-col items-center">
            {index > 0 ? <div className="h-3 w-px bg-rule" aria-hidden /> : null}
            <p
              className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] ${
                stage === "Consensus Engine" || stage === "Recommendation"
                  ? decided
                    ? "border-navy bg-navy text-paper"
                    : "border-rule bg-paper-2 text-navy"
                  : "border-rule bg-paper-2 text-navy"
              }`}
            >
              {stage}
            </p>
          </li>
        ))}
      </ol>

      {result.voices.length > 0 ? (
        <ul className="mt-4 space-y-2 border-t border-rule pt-4">
          {result.voices.map((voice) => (
            <li key={voice.agent} className="rounded-xl border border-rule bg-paper/80 px-3 py-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                {voice.label} · {voice.stance}
              </p>
              <p className="mt-1 text-sm text-navy">{voice.summary}</p>
            </li>
          ))}
        </ul>
      ) : null}

      {decided ? (
        <p className="mt-4 font-mono text-[11px] text-ink-soft">
          {compact.decision} · confidence {compact.confidence}% · no PR
        </p>
      ) : null}
    </section>
  );
}
