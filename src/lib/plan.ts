import { AGENTS } from "./roster";
import { hasArea } from "./classify";
import { isEngineeringDecision } from "./consensus";
import { buildControlPolicy } from "./control";
import { buildEngineeringPlan } from "./engineering";
import {
  buildExecutionGraph,
  canShareWave,
  mobileTrackLabel,
  reorderForkedAgents,
  shouldForkTracks,
} from "./graph";
import { isSimpleUi, routeTask } from "./router";
import { riskPolicyOf } from "./risk";
import type {
  AgentId,
  ControlGate,
  ExecutionPlan,
  GateId,
  PlanStep,
  TaskAnalysis,
  WorkTrack,
} from "./types";

const WHY: Record<AgentId, (analysis: TaskAnalysis, gate?: GateId) => string> = {
  requirements: (a) =>
    `Write the ${a.area} requirements before Architect or Developer touch the change.`,
  bug: (a) => `Symptoms point at a failure in ${a.area}. Rank hypotheses before touching code.`,
  research: (a) =>
    a.vague
      ? "Collect the missing facts. Do not invent a ship plan."
      : `Read the ${a.areas.join(", ")} paths that could explain this ticket.`,
  rca: (a) => `Turn research in ${a.area} into a single locked cause.`,
  architect: (a) =>
    a.planner?.shape === "decision" || isEngineeringDecision(a.input.task)
      ? "Speak for architecture. Consensus Engine will weigh this against Performance, Security, and Developer."
      : a.taskType === "architecture"
        ? "Design the system before anyone writes the code."
        : "Shape the change so the fix does not fight the existing architecture.",
  tech_debt: () => "Say whether this change pays debt or buries it.",
  security: (a) =>
    hasArea(a, "authentication")
      ? "Auth changes can lock people out or let the wrong people in. Review before a patch."
      : "Threat-model the change before generating a fix.",
  database: (a) =>
    a.controlKinds.includes("destructive")
      ? "Destructive schema. Name the rollback and what rows disappear before Developer writes SQL."
      : "Review the additive field: type, nullability, backfill, and indexes before Developer.",
  performance: () =>
    "Measure the slow path (render, query, p95) before anyone patches. Do not guess a cache.",
  implement: (a) =>
    a.planner?.shape === "decision" || isEngineeringDecision(a.input.task)
      ? "Give a cost and feasibility opinion. This is not a patch."
      : isSimpleUi(a)
        ? "LOW risk UI patch. Write the scoped change; the quality gate still runs."
        : "Only now write the scoped change. Not a one-shot LLM solve.",
  tests: (a) => `Cover the ${a.area} change so the next edit does not regress it.`,
  pr_review: () => "Review the merged change with evidence before the quality gate.",
  merge: () => "Fold specialist outputs into one result before the quality gate.",
  evals: () =>
    "Score correctness, security, tests, architecture, regression, and code quality. Fail closed.",
  consensus: () =>
    "Weigh Architect, Performance, Security, and Developer. Do not trust one agent. Recommend, do not ship.",
  approval: (a, gate) =>
    a.vague
      ? "A human must decide what this ticket even is."
      : gate === "plan"
        ? "A person must approve the plan before Implementation."
        : "A person must approve after the quality gate. Then Action.",
  pr: () => "Action: open a PR only after the quality gate (and human, when required). Nothing merges.",
};

const BEFORE_AGENT: Record<ControlGate["before"], AgentId | null> = {
  developer: "implement",
  pr: "pr",
  end: null,
};

/** Specialists only. Merger, evals, Action, and control gates are inserted in buildPlan. */
export function expandRoute(route: ReturnType<typeof routeTask>, analysis: TaskAnalysis): AgentId[] {
  const agents = [...route.agents];
  const shipping =
    analysis.asksForChange &&
    (agents.includes("implement") || agents.includes("pr_review") || agents.includes("tests"));

  if (shipping) {
    if (!agents.includes("merge")) agents.push("merge");
    if (!agents.includes("evals")) agents.push("evals");
    if (!agents.includes("pr")) agents.push("pr");
  }

  if (isEngineeringDecision(analysis.input.task) && !agents.includes("consensus")) {
    agents.push("consensus");
  }

  return agents;
}

type PendingStep = {
  agent: AgentId;
  id?: string;
  label?: string;
  why?: string;
  track?: WorkTrack;
  peer?: boolean;
  dependOnIds?: string[];
  gate?: ControlGate;
};

function approvalPending(gate: ControlGate, analysis: TaskAnalysis): PendingStep {
  return {
    agent: "approval",
    id: `gate-${gate.id}`,
    label: gate.label,
    why: gate.reason,
    gate,
  };
}

