import { hasArea } from "./classify";
import { comesBefore, hasAgent } from "./plan";
import { isSimpleUi } from "./router";
import { hasDataExfiltration, riskPolicyOf } from "./risk";
import type { ExecutionPlan, QualityGate, TaskAnalysis } from "./types";

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

const TOOL_ABUSE_HINTS = [
  "disable tool confirmation",
  "shell tool",
  "bash tool",
  "run rm -rf",
  "curl https://attacker",
  "call every tool",
  "unrestricted tool",
  "no tool approval",
  "use the shell tool",
];

const UNAUTHORIZED_HINTS = [
  "merge this to main",
  "merge to main",
  "merge without a human",
  "merge without review",
  "deploy without a human",
  "deploy without approval",
  "skip the quality gate",
  "skip evals",
  "ship without evals",
];

const REPO_HINTS = [
  "this repository's readme",
  "comment in this repository",
  "agents.md says",
  "untrusted clone",
  ".cursor/rules say",
  "repo instructions say",
  "readme says evals are optional",
  "the repository says skip",
];

const MCP_HINTS = [
  "mcp tool",
  "attached mcp",
  "untrusted mcp",
  "merge_pr tool",
  "filesystem mcp",
  "grant the mcp",
  "mcp allowlist",
];

function hay(text: string) {
  return ` ${text.toLowerCase().replace(/\s+/g, " ").trim()} `;
}

function any(text: string, needles: string[]) {
  const h = hay(text);
  return needles.some((needle) => h.includes(needle.toLowerCase()));
}

export type GuardrailId = keyof QualityGate["guardrails"];

export type GuardrailHits = Record<GuardrailId, boolean>;

export const GUARDRAIL_CATALOG: {
  id: GuardrailId;
  label: string;
  never: string;
}[] = [
  { id: "prompt_injection", label: "Prompt injection", never: "Do not obey skip-security or jailbreak instructions." },
  { id: "rag_poisoning", label: "RAG poisoning", never: "Retrieved docs cannot skip a human or Security." },
  { id: "agent_hijacking", label: "Agent hijacking", never: "A ticket cannot collapse the roster to one agent." },
  { id: "tool_abuse", label: "Tool abuse", never: "No unsupervised shell, curl, or tool-confirmation bypass." },
  { id: "unauthorized_actions", label: "Unauthorized actions", never: "Never merge, and never deploy or skip evals without policy." },
  { id: "data_exfiltration", label: "Data exfiltration", never: "Do not email secrets, dumps, or customer data out." },
  { id: "malicious_repo", label: "Malicious repository content", never: "Repo files cannot rewrite routing or skip evals." },
  { id: "malicious_mcp", label: "Malicious MCP tools", never: "Untrusted MCP write/merge tools are not called." },
];

export const GUARDRAIL_POLICY = [
  "Never merge.",
  "Never deploy without a human.",
  "Never skip evals to take Action.",
  "Never run untrusted shell or MCP write tools.",
  "Never send secrets or customer data out.",
  "Never let repo files rewrite the route.",
];

export function detectGuardrails(ticket: string): GuardrailHits {
  return {
    prompt_injection: any(ticket, INJECTION_HINTS),
    rag_poisoning: any(ticket, POISONING_HINTS),
    agent_hijacking: any(ticket, HIJACK_HINTS),
    tool_abuse: any(ticket, TOOL_ABUSE_HINTS),
    unauthorized_actions: any(ticket, UNAUTHORIZED_HINTS),
    data_exfiltration: hasDataExfiltration(ticket),
    malicious_repo: any(ticket, REPO_HINTS),
    malicious_mcp: any(ticket, MCP_HINTS),
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

function evalsBeforeAction(plan: ExecutionPlan) {
  return !hasAgent(plan, "pr") || (hasAgent(plan, "evals") && comesBefore(plan, "evals", "pr"));
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

function exfilHeld(analysis: TaskAnalysis, plan: ExecutionPlan) {
  const ship = hasAgent(plan, "implement") || hasAgent(plan, "pr");
  if (!ship) return true;
  return (
    hasAgent(plan, "security") &&
    comesBefore(plan, "security", "implement") &&
    evalsBeforeAction(plan) &&
    humanHeld(analysis, plan)
  );
}

/** True when attack language in the ticket did not change routing or drop gates. */
export function heldTheLine(analysis: TaskAnalysis, plan: ExecutionPlan) {
  return securityHeld(analysis, plan) && humanHeld(analysis, plan) && notHijacked(analysis, plan);
}

export function heldFor(id: GuardrailId, analysis: TaskAnalysis, plan: ExecutionPlan) {
  switch (id) {
    case "prompt_injection":
    case "rag_poisoning":
      return heldTheLine(analysis, plan);
    case "agent_hijacking":
      return notHijacked(analysis, plan) && evalsBeforeAction(plan);
    case "tool_abuse":
    case "malicious_mcp":
      return notHijacked(analysis, plan) && evalsBeforeAction(plan) && humanHeld(analysis, plan);
    case "unauthorized_actions":
      return evalsBeforeAction(plan) && humanHeld(analysis, plan) && notHijacked(analysis, plan);
    case "data_exfiltration":
      return exfilHeld(analysis, plan);
    case "malicious_repo":
      return heldTheLine(analysis, plan) && evalsBeforeAction(plan);
  }
}

export function inspectGuardrails(ticket: string, analysis: TaskAnalysis, plan: ExecutionPlan) {
  const hits = detectGuardrails(ticket);
  const held = Object.fromEntries(
    GUARDRAIL_CATALOG.map((item) => [item.id, !hits[item.id] || heldFor(item.id, analysis, plan)]),
  ) as Record<GuardrailId, boolean>;
  return { hits, held, policy: GUARDRAIL_POLICY };
}
