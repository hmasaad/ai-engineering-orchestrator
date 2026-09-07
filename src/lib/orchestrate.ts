import { asTaskInput, understandTask } from "./classify";
import { buildConsensus, draftConsensus } from "./consensus";
import { finalDecision } from "./engineering";
import { buildEvidenceEngine, draftEvidence } from "./evidence";
import { buildPlan } from "./plan";
import { evaluateRun } from "./quality";
import {
  canReroute,
  classifyFailure,
  closeRecovery,
  cutForTarget,
  draftRecovery,
  recordRecovery,
} from "./recovery";
import { runSpecialist } from "./specialists";
import { packLearnings, retrieveLearnings } from "./rag";
import { initSharedState, setStateStatus, writeSharedState } from "./state";
import {
  closeVerification,
  draftVerification,
  recordCycle,
} from "./verification";
import type {
  AgentStepEvent,
  GateId,
  Learning,
  OrchestrationRun,
  RecoveryDecision,
  RecoveryStage,
  TaskInput,
} from "./types";

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

export function planTicket(input: TaskInput | string, extraLearnings: Learning[] = []): OrchestrationRun {
  const parsed = asTaskInput(input);
  const analysis = understandTask(parsed);
  const plan = buildPlan(analysis);
  const ticket = parsed.task.trim();
  const state = initSharedState(ticket, "planned");
  state.learnings = packLearnings(retrieveLearnings(ticket, analysis, extraLearnings));
  return {
    id: newId(),
    createdAt: new Date().toISOString(),
    ticket,
    input: parsed,
    analysis,
    plan,
    artifacts: [],
    state,
    currentStepId: null,
    quality: evaluateRun({ ticket, analysis, plan, artifacts: [] }),
    evidence: draftEvidence(analysis, plan),
    verification: draftVerification(plan),
    recovery: draftRecovery(plan),
    consensus: draftConsensus(analysis, plan),
    status: "planned",
    pendingGate: null,
    resumeFrom: 0,
    approvals: [],
    retries: 0,
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

function stamp(run: OrchestrationRun) {
  run.quality = evaluateRun(run);
  run.evidence = buildEvidenceEngine(run);
  run.verification = closeVerification(run);
  run.recovery = closeRecovery(run);
  run.consensus = buildConsensus(run);
  if (run.state) {
    run.state = { ...run.state, consensus: run.consensus };
  }
}

function completeRun(run: OrchestrationRun, failedClosed = false) {
  run.status = "complete";
  run.pendingGate = null;
  run.state = setStateStatus(run.state, "complete");
  stamp(run);
  run.currentStepId = failedClosed
    ? (run.plan.steps.find((step) => step.agent === "evals")?.id ?? run.currentStepId)
    : (run.plan.steps.at(-1)?.id ?? null);
  run.decision = finalDecision({
    vague: run.analysis.vague,
    taskType: run.analysis.taskType,
    asksForChange: run.analysis.asksForChange,
    qualityReady: run.quality.ready,
    status: run.status,
    humanRequired: run.plan.humanApprovalRequired,
    pendingGate: null,
  });
  return run;
}

function evalsFailed(run: OrchestrationRun) {
  stamp(run);
  return !run.quality.ready;
}

function guardrailsHeld(run: OrchestrationRun) {
  const rows = run.quality.guardrails;
  if (!rows) return false;
  return Object.values(rows).every((item) => item === "pass");
}

function shouldRecover(run: OrchestrationRun, stage: RecoveryStage, decision: RecoveryDecision) {
  const policy = run.plan.engineering?.retry;
  if (!policy?.allowed) return false;
  if ((run.retries ?? 0) >= policy.maxAttempts) return false;
  if (!guardrailsHeld(run) && stage === "evals") return false;
  if (stage === "evals" && run.quality.ready) return false;
  if (!canReroute(decision.target, run.plan)) return false;
  return policy.onFail === "retry_implement";
}

function rewindTo(run: OrchestrationRun, decision: RecoveryDecision) {
  const cut = cutForTarget(run.plan, decision.target);
  if (cut < 0) return -1;
  const keepIds = new Set(run.plan.steps.slice(0, cut).map((step) => step.id));
  run.artifacts = run.artifacts.filter((item) => Boolean(item.stepId) && keepIds.has(item.stepId!));
  const learnings = run.state.learnings;
  const loop = run.verification;
  const recovery = run.recovery;
  run.state = initSharedState(run.ticket, "running");
  run.state.learnings = learnings;
  for (const artifact of run.artifacts) {
    run.state = writeSharedState(run.state, artifact.agent, artifact, run.analysis);
  }
  run.retries = (run.retries ?? 0) + 1;
  run.status = "running";
  run.pendingGate = null;
  run.verification = loop;
  run.recovery = recovery;
  return cut;
}

function maybeRecover(run: OrchestrationRun, stage: RecoveryStage): number | null {
  const decision = classifyFailure(run, stage);
  if (!decision) return null;
  if (!shouldRecover(run, stage, decision)) {
    run.recovery = recordRecovery(
      run.recovery,
      {
        attempt: (run.retries ?? 0) + 1,
        stage,
        decision,
        result: "hold",
      },
      run.plan,
    );
    return null;
  }
  run.recovery = recordRecovery(
    run.recovery,
    {
      attempt: (run.retries ?? 0) + 1,
      stage,
      decision,
      result: "reroute",
    },
    run.plan,
  );
  if (stage === "review" || stage === "evals") {
    run.verification = recordCycle(run.verification, {
      attempt: (run.retries ?? 0) + 1,
      trigger: stage === "review" ? "review" : "evals",
      reason: decision.reason,
      issues: decision.evidence,
      result: "fix",
    });
  }
  const cut = rewindTo(run, decision);
  return cut >= 0 ? cut : null;
}

function pauseAtGate(run: OrchestrationRun, index: number, gate: GateId) {
  run.status = "awaiting_approval";
  run.pendingGate = gate;
  run.resumeFrom = index + 1;
  run.state = setStateStatus(run.state, "awaiting_approval");
  stamp(run);
  run.decision = finalDecision({
    vague: run.analysis.vague,
    taskType: run.analysis.taskType,
    asksForChange: run.analysis.asksForChange,
    qualityReady: run.quality.ready,
    status: run.status,
    humanRequired: true,
    pendingGate: gate,
  });
  return run;
}

function waveEnd(steps: OrchestrationRun["plan"]["steps"], from: number) {
  const wave = steps[from]?.wave;
  let end = from + 1;
  while (end < steps.length && steps[end].wave === wave) end += 1;
  return end;
}

function processSteps(
  run: OrchestrationRun,
  from: number,
  options: { pause: boolean; autoApprove: boolean },
  onEvent?: (event: OrchestratorEvent) => void,
) {
  let index = from;
  while (index < run.plan.steps.length) {
    const end = waveEnd(run.plan.steps, index);
    for (let i = index; i < end; i += 1) {
      applySpecialist(run, i, onEvent);
    }
    for (let i = index; i < end; i += 1) {
      const step = run.plan.steps[i];
      if (step.agent === "tests") {
        const cut = maybeRecover(run, "tests");
        if (cut != null) {
          processSteps(run, cut, options, onEvent);
          return run;
        }
      }
      if (step.agent === "pr_review") {
        const cut = maybeRecover(run, "review");
        if (cut != null) {
          processSteps(run, cut, options, onEvent);
          return run;
        }
      }
      if (step.agent === "evals" && evalsFailed(run)) {
        const cut = maybeRecover(run, "evals");
        if (cut != null) {
          processSteps(run, cut, options, onEvent);
          return run;
        }
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
        pauseAtGate(run, i, step.gate);
        return run;
      }
    }
    index = end;
  }

  return completeRun(run);
}

function startRun(
  input: OrchestrationRun | TaskInput | string,
  extraLearnings: Learning[] = [],
): OrchestrationRun {
  if (typeof input === "object" && "plan" in input) {
    const state = initSharedState(input.ticket, "running");
    state.learnings = packLearnings(retrieveLearnings(input.ticket, input.analysis, extraLearnings));
    return {
      ...input,
      artifacts: [],
      state,
      approvals: [],
      approval: undefined,
      pendingGate: null,
      resumeFrom: 0,
      retries: 0,
    };
  }
  return planTicket(input, extraLearnings);
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
  extraLearnings: Learning[] = [],
): Promise<OrchestrationRun> {
  const run = startRun(input, extraLearnings);
  run.status = "running";
  run.state = setStateStatus(run.state, "running");
  onEvent?.({ type: "analysis", run: snapshot(run) });

  let index = 0;
  while (index < run.plan.steps.length) {
    const end = waveEnd(run.plan.steps, index);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    for (let i = index; i < end; i += 1) {
      applySpecialist(run, i, onEvent);
    }
    let retried = false;
    for (let i = index; i < end; i += 1) {
      const step = run.plan.steps[i];
      if (step.agent === "tests") {
        const cut = maybeRecover(run, "tests");
        if (cut != null) {
          index = cut;
          retried = true;
          break;
        }
      }
      if (step.agent === "pr_review") {
        const cut = maybeRecover(run, "review");
        if (cut != null) {
          index = cut;
          retried = true;
          break;
        }
      }
      if (step.agent === "evals" && evalsFailed(run)) {
        const cut = maybeRecover(run, "evals");
        if (cut != null) {
          index = cut;
          retried = true;
          break;
        }
        completeRun(run, true);
        onEvent?.({ type: "run", run });
        return run;
      }
      if (step.gate) {
        pauseAtGate(run, i, step.gate);
        onEvent?.({ type: "run", run });
        return run;
      }
    }
    if (retried) continue;
    index = end;
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
    stamp(next);
    next.decision = finalDecision({
      vague: next.analysis.vague,
      taskType: next.analysis.taskType,
      asksForChange: next.analysis.asksForChange,
      qualityReady: next.quality.ready,
      status: next.status,
      humanRequired: next.plan.humanApprovalRequired,
      pendingGate: null,
    });
    return next;
  }

  next.status = "running";
  next.pendingGate = null;
  next.state = setStateStatus(next.state, "running");
  processSteps(next, next.resumeFrom, { pause: true, autoApprove: false });
  return next;
}
