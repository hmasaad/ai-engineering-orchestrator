import type { ExecutionPlan } from "@/lib/types";

export function PlanView({ plan }: { plan: ExecutionPlan }) {
  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        Execution plan
      </p>
      <p className="mt-2 text-sm text-ink-soft">{plan.principle}</p>
      <p className="mt-1 text-xs text-ink-soft">
        Evals sit after Result Merger. A human is inserted only when the Risk Engine says HIGH or CRITICAL.
      </p>
      <ol className="mt-4 space-y-3">
        {plan.steps.map((step, index) => (
          <li key={step.id} className="flex gap-3 text-sm">
            <span className="font-mono text-[11px] text-ink-soft">{index + 1}</span>
            <span>
              <strong className="font-medium text-navy">{step.label}</strong>
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
