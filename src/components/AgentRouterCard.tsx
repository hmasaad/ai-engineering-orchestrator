import { PATTERN_LABEL } from "@/lib/roster";
import { DYNAMIC_ROUTE_RULES } from "@/lib/router";
import type { AgentRoute, PublicAgentName } from "@/lib/types";

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

export function AgentRouterCard({ route }: { route: AgentRoute }) {
  const fired = new Set(route.routing.rules.map((item) => item.if));

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        4. Agent router
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">{PATTERN_LABEL[route.pattern]}</p>
      <p className="mt-2 text-sm text-ink-soft">{route.reason}</p>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
        Dynamic IF-rules
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
        {route.routing.agents.map((agent, index) => (
          <li key={agent} className="flex flex-col">
            {index > 0 ? <span className="ml-3 h-3 w-px bg-navy/40" aria-hidden /> : null}
            <span className="w-fit rounded-full border border-navy bg-navy px-3 py-1 font-mono text-[12px] text-paper">
              {PUBLIC_LABEL[agent]}
            </span>
          </li>
        ))}
      </ol>

      {route.skipped.length > 0 ? (
        <div className="mt-4 border-t border-rule pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">Skipped</p>
          <ul className="mt-2 space-y-1.5">
            {route.skipped.map((item) => (
              <li key={item.agent} className="text-sm text-ink-soft">
                <span className="font-medium text-ink">{PUBLIC_LABEL[item.agent]}</span>
                {" — "}
                {item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(route.routing, null, 2)}
      </pre>
    </section>
  );
}
