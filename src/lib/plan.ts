import { AGENTS } from "./roster";
import { hasArea } from "./classify";
import { buildControlPolicy } from "./control";
import { isSimpleUi, routeTask } from "./router";
import { riskPolicyOf } from "./risk";
import type {
  AgentId,
  ControlGate,
  ExecutionPlan,
  GateId,
  PlanStep,
  TaskAnalysis,
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
    a.taskType === "architecture"
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
    isSimpleUi(a)
      ? "LOW risk UI patch. Write the scoped change; the quality gate still runs."
      : "Only now write the scoped change. Not a one-shot LLM solve.",
  tests: (a) => `Cover the ${a.area} change so the next edit does not regress it.`,
  pr_review: () => "Review the merged change with evidence before the quality gate.",
  merge: () => "Fold specialist outputs into one result before the quality gate.",
  evals: () =>
    "Score correctness, security, tests, architecture, regression, and code quality. Fail closed.",
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
  const shipping = agents.includes("implement") || agents.includes("pr_review") || agents.includes("tests");

  if (shipping) {
    if (!agents.includes("merge")) agents.push("merge");
    if (!agents.includes("evals")) agents.push("evals");
    if (!agents.includes("pr")) agents.push("pr");
  }

  void analysis;
  return agents;
}

function approvalStep(gate: ControlGate, analysis: TaskAnalysis, prevId: string | undefined, wave: number): PlanStep {
  return {
    id: `gate-${gate.id}`,
    agent: "approval",
    label: gate.label,
    why: gate.reason,
    requiresApproval: true,
    dependsOn: prevId ? [prevId] : [],
    gate: gate.id,
    wave,
  };
}

function specialistStep(
  agent: AgentId,
  analysis: TaskAnalysis,
  prevId: string | undefined,
  wave: number,
): PlanStep {
  return {
    id: `step-${agent}`,
    agent,
    label: AGENTS[agent].short,
    why: WHY[agent](analysis),
    requiresApproval: false,
    dependsOn: prevId ? [prevId] : [],
    wave,
  };
}

function nextWave(prev: PlanStep | undefined, agent: AgentId): number {
  const base = prev?.wave ?? 0;
  const dynamic = new Set<AgentId>(["security", "database", "performance"]);
  if (prev && dynamic.has(prev.agent) && dynamic.has(agent)) {
    return prev.wave;
  }
  if (
    prev &&
    (agent === "tests" || agent === "pr_review") &&
    (prev.agent === "tests" || prev.agent === "pr_review")
  ) {
    return prev.wave;
  }
  return base + 1;
}

export function buildPlan(analysis: TaskAnalysis): ExecutionPlan {
  const route = analysis.route ?? routeTask(analysis);
  const agents = expandRoute(route, analysis);
  const control = buildControlPolicy(analysis, agents);
  const policy = riskPolicyOf(analysis);

  const steps: PlanStep[] = [];
  const inserted = new Set<GateId>();

  for (const agent of agents) {
    for (const item of control.gates) {
      if (inserted.has(item.id)) continue;
      if (BEFORE_AGENT[item.before] === agent) {
        const wave = nextWave(steps.at(-1), "approval");
        steps.push(approvalStep(item, analysis, steps.at(-1)?.id, wave));
        inserted.add(item.id);
      }
    }
    const wave = nextWave(steps.at(-1), agent);
    steps.push(specialistStep(agent, analysis, steps.at(-1)?.id, wave));
  }

  for (const item of control.gates) {
    if (!inserted.has(item.id) && item.before === "end") {
      steps.push(approvalStep(item, analysis, steps.at(-1)?.id, nextWave(steps.at(-1), "approval")));
    }
  }

  const principle = analysis.vague
    ? "Do not ask one model to guess the ticket. Ask for evidence, then a human."
    : policy.action === "automatic"
      ? "LOW risk. Planner + Risk Engine → specialists → merger → quality gate → Action. No human gate."
      : policy.action === "tests_review"
        ? "MEDIUM risk. Tests and review must run. Action is automatic after the quality gate."
        : policy.action === "mandatory_human"
          ? "CRITICAL. Mandatory human after the quality gate. The orchestrator never takes Action alone."
          : "HIGH risk. Security Review before the patch. Human approval after the quality gate, then Action.";

  return {
    steps,
    humanApprovalRequired: control.gates.length > 0,
    approvalReason: control.gates.map((item) => item.reason).join(" "),
    route,
    control,
    principle,
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
