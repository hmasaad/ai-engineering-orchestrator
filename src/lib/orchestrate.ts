import { classifyTicket } from "./classify";
import { buildPlan } from "./plan";
import { evaluateRun } from "./quality";
import { runSpecialist } from "./specialists";
import type { AgentStepEvent, OrchestrationRun } from "./types";

export type OrchestratorEvent =
  | { type: "analysis"; run: OrchestrationRun }
  | { type: "step"; step: AgentStepEvent }
  | { type: "artifact"; run: OrchestrationRun }
  | { type: "run"; run: OrchestrationRun }
  | { type: "error"; message: string };

function newId() {
  return `run-${Date.now().toString(36)}`;
}

export function planTicket(ticket: string): OrchestrationRun {
  const analysis = classifyTicket(ticket);
  const plan = buildPlan(analysis);
  return {
    id: newId(),
    createdAt: new Date().toISOString(),
    ticket: ticket.trim(),
    analysis,
    plan,
    artifacts: [],
    currentStepId: null,
    quality: evaluateRun({ ticket, analysis, plan, artifacts: [] }),
    status: "planned",
  };
}

function finish(run: OrchestrationRun) {
  run.quality = evaluateRun(run);
  run.currentStepId = run.plan.steps.at(-1)?.id ?? null;
  run.status = run.plan.humanApprovalRequired ? "awaiting_approval" : "complete";
  return run;
}

function applyStep(
  run: OrchestrationRun,
  onEvent?: (event: OrchestratorEvent) => void,
) {
  for (const step of run.plan.steps) {
    run.currentStepId = step.id;
    onEvent?.({
      type: "step",
      step: { id: step.id, agent: step.agent, label: step.label, detail: step.why },
    });
    const artifact = runSpecialist({ ticket: run.ticket, run, step });
    run.artifacts = [...run.artifacts, artifact];
    onEvent?.({ type: "artifact", run: { ...run } });
  }
}

export function executePlan(
  input: OrchestrationRun | string,
  onEvent?: (event: OrchestratorEvent) => void,
): OrchestrationRun {
  const run = typeof input === "string" ? planTicket(input) : { ...input, artifacts: [] };
  run.status = "running";
  onEvent?.({ type: "analysis", run: { ...run } });
  applyStep(run, onEvent);
  finish(run);
  onEvent?.({ type: "run", run });
  return run;
}

export async function executePlanAsync(
  input: OrchestrationRun | string,
  onEvent?: (event: OrchestratorEvent) => void,
  delayMs = 220,
): Promise<OrchestrationRun> {
  const run = typeof input === "string" ? planTicket(input) : { ...input, artifacts: [] };
  run.status = "running";
  onEvent?.({ type: "analysis", run: { ...run } });

  for (const step of run.plan.steps) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    run.currentStepId = step.id;
    onEvent?.({
      type: "step",
      step: { id: step.id, agent: step.agent, label: step.label, detail: step.why },
    });
    const artifact = runSpecialist({ ticket: run.ticket, run, step });
    run.artifacts = [...run.artifacts, artifact];
    onEvent?.({ type: "artifact", run: { ...run } });
  }

  finish(run);
  onEvent?.({ type: "run", run });
  return run;
}

export function applyApproval(
  run: OrchestrationRun,
  decision: "approved" | "rejected",
  note = "",
): OrchestrationRun {
  return {
    ...run,
    status: decision === "approved" ? "approved" : "rejected",
    approval: {
      decision,
      note: note.trim(),
      at: new Date().toISOString(),
    },
  };
}
