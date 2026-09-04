"use client";

import type { AgentId, ExecutionPlan } from "@/lib/types";

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

  return (
    <div className="flex flex-col items-center">
      <Node
        title="AI Engineering Orchestrator"
        sub="Understand · route · dispatch"
        kind={running && !current ? "current" : running || done.size > 0 ? "done" : "idle"}
        agent="research"
      />
      {(plan?.steps ?? []).map((step) => (
        <div key={step.id} className="flex w-full flex-col items-center">
          <Stem />
          <Node
            title={step.label}
            sub={step.requiresApproval ? "Gate" : undefined}
            kind={tone(step.agent, current, done, running)}
            agent={step.agent}
          />
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
