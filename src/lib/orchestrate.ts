import { asTaskInput, understandTask } from "./classify";
import { buildPlan } from "./plan";
import { evaluateRun } from "./quality";
import { runSpecialist } from "./specialists";
import { initSharedState, setStateStatus, writeSharedState } from "./state";
import type { AgentStepEvent, GateId, OrchestrationRun, TaskInput } from "./types";

export type OrchestratorEvent =
  | { type: "analysis"; run: OrchestrationRun }
  | { type: "step"; step: AgentStepEvent }
  | { type: "artifact"; run: OrchestrationRun }
  | { type: "state"; run: OrchestrationRun }
  | { type: "run"; run: OrchestrationRun }
  | { type: "error"; message: string };

function newId() {
  return `run-${Date.now().toString(36)}`;
}

export function planTicket(input: TaskInput | string): OrchestrationRun {
  const parsed = asTaskInput(input);
  const analysis = understandTask(parsed);
  const plan = buildPlan(analysis);
  const ticket = parsed.task.trim();
  return {
    id: newId(),
    createdAt: new Date().toISOString(),
    ticket,
    input: parsed,
    analysis,
    plan,
    artifacts: [],
    state: initSharedState(ticket, "planned"),
    currentStepId: null,
    quality: evaluateRun({ ticket, analysis, plan, artifacts: [] }),
    status: "planned",
    pendingGate: null,
    resumeFrom: 0,
    approvals: [],
  };
}

function snapshot(run: OrchestrationRun): OrchestrationRun {
  return { ...run, artifacts: [...run.artifacts], approvals: [...run.approvals] };
}

function applySpecialist(run: OrchestrationRun, index: number, onEvent?: (event: OrchestratorEvent) => void) {
  const step = run.plan.steps[index];
  run.currentStepId = step.id;
  onEvent?.({
    type: "step",
    step: { id: step.id, agent: step.agent, label: step.label, detail: step.why },
  });
  const artifact = runSpecialist({ ticket: run.ticket, run, step });
  run.artifacts = [...run.artifacts, artifact];
  run.state = writeSharedState(run.state, step.agent, artifact, run.analysis);
  onEvent?.({ type: "artifact", run: snapshot(run) });
  onEvent?.({ type: "state", run: snapshot(run) });
}

function completeRun(run: OrchestrationRun, failedClosed = false) {
  run.status = "complete";
  run.pendingGate = null;
  run.state = setStateStatus(run.state, "complete");
  run.quality = evaluateRun(run);
  run.currentStepId = failedClosed
    ? (run.plan.steps.find((step) => step.agent === "evals")?.id ?? run.currentStepId)
    : (run.plan.steps.at(-1)?.id ?? null);
  return run;
}

function evalsFailed(run: OrchestrationRun) {
  run.quality = evaluateRun(run);
  return !run.quality.ready;
}

function pauseAtGate(run: OrchestrationRun, index: number, gate: GateId) {
  run.status = "awaiting_approval";
  run.pendingGate = gate;
  run.resumeFrom = index + 1;
  run.state = setStateStatus(run.state, "awaiting_approval");
  run.quality = evaluateRun(run);
  return run;
}

function processSteps(
  run: OrchestrationRun,
  from: number,
  options: { pause: boolean; autoApprove: boolean },
  onEvent?: (event: OrchestratorEvent) => void,
) {
  for (let index = from; index < run.plan.steps.length; index += 1) {
    const step = run.plan.steps[index];
    applySpecialist(run, index, onEvent);
    if (step.agent === "evals" && evalsFailed(run)) {
      return completeRun(run, true);
    }
    if (!step.gate) continue;

    if (options.autoApprove) {
      const record = {
        gate: step.gate,
        decision: "approved" as const,
        note: "eval auto-approve",
        at: new Date().toISOString(),
      };
      run.approvals = [...run.approvals, record];
      run.approval = record;
      continue;
    }

    if (options.pause) {
      pauseAtGate(run, index, step.gate);
      return run;
    }
  }

  return completeRun(run);
}

function startRun(input: OrchestrationRun | TaskInput | string): OrchestrationRun {
  if (typeof input === "object" && "plan" in input) {
    return {
      ...input,
      artifacts: [],
      state: initSharedState(input.ticket, "running"),
      approvals: [],
      approval: undefined,
      pendingGate: null,
      resumeFrom: 0,
    };
  }
  return planTicket(input);
}

export function executePlan(
  input: OrchestrationRun | TaskInput | string,
  onEvent?: (event: OrchestratorEvent) => void,
): OrchestrationRun {
  const run = startRun(input);
  run.status = "running";
  run.state = setStateStatus(run.state, "running");
  onEvent?.({ type: "analysis", run: snapshot(run) });
  processSteps(run, 0, { pause: false, autoApprove: true }, onEvent);
  onEvent?.({ type: "run", run });
  return run;
}

export async function executePlanAsync(
  input: OrchestrationRun | TaskInput | string,
  onEvent?: (event: OrchestratorEvent) => void,
  delayMs = 220,
): Promise<OrchestrationRun> {
  const run = startRun(input);
  run.status = "running";
  run.state = setStateStatus(run.state, "running");
  onEvent?.({ type: "analysis", run: snapshot(run) });

  for (let index = 0; index < run.plan.steps.length; index += 1) {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const step = run.plan.steps[index];
    applySpecialist(run, index, onEvent);
    if (step.agent === "evals" && evalsFailed(run)) {
      completeRun(run, true);
      onEvent?.({ type: "run", run });
      return run;
    }
    if (step.gate) {
      pauseAtGate(run, index, step.gate);
      onEvent?.({ type: "run", run });
      return run;
    }
  }

  completeRun(run);
  onEvent?.({ type: "run", run });
  return run;
}

export function applyApproval(
  run: OrchestrationRun,
  decision: "approved" | "rejected",
  note = "",
): OrchestrationRun {
  const gate = run.pendingGate ?? run.plan.steps.find((step) => step.gate)?.gate ?? "ship";
  const record = {
    gate,
    decision,
    note: note.trim(),
    at: new Date().toISOString(),
  };
  const next: OrchestrationRun = {
    ...run,
    artifacts: [...run.artifacts],
    approvals: [...run.approvals, record],
    approval: record,
  };

  if (decision === "rejected") {
    next.status = "rejected";
    next.pendingGate = null;
    next.state = setStateStatus(next.state, "rejected");
    next.quality = evaluateRun(next);
    return next;
  }

  next.status = "running";
  next.pendingGate = null;
  next.state = setStateStatus(next.state, "running");
  processSteps(next, next.resumeFrom, { pause: true, autoApprove: false });
  return next;
}
