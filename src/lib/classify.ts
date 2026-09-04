import { TASK_TYPE_LABEL } from "./roster";
import type { AgentId, MissingQuestion, Risk, TaskAnalysis, TaskType } from "./types";

const BUG_HINTS = [
  "bug",
  "crash",
  "error",
  "fail",
  "failed",
  "broken",
  "randomly",
  "logged out",
  "log out",
  "logout",
  "doesn't work",
  "does not work",
  "regression",
  "stacktrace",
  "stack trace",
  "exception",
  "unable to",
  "can't",
  "cannot",
  "users are",
  "customers are",
  "getting logged",
  "not working",
  "wrong",
  "unexpected",
];

const INCIDENT_HINTS = [
  "outage",
  "p0",
  "p1",
  "sev1",
  "sev-1",
  "severity 1",
  "is down",
  "site down",
  "service down",
  "on-call",
  "oncall",
  "production is",
  "prod is",
  "incident",
];

const SECURITY_HINTS = [
  "xss",
  "csrf",
  "injection",
  "cve",
  "vulnerability",
  "vulnerabilities",
  "auth bypass",
  "privilege",
  "secret leak",
  "leaked secret",
  "rce",
  "ssrf",
  "path traversal",
  "idor",
  "rate limit",
  "rate-limit",
  "brute force",
  "session fixation",
];

const FEATURE_HINTS = [
  "add ",
  "build ",
  "implement ",
  "new feature",
  "we want",
  "we need users",
  "customers can",
  "let users",
  "product requirement",
  "ship a",
  "support ",
];

const ARCH_HINTS = [
  "architecture",
  "design the system",
  "system design",
  "migrate to",
  "microservices",
  "modular monolith",
  "scale to",
  "10 million",
  "10m users",
];

const DEBT_HINTS = [
  "tech debt",
  "technical debt",
  "refactor",
  "cleanup",
  "clean up",
  "unused css",
  "unused code",
  "deprecate",
  "legacy",
  "pay down",
];

const RESEARCH_HINTS = [
  "how does",
  "how do we",
  "how do the",
  "explain",
  "where is",
  "what does",
  "investigate how",
  "document how",
  "walk me through",
];

const CHANGE_HINTS = [
  "fix",
  "patch",
  "ship",
  "implement",
  "add ",
  "build ",
  "change",
  "update",
  "migrate",
  "refactor",
  "cleanup",
  "clean up",
  "create pr",
  "open a pr",
  "users are",
  "customers are",
];

const AUTH_HINTS = [
  "auth",
  "login",
  "log in",
  "logout",
  "log out",
  "logged out",
  "session",
  "token",
  "password",
  "oauth",
  "jwt",
  "refresh token",
  "sign in",
  "signin",
];

const PAYMENT_HINTS = [
  "payment",
  "stripe",
  "billing",
  "charge",
  "refund",
  "payout",
  "checkout",
  "card",
  "ledger",
  "idempoten",
];

const PII_HINTS = ["pii", "phi", "patient", "gdpr", "personal data", "email address", "ssn"];

const BOOKING_HINTS = ["book", "booking", "appointment", "salon", "slot", "stylist"];

const UI_HINTS = ["css", "ui", "button", "screen", "layout", "copy", "typo", "settings screen"];

const DOCS_HINTS = ["readme", "docs", "documentation", "comment", "typo"];

const CRITICAL_HINTS = [
  "p0",
  "sev1",
  "outage",
  "data loss",
  "rce",
  "auth bypass",
  "double-charge",
  "double charge",
  "production is down",
];

const VAGUE_EXACT = [
  "fix",
  "fix it",
  "fix this",
  "it's broken",
  "its broken",
  "bug",
  "help",
  "issue",
  "please fix",
  "this is broken",
  "broken",
];

function hay(text: string) {
  return ` ${text.toLowerCase().replace(/\s+/g, " ").trim()} `;
}

