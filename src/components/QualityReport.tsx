import type { QualityReport as Report } from "@/lib/types";

export function QualityReport({ report }: { report: Report }) {
  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
            Evals / quality gate
          </p>
          <h2 className="font-serif text-2xl text-navy">
            {report.ready ? "Gate passed" : "Gate failed"}
          </h2>
        </div>
        <p className="font-mono text-sm text-ink-soft">
          score {report.score} · {report.errorCount} errors · {report.warningCount} warnings
        </p>
      </div>
      <ul className="mt-4 grid gap-2">
        {report.checks.map((item) => (
          <li
            key={item.id}
            className="flex gap-3 rounded-xl border border-rule bg-paper/80 px-3 py-2 text-sm"
          >
            <span
              className={`mt-0.5 font-mono text-[11px] uppercase ${
                item.pass ? "text-sage" : item.severity === "error" ? "text-stamp" : "text-copper"
              }`}
            >
              {item.pass ? "pass" : item.severity}
            </span>
            <span>
              <strong className="font-medium">{item.label}.</strong> {item.detail}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
