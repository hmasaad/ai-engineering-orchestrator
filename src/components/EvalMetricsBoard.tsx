import type { SuiteMetrics } from "@/lib/eval/metrics";
import { EVAL_MEASURES } from "@/lib/eval/metrics";

function tone(stat: SuiteMetrics[keyof SuiteMetrics]) {
  if (stat.better === "neutral") return "text-navy";
  if (stat.better === "lower") {
    const rate = Number.parseFloat(stat.display);
    return Number.isFinite(rate) && rate > 5 ? "text-stamp" : "text-sage";
  }
  const score = stat.score ?? 0;
  return score >= 95 ? "text-sage" : score >= 80 ? "text-copper" : "text-stamp";
}

export function EvalMetricsBoard({ metrics }: { metrics: SuiteMetrics }) {
  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        Suite measures
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">What the evals actually measure</p>
      <p className="mt-2 text-sm text-ink-soft">
        Gold tickets plus samples. Cost is specialist-units. Latency is wall-clock for a
        deterministic run, plus plan depth in waves.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EVAL_MEASURES.map((item) => {
          const stat = metrics[item.id];
          return (
            <article key={item.id} className="rounded-xl border border-rule bg-paper/80 p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                {stat.label}
              </p>
              <p className={`mt-1 font-serif text-3xl ${tone(stat)}`}>{stat.display}</p>
              <p className="mt-2 text-xs leading-5 text-ink-soft">{stat.detail}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