function hits(text: string, needles: string[]) {
  const h = hay(text);
  return needles.filter((needle) => {
    const n = needle.toLowerCase();
    if (n.includes(" ")) return h.includes(n);
    return new RegExp(`[^a-z0-9]${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^a-z0-9]`).test(h);
  });
}

function any(text: string, needles: string[]) {
  return hits(text, needles).length > 0;
}

export function detectArea(ticket: string): string {
  if (any(ticket, AUTH_HINTS)) return "Authentication";
  if (any(ticket, PAYMENT_HINTS)) return "Payments";
  if (any(ticket, PII_HINTS)) return "PII / Privacy";
  if (any(ticket, BOOKING_HINTS)) return "Booking";
  if (any(ticket, DOCS_HINTS) && !any(ticket, BUG_HINTS)) return "Documentation";
  if (any(ticket, UI_HINTS)) return "UI";
  if (any(ticket, ARCH_HINTS)) return "Platform";
  return "Application";
}

export function isVague(ticket: string): boolean {
  const trimmed = ticket.trim();
  if (trimmed.length < 24) return true;
  if (VAGUE_EXACT.includes(trimmed.toLowerCase().replace(/[.!?]+$/, ""))) return true;
  const words = trimmed.split(/\s+/);
  if (words.length < 5) return true;
  const hasType =
    any(ticket, BUG_HINTS) ||
    any(ticket, FEATURE_HINTS) ||
    any(ticket, SECURITY_HINTS) ||
    any(ticket, RESEARCH_HINTS) ||
    any(ticket, ARCH_HINTS) ||
    any(ticket, DEBT_HINTS) ||
    any(ticket, INCIDENT_HINTS);
  const hasArea = detectArea(ticket) !== "Application";
  if (!hasType && !hasArea) return true;
  return false;
}

function detectType(ticket: string, vague: boolean): TaskType {
  if (vague) return "research";
  if (any(ticket, INCIDENT_HINTS)) return "incident";
  if (any(ticket, SECURITY_HINTS)) return "security";
  const researchOnly =
    any(ticket, RESEARCH_HINTS) &&
    !any(ticket, ["users are", "customers are", "fix the", "patch", "logged out", "crash"]);
  if (researchOnly) return "research";
  if (any(ticket, ARCH_HINTS) && !any(ticket, BUG_HINTS)) return "architecture";
  if (any(ticket, DEBT_HINTS) && !any(ticket, BUG_HINTS) && !any(ticket, INCIDENT_HINTS)) {
    return any(ticket, ["refactor"]) ? "refactor" : "tech_debt";
  }
  if (any(ticket, BUG_HINTS)) return "bug";
  if (any(ticket, FEATURE_HINTS)) return "feature";
  if (any(ticket, DEBT_HINTS)) return "tech_debt";
  return "feature";
}

function detectRisk(ticket: string, taskType: TaskType, area: string, vague: boolean): Risk {
  if (any(ticket, CRITICAL_HINTS) || taskType === "incident") return "critical";
  if (vague && taskType === "research") return "low";
  if (
    area === "Authentication" ||
    area === "Payments" ||
    area === "PII / Privacy" ||
    taskType === "security"
  ) {
    if (taskType === "research") return "medium";
    return "high";
  }
  if (taskType === "architecture") return "medium";
  if (area === "Documentation" || area === "UI") {
    if (taskType === "bug") return "medium";
    return "low";
  }
  if (taskType === "bug") return "medium";
  if (taskType === "tech_debt" || taskType === "refactor") return "low";
  return "medium";
}

function asksForChange(ticket: string, taskType: TaskType, vague: boolean) {
  if (vague) return false;
  if (taskType === "research" || taskType === "architecture") return false;
  if (
    taskType === "bug" ||
    taskType === "incident" ||
    taskType === "security" ||
    taskType === "feature" ||
    taskType === "tech_debt" ||
    taskType === "refactor"
  ) {
    return true;
  }
  return any(ticket, CHANGE_HINTS);
}

