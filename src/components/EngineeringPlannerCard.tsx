import { compactEngineering } from "@/lib/engineering";
import { DYNAMIC_ROUTE_RULES } from "@/lib/router";
import type { EngineeringPlan, PublicAgentName } from "@/lib/types";

const PUBLIC_LABEL: Record<PublicAgentName, string> = {
  requirements: "Requirements Agent",
  architect: "Architect Agent",
  security: "Security Agent",
  database: "Database Agent",
  performance: "Performance Agent",
  developer: "Developer Agent",
  testing: "Testing Agent",
  pr_reviewer: "PR Reviewer",
  bug: "Bug Agent",
  research: "Code Research",
  rca: "Root Cause",
  tech_debt: "Tech Debt",
};

export function EngineeringPlannerCard({
  plan,
  skipped = [],
}: {
  plan: EngineeringPlan;
  skipped?: { agent: PublicAgentName; reason: string }[];
}) {
  const fired = new Set(plan.selection.rules.map((item) => item.if));
  const questions = [
    { q: "What type of task is this?", a: `${plan.taskType} · ${plan.shape}` },
    { q: "What parts of the repository are affected?", a: plan.repository.files.join(", ") },
    { q: "What agents are required?", a: plan.agents.map((id) => PUBLIC_LABEL[id]).join(" → ") },
    { q: "What tools are required?", a: plan.tools.join(", ") },
    {
      q: "What dependencies exist?",
      a: plan.dependencies.length
        ? `${plan.dependencies.length} edges in the execution graph.`
        : "No specialist dependencies.",
    },
    {
      q: "What can run in parallel?",
      a: plan.parallel.filter((wave) => wave.length > 1).length
        ? plan.parallel
            .filter((wave) => wave.length > 1)
            .map((wave) => wave.join(" + "))
            .join("; ")
        : plan.parallel.filter((wave) => wave.length > 1).length
          ? plan.parallel
              .filter((wave) => wave.length > 1)
              .map((wave) => wave.join(" + "))
              .join("; ")
          : "Sequential. Independent tracks (Backend || Mobile) fork when the ticket hits both.",
    },
    {
      q: "What requires human approval?",
      a: plan.humanApproval.required
        ? plan.humanApproval.reason
        : plan.selection.pattern === "ui"
          ? "None. LOW Auto Execute after evals."
          : "None. LOW Auto Execute / MEDIUM Review. Action after evals.",
    },
    { q: "What constitutes success?", a: plan.success[0]?.label ?? "Evals PASS. Nothing merges." },
  ];

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        5. Engineering planner
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">Control plane, not a dispatcher</p>
      <p className="mt-2 text-sm text-ink-soft">
        Agent selection is one step. The plan also names affected files, tools, the dependency
        graph, parallel waves, the human gate, and the success bar. IF-rules still add Security,
        Database, or Performance before Developer.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-full border border-navy bg-navy px-2.5 py-0.5 font-mono text-[11px] text-paper">
          {plan.intent}
        </span>
        <span className="rounded-full border border-rule bg-paper px-2.5 py-0.5 font-mono text-[11px] text-navy">
          {plan.shape}
        </span>
        <span className="rounded-full border border-rule bg-paper px-2.5 py-0.5 font-mono text-[11px] text-navy">
          {plan.risk}
        </span>
      </div>

      <ol className="mt-4 space-y-3">
        {questions.map((item) => (
          <li key={item.q} className="text-sm">
            <p className="font-medium text-navy">{item.q}</p>
            <p className="text-ink-soft">{item.a}</p>
          </li>
        ))}
      </ol>

      <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
        Agent selection · IF-rules
      </p>
      <ul className="mt-2 space-y-1.5">
        {DYNAMIC_ROUTE_RULES.map((rule) => {
          const active = fired.has(rule.id);
          return (
            <li
              key={rule.id}
              className={`rounded-xl border px-3 py-2 font-mono text-[12px] ${
                active
                  ? "border-navy bg-navy text-paper"
                  : "border-dashed border-rule text-ink-soft line-through decoration-ink-soft/50"
              }`}
            >
              {rule.label}
            </li>
          );
        })}
      </ul>

      <ol className="mt-4 space-y-0">
        {plan.agents.map((agent, index) => (
          <li key={agent} className="flex flex-col">
            {index > 0 ? <span className="ml-3 h-3 w-px bg-navy/40" aria-hidden /> : null}
            <span className="w-fit rounded-full border border-navy bg-navy px-3 py-1 font-mono text-[12px] text-paper">
              {PUBLIC_LABEL[agent]}
            </span>
          </li>
        ))}
      </ol>

      {skipped.length > 0 ? (
        <div className="mt-4 border-t border-rule pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Not selected</p>
          <ul className="mt-2 space-y-1.5">
            {skipped.map((item) => (
              <li key={item.agent} className="text-sm text-ink-soft">
                <span className="font-medium text-ink">{PUBLIC_LABEL[item.agent]}</span>
                {" — "}
                {item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-sm text-ink-soft">{plan.retry.reason}</p>

      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(compactEngineering(plan), null, 2)}
      </pre>
    </section>
  );
}
