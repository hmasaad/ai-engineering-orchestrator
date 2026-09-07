import { compactRisk, RISK_CATALOG, RISK_LANES } from "@/lib/risk";
import type { Risk, RiskEngineResult } from "@/lib/types";

const LEVEL_MARK: Record<Risk, string> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  critical: "CRITICAL",
};

export function RiskEngineCard({ engine }: { engine: RiskEngineResult }) {
  const lane = engine.policy.lane;
  const laneMeta = RISK_LANES.find((item) => item.id === lane);

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">4. Risk engine</p>
      <p className="mt-2 font-serif text-2xl text-navy">
        {LEVEL_MARK[engine.level]} · {laneMeta?.label ?? engine.policy.action.replaceAll("_", " ")}
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Every task gets a risk score. The score picks a lane: Auto Execute, Review, or Human
        Approval. That is what keeps the orchestrator a controlled autonomous system.
      </p>

      <div className="mt-4 flex flex-col items-center text-center">
        <p className="rounded-lg border border-rule bg-paper-2 px-3 py-1.5 font-mono text-[11px] text-navy">
          Task
        </p>
        <div className="h-3 w-px bg-rule" aria-hidden />
        <p className="rounded-lg border border-navy bg-navy px-3 py-1.5 font-mono text-[11px] text-paper">
          Risk Engine
        </p>
        <div className="h-3 w-px bg-rule" aria-hidden />
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {RISK_LANES.map((item) => {
          const lit = item.id === lane;
          return (
            <div
              key={item.id}
              className={`rounded-xl border px-3 py-3 text-center ${
                lit ? "border-navy bg-navy text-paper" : "border-rule bg-paper/80 text-ink-soft"
              }`}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.12em]">
                {item.levels.map((level) => LEVEL_MARK[level]).join(" / ")}
              </p>
              <p className="mt-1 font-medium">{item.label}</p>
              <p className={`mt-1 text-[11px] leading-4 ${lit ? "text-paper/80" : ""}`}>{item.detail}</p>
            </div>
          );
        })}
      </div>

      <table className="mt-4 w-full text-left text-sm">
        <thead>
          <tr className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
            <th className="pb-1 font-medium">Change</th>
            <th className="pb-1 font-medium">Risk</th>
            <th className="pb-1 font-medium">Lane</th>
          </tr>
        </thead>
        <tbody>
          {RISK_CATALOG.map((row) => {
            const match = row.level === engine.level;
            return (
              <tr key={row.change} className={match ? "text-navy" : "text-ink-soft"}>
                <td className={`py-1 ${match ? "font-medium" : ""}`}>{row.change}</td>
                <td className="py-1 font-mono text-[11px] uppercase">{row.level}</td>
                <td className="py-1 font-mono text-[11px]">
                  {RISK_LANES.find((item) => item.id === row.lane)?.label}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

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
        {JSON.stringify(compactRisk(engine), null, 2)}
      </pre>
    </section>
  );
}
