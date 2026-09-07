import { compactRecovery, FAILURE_KINDS, TEST_CAUSE_ROUTES, targetLabel } from "@/lib/recovery";
import type { FailureRecovery } from "@/lib/types";

export function FailureRecoveryCard({
  recovery,
  live = false,
}: {
  recovery: FailureRecovery;
  live?: boolean;
}) {
  const last = recovery.last ?? recovery.events.at(-1)?.decision ?? null;
  const recovered = recovery.outcome === "recovered";
  const rerouting = recovery.outcome === "rerouting";
  const held = recovery.outcome === "held";
  const firedCause = last?.kind === "test_failure" || last?.kind === "dependency_failure" ? last.cause : null;

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        Failure recovery
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">
        {recovered
          ? `Recovered · ${recovery.events.length} classif${recovery.events.length === 1 ? "y" : "ies"}`
          : rerouting
            ? `${last ? targetLabel(last.target) : "Reroute"} · not the same prompt`
            : held
              ? "Held · do not retry the same prompt"
              : "Agents fail. Classify, then route."}
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        {live
          ? "A test failure is not a Developer retry. The classifier names compilation, test logic, environment, dependency, or unknown — then picks who acts."
          : "Do not retry the same prompt. Tool, agent, timeout, invalid output, tests, security, conflicts, token limit, and dependencies each have a destination."}
      </p>

      <ol className="mt-4 flex flex-col items-center">
        {["Test Agent", "Tests failed", "Failure Classifier"].map((stage, index) => (
          <li key={stage} className="flex flex-col items-center">
            {index > 0 ? <div className="h-3 w-px bg-rule" aria-hidden /> : null}
            <p
              className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] ${
                stage === "Failure Classifier" ? "border-navy bg-navy text-paper" : "border-rule bg-paper-2 text-navy"
              }`}
            >
              {stage}
            </p>
          </li>
        ))}
      </ol>

      <ul className="mt-4 space-y-1.5">
        {TEST_CAUSE_ROUTES.map((row) => {
          const active = firedCause === row.cause;
          return (
            <li
              key={row.cause}
              className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm ${
                active ? "border-navy bg-navy text-paper" : "border-rule bg-paper/80 text-navy"
              }`}
            >
              <span className="font-medium">{row.label}</span>
              <span className={`font-mono text-[11px] ${active ? "text-paper/80" : "text-ink-soft"}`}>
                → {targetLabel(row.target)}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
        Failure kinds the orchestrator understands
      </p>
      <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {FAILURE_KINDS.map((item) => {
          const active = last?.kind === item.id;
          return (
            <li
              key={item.id}
              className={`rounded-xl border px-3 py-2 ${
                active ? "border-copper bg-copper/10" : "border-rule bg-paper/80"
              }`}
            >
              <p className="font-medium text-navy">{item.label}</p>
              <p className="mt-1 font-mono text-[10px] text-ink-soft">→ {targetLabel(item.target)}</p>
            </li>
          );
        })}
      </ul>

      {recovery.events.length > 0 ? (
        <ol className="mt-4 space-y-2">
          {recovery.events.map((event, index) => (
            <li key={`${event.stage}-${index}`} className="text-sm text-navy">
              <span className="font-mono text-[11px] text-ink-soft">
                {event.stage} · {event.decision.cause}
              </span>
              {" — "}
              {event.decision.reason}
            </li>
          ))}
        </ol>
      ) : null}

      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(compactRecovery(recovery), null, 2)}
      </pre>
    </section>
  );
}