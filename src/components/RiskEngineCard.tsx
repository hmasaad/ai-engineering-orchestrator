import { RISK_LADDER } from "@/lib/risk";
import type { RiskEngineResult } from "@/lib/types";

export function RiskEngineCard({ engine }: { engine: RiskEngineResult }) {
  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">3. Risk engine</p>
      <p className="mt-2 font-serif text-2xl text-navy">
        {engine.level.toUpperCase()} · {engine.policy.action.replaceAll("_", " ")}
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Risk decides the rest of the workflow. LOW is automatic. MEDIUM needs tests and review. HIGH
        adds Security and a human. CRITICAL is a mandatory human after the quality gate.
      </p>

      <ol className="mt-4 space-y-2">
        {RISK_LADDER.map((row) => {
          const lit = row.level === engine.level;
          return (
            <li
              key={row.level}
              className={`rounded-xl border px-3 py-2 ${
                lit ? "border-navy bg-navy text-paper" : "border-rule bg-paper/80 text-ink-soft"
              }`}
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.12em]">
                {row.level} → {row.action.replaceAll("_", " ")}
              </p>
              <p className={`text-sm ${lit ? "text-paper/90" : ""}`}>
                {row.example} — {row.detail}
              </p>
            </li>
          );
        })}
      </ol>

      {engine.factors.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {engine.factors.map((item) => (
            <span
              key={item.id}
              className="rounded-full border border-copper/40 bg-copper/10 px-2.5 py-0.5 font-mono text-[11px] text-copper"
            >
              {item.label}
            </span>
          ))}
        </div>
      ) : null}

      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(
          {
            level: engine.level,
            score: engine.score,
            action: engine.policy.action,
            autonomous: engine.policy.autonomous,
            require_tests: engine.policy.require_tests,
            require_review: engine.policy.require_review,
            require_security: engine.policy.require_security,
            require_human: engine.policy.require_human,
          },
          null,
          2,
        )}
      </pre>
    </section>
  );
}
