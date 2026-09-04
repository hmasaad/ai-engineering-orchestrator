import { AGENTS } from "./roster";
import type { AgentId, ExecutionPlan, PlanStep, Risk, TaskAnalysis } from "./types";

const WHY: Record<AgentId, (analysis: TaskAnalysis) => string> = {
  bug: (a) => `Symptoms point at a failure in ${a.area}. Rank hypotheses before touching code.`,
  research: (a) =>
    a.vague
      ? "Collect the missing facts. Do not invent a ship plan."
      : `Read the ${a.area} paths that could explain this ticket.`,
  rca: (a) => `Turn research in ${a.area} into a single locked cause.`,
  architect: (a) =>
    a.taskType === "architecture"
      ? "Design the system before anyone writes the code."
      : "Shape the change so the fix does not fight the existing architecture.",
  tech_debt: () => "Say whether this change pays debt or buries it.",
  security: (a) =>
    a.area === "Authentication"
      ? "Auth changes can lock people out or let the wrong people in. Review before a patch."
      : "Threat-model the change before generating a fix.",
  implement: () => "Only now propose a scoped patch. Not a one-shot LLM solve.",
  tests: (a) => `Cover the ${a.area} failure mode so the next upgrade does not repeat it.`,
  evals: () => "Score routing, order, and evidence. Fail closed if the plan cheated.",
  pr: () => "Open a PR only after the quality gate passes.",
  pr_review: () => "A specialist reviewer looks at the PR. The orchestrator does not rubber-stamp it.",
  approval: (a) =>
    a.vague
      ? "A human must decide what this ticket even is."
      : `${capitalize(a.risk)} risk. A person signs off. Nothing merges itself.`,
};

function capitalize(risk: Risk) {
  return risk.charAt(0).toUpperCase() + risk.slice(1);
}

export function approvalRequired(analysis: TaskAnalysis, agents: AgentId[]) {
  if (analysis.vague) {
    return {
      required: true,
      reason: "The ticket is incomplete. A human must clarify before any change is generated.",
    };
  }
  if (agents.includes("approval") || agents.includes("security")) {
    if (analysis.risk === "critical") {
      return { required: true, reason: "Critical risk. Human approval is mandatory." };
    }
    if (analysis.risk === "high") {
      return { required: true, reason: "High risk. Human approval is required before merge." };
    }
    if (agents.includes("security")) {
      return { required: true, reason: "Security Review is in the plan, so a human must sign off." };
    }
  }
  if (analysis.taskType === "incident") {
    return { required: true, reason: "Incidents always stop for a human." };
  }
  return { required: false, reason: "Low/medium non-security work can ship after evals without a gate." };
}

export function buildPlan(analysis: TaskAnalysis): ExecutionPlan {
  const agents = [...analysis.requiredAgents];
  const gate = approvalRequired(analysis, agents);
  if (gate.required && !agents.includes("approval")) agents.push("approval");

  const steps: PlanStep[] = [];
  for (const agent of agents) {
    const prev = steps.at(-1);
    steps.push({
      id: `step-${agent}`,
      agent,
      label: AGENTS[agent].short,
      why: WHY[agent](analysis),
      requiresApproval: agent === "approval",
      dependsOn: prev ? [prev.id] : [],
    });
  }

  return {
    steps,
    humanApprovalRequired: gate.required,
    approvalReason: gate.reason,
    principle: analysis.vague
      ? "Do not ask one model to guess the ticket. Ask for evidence, then a human."
      : "Do not ask one model to solve this. Route, review, eval, then a human if the risk says so.",
  };
}

export function planAgentIds(plan: ExecutionPlan): AgentId[] {
  return plan.steps.map((step) => step.agent);
}

export function stepIndex(plan: ExecutionPlan, agent: AgentId) {
  return plan.steps.findIndex((step) => step.agent === agent);
}

export function comesBefore(plan: ExecutionPlan, earlier: AgentId, later: AgentId) {
  const a = stepIndex(plan, earlier);
  const b = stepIndex(plan, later);
  return a >= 0 && b >= 0 && a < b;
}

export function hasAgent(plan: ExecutionPlan, agent: AgentId) {
  return plan.steps.some((step) => step.agent === agent);
}
