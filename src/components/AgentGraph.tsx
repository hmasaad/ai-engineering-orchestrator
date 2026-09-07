"use client";

import type { AgentId, ExecutionPlan, PlanStep } from "@/lib/types";

function tone(
  agent: AgentId,
  current: AgentId | null,
  done: Set<AgentId>,
  running: boolean,
) {
  if (current === agent && running) return "current";
  if (done.has(agent)) return "done";
  return "idle";
}

function nodeClass(kind: ReturnType<typeof tone>, agent: AgentId) {
  if (kind === "current") return "border-navy bg-navy text-paper";
  if (kind === "done") return "border-blueprint/30 bg-blueprint/15 text-navy";
  if (agent === "approval") return "border-copper/40 bg-copper/10 text-copper";
  if (agent === "evals") return "border-sage/40 bg-sage/10 text-sage";
  if (agent === "merge") return "border-navy/30 bg-navy/10 text-navy";
  return "border-rule bg-paper-2 text-ink-soft";
}

function Node({
  title,
  sub,
  kind,
  agent,
}: {
  title: string;
  sub?: string;
  kind: ReturnType<typeof tone>;
  agent: AgentId;
}) {
  return (
    <div className={`w-full max-w-[16rem] rounded-lg border px-2 py-1.5 text-center ${nodeClass(kind, agent)}`}>
      <p className="text-[11px] font-medium leading-4">{title}</p>
      {sub ? <p className="text-[10px] leading-4 opacity-80">{sub}</p> : null}
    </div>
  );
}

function Stem() {
  return <div className="h-3 w-px bg-rule" aria-hidden />;
}

function waves(steps: PlanStep[]): PlanStep[][] {
  const groups: PlanStep[][] = [];
  for (const step of steps) {
    const last = groups.at(-1);
    if (last && last[0] && last[0].wave === step.wave && last.length < 3 && !step.gate && !last[0].gate) {
      last.push(step);
    } else {
      groups.push([step]);
    }
  }
  return groups;
}

export function AgentGraph({
  plan,
  current,
  completed,
  running,
}: {
  plan: ExecutionPlan | null;
  current: AgentId | null;
  completed: AgentId[];
  running: boolean;
}) {
  const done = new Set(completed);
  const groups = waves(plan?.steps ?? []);

  return (
    <div className="flex flex-col items-center">
      <Node
        title="AI Engineering Orchestrator"
        sub="Planner · Risk Engine · Router"
        kind={running && !current ? "current" : running || done.size > 0 ? "done" : "idle"}
        agent="research"
      />
      {groups.map((group) => (
        <div key={group.map((step) => step.id).join("-")} className="flex w-full flex-col items-center">
          <Stem />
          {group.length === 1 ? (
            <Node
              title={group[0].label}
              sub={group[0].requiresApproval ? "Gate" : group[0].agent === "pr" ? "Action" : undefined}
              kind={tone(group[0].agent, current, done, running)}
              agent={group[0].agent}
            />
          ) : (
            <div className={`grid w-full gap-2 ${group.length > 2 ? "grid-cols-3" : "grid-cols-2"}`}>
              {group.map((step) => (
                <Node
                  key={step.id}
                  title={step.label}
                  kind={tone(step.agent, current, done, running)}
                  agent={step.agent}
                />
              ))}
            </div>
          )}
        </div>
      ))}
      {!plan && (
        <>
          <Stem />
          <p className="text-center font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
            Plan appears after the ticket is understood
          </p>
        </>
      )}
    </div>
  );
}
