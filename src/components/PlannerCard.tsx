import type { PlannerResult } from "@/lib/types";

export function PlannerCard({ planner }: { planner: PlannerResult }) {
  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">2. Planner</p>
      <p className="mt-2 font-serif text-2xl text-navy">{planner.change}</p>
      <p className="mt-2 text-sm text-ink-soft">
        The planner names the change and its shape. It does not pick specialists — the Risk Engine and
        router do that.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-navy bg-navy px-2.5 py-0.5 font-mono text-[11px] text-paper">
          {planner.intent}
        </span>
        <span className="rounded-full border border-rule bg-paper px-2.5 py-0.5 font-mono text-[11px] text-navy">
          {planner.shape}
        </span>
      </div>
      <ul className="mt-4 space-y-1.5 text-sm text-ink-soft">
        {planner.constraints.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(
          { intent: planner.intent, change: planner.change, shape: planner.shape },
          null,
          2,
        )}
      </pre>
    </section>
  );
}
