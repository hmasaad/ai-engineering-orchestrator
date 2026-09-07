import { compactEvidence } from "@/lib/evidence";
import type { EvidenceEngineResult } from "@/lib/types";

const PHASES = ["Claim", "Evidence", "Validation"] as const;

export function EvidenceEngineCard({
  engine,
  live = false,
}: {
  engine: EvidenceEngineResult;
  live?: boolean;
}) {
  const supported = engine.verdict === "supported";
  const unsupported = engine.verdict === "unsupported";

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        Evidence engine
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">
        {unsupported
          ? "Agent said it. System does not."
          : supported
            ? "System has evidence that it works"
            : "Waiting for system evidence"}
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        {live
          ? "A specialist claim is not enough. The control plane only trusts files, tests, evals, integration, and security on the blackboard."
          : "Do not let an agent claim “the bug is fixed” without evidence. Claim, then evidence, then validation."}
      </p>

      <div className="mt-4 flex flex-col items-center text-center">
        {PHASES.map((phase, index) => (
          <div key={phase} className="flex flex-col items-center">
            {index > 0 ? <div className="h-3 w-px bg-rule" aria-hidden /> : null}
            <p
              className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] ${
                phase === "Validation" && live
                  ? supported
                    ? "border-navy bg-navy text-paper"
                    : unsupported
                      ? "border-stamp bg-stamp/15 text-stamp"
                      : "border-rule bg-paper-2 text-navy"
                  : phase === "Claim"
                    ? "border-rule bg-paper-2 text-navy"
                    : "border-navy bg-navy text-paper"
              }`}
            >
              {phase}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div
          className={`rounded-xl border px-3 py-3 ${
            engine.agent_says && !engine.system_has_evidence
              ? "border-stamp bg-stamp/10"
              : "border-rule bg-paper/80"
          }`}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
            Agent says it works
          </p>
          <p className="mt-2 text-sm text-navy">{engine.claim}</p>
          <p className="mt-2 font-mono text-[11px] text-ink-soft">
            {engine.agent_says ? "Claimed" : "No ship claim yet"}
          </p>
        </div>
        <div
          className={`rounded-xl border px-3 py-3 ${
            engine.system_has_evidence ? "border-navy bg-navy text-paper" : "border-rule bg-paper/80"
          }`}
        >
          <p
            className={`font-mono text-[10px] uppercase tracking-[0.12em] ${
              engine.system_has_evidence ? "text-paper/70" : "text-ink-soft"
            }`}
          >
            System has evidence
          </p>
          <p className="mt-2 text-sm">{supported ? "Supported" : engine.verdict}</p>
          <p className={`mt-2 font-mono text-[11px] ${engine.system_has_evidence ? "text-paper/80" : "text-ink-soft"}`}>
            {engine.system_has_evidence ? "Blackboard + evals + security" : "Not yet"}
          </p>
        </div>
      </div>

      {engine.items.length > 0 ? (
        <ul className="mt-4 space-y-1.5 text-sm">
          {engine.items.map((row) => (
            <li key={row.id} className={row.held ? "text-navy" : "text-ink-soft"}>
              <span className="font-mono text-[11px]">{row.held ? "✓" : "○"}</span> {row.label}
            </li>
          ))}
        </ul>
      ) : null}

      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(compactEvidence(engine), null, 2)}
      </pre>
    </section>
  );
}
