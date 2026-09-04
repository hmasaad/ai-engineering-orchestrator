import type { AgentId, TaskType } from "./types";

export type AgentDefinition = {
  id: AgentId;
  label: string;
  short: string;
  role: string;
  origin: string;
};

export const AGENTS: Record<AgentId, AgentDefinition> = {
  bug: {
    id: "bug",
    label: "Bug Investigation",
    short: "Bug Agent",
    role: "Turn symptoms into ranked hypotheses before anyone patches.",
    origin: "Bug investigator — root cause from stacktraces and regressions.",
  },
  research: {
    id: "research",
    label: "Code Research",
    short: "Code Research",
    role: "Gather evidence from the codebase instead of guessing.",
    origin: "Research agent — files, contracts, and call paths.",
  },
  rca: {
    id: "rca",
    label: "Root Cause Analysis",
    short: "Root Cause",
    role: "Lock a cause from evidence, not from the first plausible story.",
    origin: "Bug investigator — RCA after research.",
  },
  architect: {
    id: "architect",
    label: "Software Architect",
    short: "Architect",
    role: "Design the change before code is written.",
    origin: "Architect Agent — boundaries, data, and tradeoffs.",
  },
  tech_debt: {
    id: "tech_debt",
    label: "Technical Debt",
    short: "Tech Debt",
    role: "Name the debt the change would paper over, and whether to pay it now.",
    origin: "Technical debt agent — hotspots and migration cost.",
  },
  security: {
    id: "security",
    label: "Security Review",
    short: "Security",
    role: "Threat-model the change before a fix is generated.",
    origin: "Security Review agent — auth, secrets, and abuse cases.",
  },
  implement: {
    id: "implement",
    label: "Generate Fix",
    short: "Generate Fix",
    role: "Propose a scoped change only after cause and review exist.",
    origin: "Implementation adapter — patch sketch, not a blind LLM edit.",
  },
  tests: {
    id: "tests",
    label: "Test Generation",
    short: "Generate Tests",
    role: "Lock the failure mode with regression coverage.",
    origin: "Test generation — repro, regression, and abuse cases.",
  },
  evals: {
    id: "evals",
    label: "Evals / Quality Gate",
    short: "Evals",
    role: "Score the plan and artifacts. Fail closed.",
    origin: "Evals agent — deterministic gates, not another prompt.",
  },
  pr: {
    id: "pr",
    label: "Create PR",
    short: "Create PR",
    role: "Open a change only after the quality gate passes.",
    origin: "Delivery adapter — PR title, body, and risk notes.",
  },
  pr_review: {
    id: "pr_review",
    label: "PR Reviewer",
    short: "PR Reviewer",
    role: "Review the proposed change with evidence, not vibes.",
    origin: "PR Reviewer agent — blockers, should-fix, nits.",
  },
  approval: {
    id: "approval",
    label: "Human Approval",
    short: "Human Approval",
    role: "A person signs off. The orchestrator never merges.",
    origin: "Control plane — required on high risk, security, and incidents.",
  },
};

export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  bug: "Bug Investigation",
  incident: "Incident",
  security: "Security",
  feature: "Feature",
  architecture: "Architecture",
  tech_debt: "Technical Debt",
  research: "Research",
  refactor: "Refactor",
};

export const AGENT_ORDER: AgentId[] = [
  "bug",
  "research",
  "rca",
  "architect",
  "tech_debt",
  "security",
  "implement",
  "tests",
  "evals",
  "pr",
  "pr_review",
  "approval",
];

export function agentLabel(id: AgentId) {
  return AGENTS[id].label;
}
