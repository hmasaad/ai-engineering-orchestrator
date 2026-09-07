import type { AgentId, RoutePattern, TaskType } from "./types";

export type AgentDefinition = {
  id: AgentId;
  label: string;
  short: string;
  role: string;
  origin: string;
};

export const AGENTS: Record<AgentId, AgentDefinition> = {
  requirements: {
    id: "requirements",
    label: "Requirements Agent",
    short: "Requirements",
    role: "Turn a feature ticket into requirements before anyone designs or codes.",
    origin: "Product/requirements pass — scope, constraints, and success checks.",
  },
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
    label: "Architect Agent",
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
    label: "Security Agent",
    short: "Security",
    role: "Threat-model the change before a fix is generated.",
    origin: "Security Review agent — auth, secrets, and abuse cases.",
  },
  database: {
    id: "database",
    label: "Database Agent",
    short: "Database",
    role: "Review schema, migrations, and data compatibility before Developer writes SQL.",
    origin: "Database specialist — additive fields vs destructive drops.",
  },
  performance: {
    id: "performance",
    label: "Performance Agent",
    short: "Performance",
    role: "Find the cost (query, render, latency) before anyone patches a slow path.",
    origin: "Performance specialist — p95, N+1, and hot lists.",
  },
  implement: {
    id: "implement",
    label: "Developer Agent",
    short: "Developer",
    role: "Write the scoped change only after the routed specialists have done their pass.",
    origin: "Implementation adapter — patch sketch, not a blind LLM edit.",
  },
  tests: {
    id: "tests",
    label: "Testing Agent",
    short: "Testing",
    role: "Lock the change with coverage so the next edit does not regress it.",
    origin: "Test generation — repro, regression, and abuse cases.",
  },
  pr_review: {
    id: "pr_review",
    label: "PR Reviewer",
    short: "PR Reviewer",
    role: "Review the proposed change with evidence, not vibes.",
    origin: "PR Reviewer agent — blockers, should-fix, nits.",
  },
  merge: {
    id: "merge",
    label: "Result Merger",
    short: "Result Merger",
    role: "Fold specialist outputs into one result before the quality gate.",
    origin: "Control plane — one merged artifact, not hallway notes.",
  },
  evals: {
    id: "evals",
    label: "Evals / Quality Gate",
    short: "Evals",
    role: "Score the merged result. Fail closed.",
    origin: "Evals agent — deterministic gates, not another prompt.",
  },
  approval: {
    id: "approval",
    label: "Human Approval",
    short: "Human Approval",
    role: "A person signs off after the quality gate when risk requires it.",
    origin: "Control plane — HIGH and CRITICAL. The orchestrator never merges.",
  },
  pr: {
    id: "pr",
    label: "Action",
    short: "Action",
    role: "Open a change only after the quality gate (and human, when required).",
    origin: "Delivery adapter — PR title, body, and risk notes. Never merge.",
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
  "requirements",
  "bug",
  "research",
  "rca",
  "architect",
  "tech_debt",
  "security",
  "database",
  "performance",
  "implement",
  "tests",
  "pr_review",
  "merge",
  "evals",
  "approval",
  "pr",
];

export const PATTERN_LABEL: Record<RoutePattern, string> = {
  feature: "Feature request",
  ui: "Simple UI change",
  schema: "Schema change",
  deploy: "Production deploy",
  bug: "Bug investigation",
  incident: "Incident",
  security: "Security",
  research: "Research",
  debt: "Technical debt",
  architecture: "Architecture",
  vague: "Needs clarification",
  performance: "Performance issue",
};

export function agentLabel(id: AgentId) {
  return AGENTS[id].label;
}
