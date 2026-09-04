import { hasArea } from "./classify";
import { comesBefore, hasAgent } from "./plan";
import { isSimpleUi } from "./router";
import { riskPolicyOf } from "./risk";
import type { ExecutionPlan, TaskAnalysis } from "./types";

const INJECTION_HINTS = [
  "ignore previous",
  "ignore all previous",
  "disregard previous",
  "disregard all previous",
  "forget previous",
  "forget your instructions",
  "new instructions:",
  "system prompt",
  "skip security",
  "skip the security",
  "do not run security",
  "without security review",
  "jailbreak",
];

const POISONING_HINTS = [
  "knowledge base",
  "retrieved context",
  "retrieved document",
  "the wiki says",
  "the docs say skip",
  "according to the docs",
  "trusted document",
  "vector store",
  "according to the knowledge",
];

const HIJACK_HINTS = [
  "from now on you are",
  "you are now a",
  "you are a developer only",
  "only the developer",
  "act as a developer only",
  "open a pr immediately",
  "open a pull request immediately",
  "cancel the orchestrator",
  "approve yourself",
  "you must merge",
  "ignore the orchestrator",
];

function hay(text: string) {
  return ` ${text.toLowerCase().replace(/\s+/g, " ").trim()} `;
}

function any(text: string, needles: string[]) {
  const h = hay(text);
  return needles.some((needle) => h.includes(needle.toLowerCase()));
}

export type GuardrailHits = {
  promptInjection: boolean;
  ragPoisoning: boolean;
  agentHijacking: boolean;
};

export function detectGuardrails(ticket: string): GuardrailHits {
  return {
    promptInjection: any(ticket, INJECTION_HINTS),
    ragPoisoning: any(ticket, POISONING_HINTS),
    agentHijacking: any(ticket, HIJACK_HINTS),
  };
}

function needsSecurityReview(analysis: TaskAnalysis, plan: ExecutionPlan) {
  const ship = hasAgent(plan, "implement") || hasAgent(plan, "pr");
  if (!ship) return false;
  return (
    analysis.taskType === "security" ||
    analysis.taskType === "incident" ||
    hasArea(analysis, "authentication") ||
    hasArea(analysis, "payments") ||
    hasArea(analysis, "privacy") ||
    hasArea(analysis, "security")
  );
}

function securityHeld(analysis: TaskAnalysis, plan: ExecutionPlan) {
  if (!needsSecurityReview(analysis, plan)) return true;
  return hasAgent(plan, "security") && comesBefore(plan, "security", "implement");
}

function humanHeld(analysis: TaskAnalysis, plan: ExecutionPlan) {
  const policy = riskPolicyOf(analysis);
  if (analysis.vague && !hasAgent(plan, "approval")) return false;
  if (policy.require_human && !hasAgent(plan, "approval")) return false;
  return true;
}

function notHijacked(analysis: TaskAnalysis, plan: ExecutionPlan) {
  const policy = riskPolicyOf(analysis);
  if (analysis.vague || analysis.taskType === "research") {
    return !hasAgent(plan, "implement") && !hasAgent(plan, "pr");
  }
  if (!hasAgent(plan, "implement") && !hasAgent(plan, "pr")) return true;
  const specialists = plan.steps.map((step) => step.agent).filter((id) => id !== "approval");
  if (specialists.length <= 1) return false;
  if (!hasAgent(plan, "evals")) return false;
  if (policy.require_tests && !hasAgent(plan, "tests")) return false;
  if (policy.require_security && !hasAgent(plan, "security")) return false;
  if (!isSimpleUi(analysis) && policy.require_tests && !hasAgent(plan, "tests")) return false;
  return true;
}

/** True when attack language in the ticket did not change routing or drop gates. */
export function heldTheLine(analysis: TaskAnalysis, plan: ExecutionPlan) {
  return securityHeld(analysis, plan) && humanHeld(analysis, plan) && notHijacked(analysis, plan);
}
