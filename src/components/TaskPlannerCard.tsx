import { compactTaskPlan, formatTaskPlanTree } from "@/lib/planner";
import type { TaskPlan } from "@/lib/types";

export function TaskPlannerCard({ plan }: { plan: TaskPlan }) {
  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        2. Task planner
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">{plan.id}</p>
      <p className="mt-2 text-sm text-ink-soft">
        An engineering work breakdown, not a prompt route. Independent tracks fork after Security —
        never a straight line of agents, and never Security after Tests.
      </p>
      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-4 font-mono text-[12px] leading-6 text-navy">
        {formatTaskPlanTree(plan)}
      </pre>
      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(compactTaskPlan(plan), null, 2)}
      </pre>
    </section>
  );
}
