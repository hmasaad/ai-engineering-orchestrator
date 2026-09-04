import { AGENTS } from "@/lib/roster";
import type { TaskAnalysis } from "@/lib/types";

const RISK_TONE: Record<string, string> = {
  low: "text-sage",
  medium: "text-blueprint",
  high: "text-copper",
  critical: "text-stamp",
};

export function TaskAnalysisCard({ analysis }: { analysis: TaskAnalysis }) {
  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        Understand the task
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Task type</dt>
          <dd className="font-serif text-2xl text-navy">{analysis.taskTypeLabel}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Risk</dt>
          <dd className={`font-serif text-2xl ${RISK_TONE[analysis.risk]}`}>
            {analysis.risk.charAt(0).toUpperCase() + analysis.risk.slice(1)}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Affected area</dt>
          <dd className="text-lg text-navy">{analysis.area}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Required agents</dt>
          <dd className="text-sm text-ink">
            {analysis.requiredAgents.map((id) => AGENTS[id].short).join(" · ")}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-ink-soft">{analysis.summary}</p>
      {analysis.missing.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-rule pt-4">
          {analysis.missing.map((item) => (
            <li key={item.question} className="text-sm">
              <strong className="font-medium">{item.question}</strong>
              <span className="text-ink-soft"> {item.whyItMatters}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
