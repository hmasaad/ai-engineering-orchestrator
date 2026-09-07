"use client";

import { groupByWave } from "@/lib/graph";
import type { AgentId, ExecutionPlan, PlanStep } from "@/lib/types";

function tone(
  step: PlanStep,
  current: string | null,
  done: Set<string>,
  running: boolean,
) {
  if (running && (current === step.id || current === step.agent)) return "current";
  const byStep = [...done].some((id) => id.startsWith("step-") || id.startsWith("gate-"));
  if (byStep ? done.has(step.id) : done.has(step.agent)) return "done";
  return "idle";
}

function nodeClass(kind: ReturnType<typeof tone>, agent: AgentId) {
  if (kind === "current") return "border-navy bg-navy text-paper";
  if (kind === "done") return "border-blueprint/30 bg-blueprint/15 text-navy";
  if (agent === "approval") return "border-copper/40 bg-copper/10 text-copper";
  if (agent === "evals") return "border-sage/40 bg-sage/10 text-sage";
  if (agent === "consensus") return "border-navy/30 bg-navy/10 text-navy";
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

function ForkJoin() {
  return (
    <div className="relative h-3 w-1/2 max-w-[14rem]" aria-hidden>
      <div className="absolute inset-x-0 top-0 h-3 border-t border-l border-r border-rule" />
    </div>
  );
}

function JoinStem() {
  return (
    <div className="relative h-3 w-1/2 max-w-[14rem]" aria-hidden>
      <div className="absolute inset-x-0 bottom-0 h-3 border-b border-l border-r border-rule" />
    </div>
  );
}

export function AgentGraph({
  plan,
  current,
  completed,
  running,
}: {
  plan: ExecutionPlan | null;
  current: string | null;
  completed: string[];
  running: boolean;
}) {
  const done = new Set(completed);
  const groups = groupByWave(plan?.steps ?? []);

  return (
    <div className="flex flex-col items-center">
      <Node
        title="AI Engineering Control Plane"
        sub="Understand · Analyze · Plan · Validate"
        kind={running && !current ? "current" : running || done.size > 0 ? "done" : "idle"}
        agent="research"
      />
      {groups.map((group) => {
        const forked = group.length > 1 && group.every((step) => !step.gate);
        return (
          <div key={group.map((step) => step.id).join("-")} className="flex w-full flex-col items-center">
            {forked ? <ForkJoin /> : <Stem />}
            {group.length === 1 ? (
              <Node
                title={group[0].label}
                sub={group[0].requiresApproval ? "Gate" : group[0].agent === "pr" ? "Action" : group[0].track}
                kind={tone(group[0], current, done, running)}
                agent={group[0].agent}
              />
            ) : (
              <div className={`grid w-full gap-2 ${group.length > 2 ? "grid-cols-3" : "grid-cols-2"}`}>
                {group.map((step) => (
                  <Node
                    key={step.id}
                    title={step.label}
                    sub={step.track}
                    kind={tone(step, current, done, running)}
                    agent={step.agent}
                  />
                ))}
              </div>
            )}
            {forked ? <JoinStem /> : null}
          </div>
        );
      })}
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
