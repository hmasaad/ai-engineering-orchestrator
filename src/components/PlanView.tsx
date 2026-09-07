import type { ExecutionPlan } from "@/lib/types";

export function PlanView({ plan }: { plan: ExecutionPlan }) {
  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        Execution plan
      </p>
      <p className="mt-2 text-sm text-ink-soft">{plan.principle}</p>
      <p className="mt-1 text-xs text-ink-soft">
        Dependency graph. Independent tracks (Backend and Mobile) share a wave and run together.
        Security stays on the stem before that fork. Evals sit after Integration.
      </p>
      {plan.graph?.parallel ? (
        <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
          {plan.graph.ascii}
        </pre>
      ) : null}
      <ol className="mt-4 space-y-3">
        {plan.steps.map((step, index) => (
          <li key={step.id} className="flex gap-3 text-sm">
            <span className="font-mono text-[11px] text-ink-soft">{index + 1}</span>
            <span>
              <strong className="font-medium text-navy">{step.label}</strong>
              {step.track ? (
                <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-blueprint">
                  {step.track}
                </span>
              ) : null}
              {step.requiresApproval ? (
                <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.14em] text-copper">
                  gate
                </span>
              ) : null}
              <span className="block text-ink-soft">{step.why}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className={`mt-4 text-sm ${plan.humanApprovalRequired ? "text-copper" : "text-sage"}`}>
        {plan.humanApprovalRequired ? plan.approvalReason : "Human approval is not required for this plan."}
      </p>
    </section>
  );
}
