import type { TaskAnalysis } from "@/lib/types";

const RISK_TONE: Record<string, string> = {
  low: "text-sage",
  medium: "text-blueprint",
  high: "text-copper",
  critical: "text-stamp",
};

export function TaskAnalysisCard({ analysis }: { analysis: TaskAnalysis }) {
  const json = analysis.understanding ?? {
    type: analysis.taskType,
    risk: analysis.risk,
    areas: analysis.areas ?? [],
  };

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        1. Task understanding
      </p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Type</dt>
          <dd className="font-serif text-2xl text-navy">{analysis.taskTypeLabel}</dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Risk</dt>
          <dd className={`font-serif text-2xl ${RISK_TONE[analysis.risk]}`}>
            {analysis.risk.charAt(0).toUpperCase() + analysis.risk.slice(1)}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Areas</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {(json.areas ?? []).map((id) => (
              <span
                key={id}
                className="rounded-full border border-rule bg-paper px-2.5 py-0.5 font-mono text-[11px] text-navy"
              >
                {id}
              </span>
            ))}
          </dd>
        </div>
      </dl>
      <p className="mt-4 text-sm text-ink-soft">{analysis.summary}</p>
      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(json, null, 2)}
      </pre>
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