function expandPending(analysis: TaskAnalysis, agents: AgentId[], forked: boolean): PendingStep[] {
  const mobile = mobileTrackLabel(analysis.input.task);
  const pending: PendingStep[] = [];

  const push = (item: PendingStep) => {
    const prev = pending.at(-1);
    if (
      !item.peer &&
      !item.dependOnIds &&
      !item.gate &&
      prev &&
      !prev.gate &&
      canShareWave(prev.agent, item.agent) &&
      !forked &&
      !isEngineeringDecision(analysis.input.task)
    ) {
      item.peer = true;
    }
    pending.push(item);
  };

  for (const agent of agents) {
    if (forked && agent === "implement") {
      push({
        agent,
        id: "step-implement-backend",
        label: "Backend",
        track: "backend",
        why: "Write the API and token verification. Independent of the mobile client.",
      });
      push({
        agent,
        id: "step-implement-mobile",
        label: mobile,
        track: "mobile",
        peer: true,
        why: `Write the ${mobile} client. Independent of the backend patch.`,
      });
      continue;
    }
    if (forked && agent === "tests") {
      push({
        agent,
        id: "step-tests-backend",
        label: "Backend tests",
        track: "backend",
        dependOnIds: ["step-implement-backend"],
        why: "Cover the server token-verify and account-linking path.",
      });
      push({
        agent,
        id: "step-tests-mobile",
        label: `${mobile} tests`,
        track: "mobile",
        peer: true,
        dependOnIds: ["step-implement-mobile"],
        why: `Cover the ${mobile} Sign-In SDK path.`,
      });
      continue;
    }
    if (forked && agent === "merge") {
      push({
        agent,
        label: "Integration",
        why: "Join the backend and mobile tracks before review.",
      });
      continue;
    }
    push({ agent });
  }

  return pending;
}

function toStep(item: PendingStep, analysis: TaskAnalysis, dependsOn: string[], wave: number): PlanStep {
  return {
    id: item.id ?? `step-${item.agent}`,
    agent: item.agent,
    label: item.label ?? AGENTS[item.agent].short,
    why: item.why ?? WHY[item.agent](analysis, item.gate?.id),
    requiresApproval: Boolean(item.gate) || item.agent === "approval",
    dependsOn,
    gate: item.gate?.id,
    wave,
    track: item.track,
  };
}

export function buildPlan(analysis: TaskAnalysis): ExecutionPlan {
  const route = analysis.route ?? routeTask(analysis);
  const forked = shouldForkTracks(analysis) && expandRoute(route, analysis).includes("implement");
  const agents = reorderForkedAgents(expandRoute(route, analysis), forked);
  const control = buildControlPolicy(analysis, agents);
  const policy = riskPolicyOf(analysis);

  const pending = expandPending(analysis, agents, forked);
  const withGates: PendingStep[] = [];
  const inserted = new Set<GateId>();

  for (const item of pending) {
    for (const gate of control.gates) {
      if (inserted.has(gate.id)) continue;
      if (BEFORE_AGENT[gate.before] === item.agent) {
        withGates.push(approvalPending(gate, analysis));
        inserted.add(gate.id);
      }
    }
    withGates.push(item);
  }

  for (const gate of control.gates) {
    if (!inserted.has(gate.id) && gate.before === "end") {
      withGates.push(approvalPending(gate, analysis));
    }
  }

  const steps: PlanStep[] = [];
  let wave = 0;
  let prevWaveIds: string[] = [];
  let currWaveIds: string[] = [];

  for (const item of withGates) {
    const startWave = !item.peer || currWaveIds.length === 0;
    if (startWave) {
      if (currWaveIds.length) prevWaveIds = currWaveIds;
      currWaveIds = [];
      wave += 1;
    }
    const dependsOn = item.dependOnIds ?? prevWaveIds;
    const step = toStep(item, analysis, dependsOn, wave);
    steps.push(step);
    currWaveIds.push(step.id);
  }

  const principle = analysis.vague
    ? "Do not ask one model to guess the ticket. Ask for evidence, then a human."
    : policy.action === "automatic"
      ? "LOW risk. Planner + Risk Engine → specialists → merger → quality gate → Action. No human gate."
      : policy.action === "tests_review"
        ? "MEDIUM risk. Tests and review must run. Action is automatic after the quality gate."
        : policy.action === "mandatory_human"
          ? "CRITICAL. Mandatory human after the quality gate. The orchestrator never takes Action alone."
          : forked
            ? "HIGH risk. Security Review on the stem. Backend and mobile then run in parallel. Human after the quality gate, then Action."
            : analysis.planner?.shape === "decision" || isEngineeringDecision(analysis.input.task)
              ? "HIGH risk decision. Architect, Performance, Security, and Developer debate. A person accepts the recommendation. No PR."
              : "HIGH risk. Security Review before the patch. Human approval after the quality gate, then Action.";

  const graph = buildExecutionGraph(analysis, steps);

  return {
    steps,
    humanApprovalRequired: control.gates.length > 0,
    approvalReason: control.gates.map((item) => item.reason).join(" "),
    route,
    control,
    principle,
    engineering: buildEngineeringPlan(analysis, steps, control),
    graph,
  };
}

export function planAgentIds(plan: ExecutionPlan): AgentId[] {
  return plan.steps.map((step) => step.agent);
}

export function stepIndex(plan: ExecutionPlan, agent: AgentId) {
  return plan.steps.findIndex((step) => step.agent === agent);
}

export function gateIndex(plan: ExecutionPlan, id: GateId) {
  return plan.steps.findIndex((step) => step.gate === id);
}

export function hasGate(plan: ExecutionPlan, id: GateId) {
  return gateIndex(plan, id) >= 0;
}

export function comesBefore(plan: ExecutionPlan, earlier: AgentId, later: AgentId) {
  const a = stepIndex(plan, earlier);
  const b = stepIndex(plan, later);
  return a >= 0 && b >= 0 && a < b;
}

export function gateBefore(plan: ExecutionPlan, id: GateId, later: AgentId) {
  const a = gateIndex(plan, id);
  const b = stepIndex(plan, later);
  return a >= 0 && b >= 0 && a < b;
}

export function hasAgent(plan: ExecutionPlan, agent: AgentId) {
  return plan.steps.some((step) => step.agent === agent);
}
