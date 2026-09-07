import { GUARDRAIL_CATALOG, GUARDRAIL_POLICY, inspectGuardrails } from "@/lib/guardrails";
import type { ExecutionPlan, TaskAnalysis } from "@/lib/types";

export function GuardrailsCard({
  ticket,
  analysis,
  plan,
}: {
  ticket: string;
  analysis: TaskAnalysis;
  plan: ExecutionPlan;
}) {
  const inspect = inspectGuardrails(ticket, analysis, plan);

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        8. Guardrails
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">Attack language does not rewrite the plan</p>
      <p className="mt-2 text-sm text-ink-soft">
        Prompt injection, hijacking, tool abuse, unauthorized actions, exfiltration, malicious repo
        files, and untrusted MCP tools are detected. The control plane does not obey them.
      </p>
      <ul className="mt-4 space-y-1.5 text-sm text-ink-soft">
        {GUARDRAIL_POLICY.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="mt-4 grid gap-1.5">
        {GUARDRAIL_CATALOG.map((item) => {
          const hit = inspect.hits[item.id];
          const held = inspect.held[item.id];
          return (
            <div
              key={item.id}
              className={`rounded-xl border px-3 py-2 ${
                hit && !held
                  ? "border-stamp bg-stamp/15 text-stamp"
                  : hit
                    ? "border-navy bg-navy text-paper"
                    : "border-rule bg-paper text-ink-soft"
              }`}
            >
              <p className="font-mono text-[12px]">{item.label}</p>
              <p className={`text-[11px] leading-4 ${hit ? "opacity-90" : "text-ink-soft"}`}>
                {hit ? (held ? "Detected — line held" : "Detected — plan obeyed the attack") : item.never}
              </p>
            </div>
          );
        })}
      </div>
      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(inspect.hits, null, 2)}
      </pre>
    </section>
  );
}
