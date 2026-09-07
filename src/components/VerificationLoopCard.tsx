import { compactVerification, VERIFICATION_STAGES } from "@/lib/verification";
import type { VerificationLoop } from "@/lib/types";

export function VerificationLoopCard({
  loop,
  live = false,
}: {
  loop: VerificationLoop;
  live?: boolean;
}) {
  const passed = loop.outcome === "passed";
  const fixing = loop.outcome === "fixing";
  const last = loop.cycles.at(-1);

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        Verification loop
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">
        {passed
          ? loop.attempts > 0
            ? `PASS after ${loop.attempts} fix`
            : "PASS"
          : fixing
            ? `${last?.issues.length ?? 0} issues found · fix and re-run`
            : loop.outcome === "exhausted"
              ? "Loop exhausted · fail closed"
              : "Developer is not done until evals PASS"}
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        {live
          ? "Security Review stays on the stem before Developer. After code: Tests → Code Review → Evals. Fail means Fix, then re-run — not Done."
          : "Do not stop at Developer → Done. The loop is Tests → Code Review → Evals. PASS continues. FAIL sends the orchestrator back to Developer."}
      </p>

      <ol className="mt-4 flex flex-col items-center">
        {VERIFICATION_STAGES.map((stage, index) => (
          <li key={stage} className="flex flex-col items-center">
            {index > 0 ? <div className="h-3 w-px bg-rule" aria-hidden /> : null}
            <p className="rounded-lg border border-rule bg-paper-2 px-3 py-1.5 font-mono text-[11px] text-navy">
              {stage}
            </p>
          </li>
        ))}
        <div className="h-3 w-px bg-rule" aria-hidden />
        <p className="rounded-lg border border-navy bg-navy px-3 py-1.5 font-mono text-[11px] text-paper">
          PASS?
        </p>
      </ol>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div
          className={`rounded-xl border px-3 py-3 text-center ${
            fixing ? "border-copper bg-copper/10 text-copper" : "border-rule bg-paper/80 text-ink-soft"
          }`}
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.12em]">No</p>
          <p className="mt-1 font-medium">Fix</p>
          <p className="mt-1 text-[11px] leading-4">Developer → Tests → Review → Evals</p>
        </div>
        <div
          className={`rounded-xl border px-3 py-3 text-center ${
            passed ? "border-navy bg-navy text-paper" : "border-rule bg-paper/80 text-ink-soft"
          }`}
        >
          <p className={`font-mono text-[10px] uppercase tracking-[0.12em] ${passed ? "text-paper/70" : ""}`}>
            Yes
          </p>
          <p className="mt-1 font-medium">Complete</p>
          <p className={`mt-1 text-[11px] leading-4 ${passed ? "text-paper/80" : ""}`}>
            Human gate, then Action. Never merge.
          </p>
        </div>
      </div>

      {last ? (
        <p className="mt-4 text-sm text-navy">
          {last.reason}
          {last.issues.length > 0 ? ` ${last.issues.join("; ")}.` : ""}
        </p>
      ) : null}

      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(compactVerification(loop), null, 2)}
      </pre>
    </section>
  );
}
