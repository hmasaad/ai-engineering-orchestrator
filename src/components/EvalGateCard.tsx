import { EVAL_DIMENSIONS } from "@/lib/quality";
import { GUARDRAIL_CATALOG } from "@/lib/guardrails";
import type { QualityGate } from "@/lib/types";

function tone(pass: boolean) {
  return pass ? "border-navy bg-navy text-paper" : "border-stamp bg-stamp/15 text-stamp";
}

export function EvalGateCard({
  gate,
  live = false,
}: {
  gate: QualityGate;
  live?: boolean;
}) {
  const passed = gate.verdict === "PASS";

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        9. Evaluation / quality gate
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">{passed ? "PASS" : "FAIL"}</p>
      <p className="mt-2 text-sm text-ink-soft">
        {live
          ? "The generated solution is scored before a PR. Fail closed means no pull request."
          : "Draft score for this ticket. The live gate runs after Testing, before Create PR."}
      </p>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {EVAL_DIMENSIONS.map((dim) => {
          const row = gate.dimensions[dim.id];
          return (
            <span
              key={dim.id}
              className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${tone(row?.pass !== false)}`}
            >
              {dim.label} · {row?.score ?? 0}
            </span>
          );
        })}
      </div>

      <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">Guardrails</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {GUARDRAIL_CATALOG.map((item) => {
          const ok = gate.guardrails[item.id] === "pass";
          return (
            <span
              key={item.id}
              className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${tone(ok)}`}
            >
              {item.label}
            </span>
          );
        })}
      </div>

      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(gate, null, 2)}
      </pre>
    </section>
  );
}