function missingQuestions(ticket: string, vague: boolean, area: string): MissingQuestion[] {
  if (!vague) return [];
  const questions: MissingQuestion[] = [
    {
      question: "What exactly is failing, for whom, and since when?",
      whyItMatters: "Without a symptom, the orchestrator would invent a twelve-step ship plan.",
    },
    {
      question: "Is this a bug, a feature, a security issue, or a question?",
      whyItMatters: "Task type decides which specialists run. Guessing here is how you skip security or skip research.",
    },
  ];
  if (area === "Application") {
    questions.push({
      question: "Which product area is involved (auth, payments, booking, UI)?",
      whyItMatters: "Area drives risk and whether Security Review is required.",
    });
  }
  return questions;
}

function requiredAgents(taskType: TaskType, risk: Risk, area: string, change: boolean, vague: boolean): AgentId[] {
  if (vague) return ["research", "approval"];
  if (taskType === "research") return ["research"];
  if (taskType === "architecture") return ["research", "architect", "security"];

  const securityNeeded =
    taskType === "security" ||
    taskType === "incident" ||
    risk === "high" ||
    risk === "critical" ||
    area === "Authentication" ||
    area === "Payments" ||
    area === "PII / Privacy";

  if (taskType === "incident" || taskType === "bug") {
    const agents: AgentId[] = ["bug", "research", "rca"];
    if (securityNeeded) agents.push("security");
    if (change) agents.push("implement", "tests", "evals", "pr", "pr_review");
    if (risk === "high" || risk === "critical" || securityNeeded) agents.push("approval");
    return agents;
  }

  if (taskType === "security") {
    const agents: AgentId[] = ["research", "security"];
    if (change) agents.push("implement", "tests", "evals", "pr", "pr_review");
    agents.push("approval");
    return agents;
  }

  if (taskType === "tech_debt" || taskType === "refactor") {
    const agents: AgentId[] = ["tech_debt", "research"];
    if (risk !== "low") agents.push("architect");
    if (securityNeeded) agents.push("security");
    if (change) agents.push("implement", "tests", "evals", "pr", "pr_review");
    if (risk === "high" || risk === "critical" || securityNeeded) agents.push("approval");
    return agents;
  }

  const agents: AgentId[] = ["research", "architect"];
  if (securityNeeded || risk !== "low") agents.push("security");
  if (change) agents.push("implement", "tests", "evals", "pr", "pr_review");
  if (risk === "high" || risk === "critical" || securityNeeded) agents.push("approval");
  return agents;
}

export function classifyTicket(ticket: string): TaskAnalysis {
  const text = ticket.trim();
  const vague = isVague(text);
  const area = detectArea(text);
  const taskType = detectType(text, vague);
  const risk = detectRisk(text, taskType, area, vague);
  const change = asksForChange(text, taskType, vague);
  const agents = requiredAgents(taskType, risk, area, change, vague);
  const signals = [
    ...hits(text, INCIDENT_HINTS).map((s) => `incident:${s.trim()}`),
    ...hits(text, SECURITY_HINTS).map((s) => `security:${s.trim()}`),
    ...hits(text, BUG_HINTS).map((s) => `bug:${s.trim()}`),
    ...hits(text, AUTH_HINTS).map((s) => `area:${s.trim()}`),
    ...hits(text, RESEARCH_HINTS).map((s) => `research:${s.trim()}`),
    ...hits(text, DEBT_HINTS).map((s) => `debt:${s.trim()}`),
    ...hits(text, ARCH_HINTS).map((s) => `arch:${s.trim()}`),
  ].slice(0, 8);

  const summary = vague
    ? "Ticket is too thin to dispatch a ship plan. Research the question, then a human decides."
    : `${TASK_TYPE_LABEL[taskType]} in ${area}, ${risk} risk. Dispatch specialists instead of one model.`;

  return {
    taskType,
    taskTypeLabel: TASK_TYPE_LABEL[taskType],
    risk,
    area,
    summary,
    requiredAgents: agents,
    signals,
    asksForChange: change,
    vague,
    missing: missingQuestions(text, vague, area),
  };
}
