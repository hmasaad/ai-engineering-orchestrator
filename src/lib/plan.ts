import { AGENTS } from "./roster";
import { hasArea } from "./classify";
import { buildControlPolicy } from "./control";
import { isSimpleUi, routeTask } from "./router";
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
  implement: (a) =>
    isSimpleUi(a)
      ? "A simple UI change can go straight to a scoped patch after ship approval."
      : "Only now write the scoped change. Not a one-shot LLM solve.",
  tests: (a) => `Cover the ${a.area} change so the next edit does not regress it.`,
  evals: () => "Score routing, order, and evidence. Fail closed if the plan cheated.",
  pr: () => "Open a PR only after the quality gate and ship approval pass.",
  pr_review: () => "A specialist reviewer looks at the PR. The orchestrator does not rubber-stamp it.",
  approval: (a, gate) =>
    a.vague
      ? "A human must decide what this ticket even is."
      : gate === "plan"
        ? "A person must approve the plan before Implementation."
        : "A person must approve before a PR is opened. Nothing merges itself.",
};

const BEFORE_AGENT: Record<ControlGate["before"], AgentId | null> = {
  developer: "implement",
  pr: "pr",
  end: null,
};

/** Specialists only. Control gates are inserted in buildPlan. */
export function expandRoute(route: ReturnType<typeof routeTask>, analysis: TaskAnalysis): AgentId[] {
  const agents = [...route.agents];
  const shipping = agents.includes("implement") || agents.includes("pr_review") || agents.includes("tests");

  if (shipping) {
    if (!agents.includes("evals")) {
      const at = agents.indexOf("pr_review");
      agents.splice(at >= 0 ? at : agents.length, 0, "evals");
    }
    if (!agents.includes("pr") && agents.includes("pr_review")) {
      agents.splice(agents.indexOf("pr_review"), 0, "pr");
    }
  }

  return agents;
}

function approvalStep(gate: ControlGate, analysis: TaskAnalysis, prevId: string | undefined): PlanStep {
  return {
    id: `gate-${gate.id}`,
    agent: "approval",
    label: gate.label,
    why: gate.reason,
    requiresApproval: true,
    dependsOn: prevId ? [prevId] : [],
    gate: gate.id,
  };
}

function specialistStep(agent: AgentId, analysis: TaskAnalysis, prevId: string | undefined): PlanStep {
  return {
    id: `step-${agent}`,
    agent,
    label: AGENTS[agent].short,
    why: WHY[agent](analysis),
    requiresApproval: false,
    dependsOn: prevId ? [prevId] : [],
  };
}

export function buildPlan(analysis: TaskAnalysis): ExecutionPlan {
  const route = analysis.route ?? routeTask(analysis);
  const agents = expandRoute(route, analysis);
  const control = buildControlPolicy(analysis, agents);

  const steps: PlanStep[] = [];
  const inserted = new Set<GateId>();

  const push = (step: PlanStep) => {
    steps.push(step);
  };

  for (const agent of agents) {
    for (const item of control.gates) {
      if (inserted.has(item.id)) continue;
      if (BEFORE_AGENT[item.before] === agent) {
        push(approvalStep(item, analysis, steps.at(-1)?.id));
        inserted.add(item.id);
      }
    }
    push(specialistStep(agent, analysis, steps.at(-1)?.id));
  }

  for (const item of control.gates) {
    if (!inserted.has(item.id) && item.before === "end") {
      push(approvalStep(item, analysis, steps.at(-1)?.id));
    }
  }

  return {
    steps,
    humanApprovalRequired: control.gates.length > 0,
    approvalReason: control.gates.map((item) => item.reason).join(" "),
    route,
    control,
    principle: analysis.vague
      ? "Do not ask one model to guess the ticket. Ask for evidence, then a human."
      : isSimpleUi(analysis)
        ? "A simple UI change is not a feature parade, but a person still approves before a PR."
        : "Agents do not run autonomously. Plan approval, then code, then ship approval, then a PR.",
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
