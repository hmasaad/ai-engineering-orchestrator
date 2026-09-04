import { TASK_TYPE_LABEL } from "./roster";
import { detectControlKinds } from "./control";
import { buildPlanner } from "./planner";
import { scoreRisk } from "./risk";
import { routeTask } from "./router";
import type {
  AreaId,
  MissingQuestion,
  TaskAnalysis,
  TaskInput,
  TaskType,
  TaskUnderstanding,
} from "./types";

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

const SOCIAL_HINTS = [
  "social login",
  "social auth",
  "google login",
  "google sign",
  "sign in with google",
  "signin with google",
  "oauth",
  "openid",
  "sso",
];

const BACKEND_HINTS = [
  "backend",
  "api",
  "endpoint",
  "server",
  "webhook",
  "handler",
  "service",
];

const MOBILE_HINTS = ["mobile", "ios", "android", "flutter", "react native"];

const FRONTEND_HINTS = ["frontend", "web", "browser", "next.js", "react"];

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
  "google",
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

const SCHEMA_HINTS = [
  "database field",
  "add a field",
  "add a column",
  "add column",
  "users table",
  "schema",
  "last_login",
];

const UI_HINTS = ["css", "ui", "button", "screen", "layout", "copy", "typo", "settings screen"];

const DOCS_HINTS = ["readme", "docs", "documentation", "comment", "typo"];

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

export const AREA_LABEL: Record<AreaId, string> = {
  authentication: "Authentication",
  backend: "Backend",
  mobile: "Mobile",
  frontend: "Frontend",
  security: "Security",
  payments: "Payments",
  privacy: "PII / Privacy",
  booking: "Booking",
  ui: "UI",
  documentation: "Documentation",
  platform: "Platform",
  application: "Application",
};

const AREA_ORDER: AreaId[] = [
  "authentication",
  "backend",
  "mobile",
  "frontend",
  "security",
  "payments",
  "privacy",
  "booking",
  "ui",
  "documentation",
  "platform",
  "application",
];

export function asTaskInput(input: TaskInput | string): TaskInput {
  if (typeof input === "string") return { task: input };
  return {
    task: input.task ?? "",
    repository: input.repository?.trim() || undefined,
    branch: input.branch?.trim() || undefined,
  };
}

export function corpusOf(input: TaskInput) {
  return [input.task, input.repository, input.branch].filter(Boolean).join(" ");
}

export function hasArea(analysis: Pick<TaskAnalysis, "areas">, id: AreaId) {
  return analysis.areas.includes(id);
}

export function toUnderstanding(analysis: TaskAnalysis): TaskUnderstanding {
  return {
    type: analysis.taskType,
    risk: analysis.risk,
    areas: analysis.areas,
  };
}

function sortAreas(areas: Iterable<AreaId>): AreaId[] {
  const set = new Set(areas);
  return AREA_ORDER.filter((id) => set.has(id));
}

function repoLooksLikeApp(repository?: string) {
  if (!repository) return false;
  return /(^|[-_/])app(s)?($|[-_/])/i.test(repository) || /\bapp\b/i.test(repository.replace(/[-_]/g, " "));
}

function branchType(branch?: string): TaskType | null {
  if (!branch) return null;
  const b = branch.toLowerCase();
  if (b.startsWith("feature/") || b.startsWith("feat/")) return "feature";
  if (b.startsWith("fix/") || b.startsWith("bugfix/") || b.startsWith("hotfix/")) return "bug";
  if (b.startsWith("security/")) return "security";
  if (b.startsWith("chore/") || b.startsWith("refactor/")) return "refactor";
  if (b.startsWith("docs/")) return "research";
  return null;
}

export function detectAreas(input: TaskInput | string): AreaId[] {
  const parsed = asTaskInput(input);
  const corpus = corpusOf(parsed);
  const found = new Set<AreaId>();

  const identity =
    any(corpus, SOCIAL_HINTS) ||
    (any(corpus, AUTH_HINTS) && any(corpus, ["google", "oauth", "sso"])) ||
    any(parsed.task, AUTH_HINTS);

  if (identity) found.add("authentication");
  if (any(corpus, PAYMENT_HINTS)) found.add("payments");
  if (any(corpus, PII_HINTS)) found.add("privacy");
  if (any(corpus, BOOKING_HINTS)) found.add("booking");
  if (any(corpus, SCHEMA_HINTS) && !identity) found.add("backend");
  if (any(corpus, DOCS_HINTS) && !any(corpus, BUG_HINTS)) found.add("documentation");
  if (any(corpus, UI_HINTS) && !identity) found.add("ui");
  if (any(corpus, ARCH_HINTS)) found.add("platform");
  if (any(corpus, SECURITY_HINTS) || identity || found.has("payments") || found.has("privacy")) {
    found.add("security");
  }
  if (
    any(corpus, BACKEND_HINTS) ||
    identity ||
    found.has("payments") ||
    any(corpus, SOCIAL_HINTS)
  ) {
    found.add("backend");
  }

  const mobile =
    any(corpus, MOBILE_HINTS) ||
    ((identity || any(corpus, SOCIAL_HINTS)) && repoLooksLikeApp(parsed.repository));
  const frontend = any(corpus, FRONTEND_HINTS);

  if (mobile) found.add("mobile");
  else if (frontend) found.add("frontend");
  else if (any(corpus, SOCIAL_HINTS) && !mobile) found.add("frontend");

  if (found.size === 0) found.add("application");
  return sortAreas(found);
}

export function detectArea(ticket: string): string {
  const areas = detectAreas(ticket);
  return AREA_LABEL[areas[0] ?? "application"];
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

function detectType(ticket: string, vague: boolean, branch?: string): TaskType {
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
  const fromBranch = branchType(branch);
  if (fromBranch) return fromBranch;
  return "feature";
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

function missingQuestions(ticket: string, vague: boolean, areas: AreaId[]): MissingQuestion[] {
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
  if (areas.length === 0 || (areas.length === 1 && areas[0] === "application")) {
    questions.push({
      question: "Which product area is involved (auth, payments, booking, UI)?",
      whyItMatters: "Areas drive risk and whether Security Review is required.",
    });
  }
  return questions;
}

export function understandTask(input: TaskInput | string): TaskAnalysis {
  const parsed = asTaskInput(input);
  const text = parsed.task.trim();
  const vague = isVague(text);
  const areas = detectAreas(parsed);
  const area = AREA_LABEL[areas[0] ?? "application"];
  let taskType = detectType(text, vague, parsed.branch);
  if (!vague && taskType === "research" && branchType(parsed.branch) === "feature") {
    taskType = "feature";
  }
  const controlKinds = detectControlKinds(text, { taskType, areas, vague });
  const planner = buildPlanner({ ticket: text, taskType, vague, kinds: controlKinds });
  const riskEngine = scoreRisk({ ticket: text, taskType, areas, vague, kinds: controlKinds });
  const risk = riskEngine.level;
  const change = asksForChange(text, taskType, vague);
  const route = routeTask({
    taskType,
    risk,
    areas,
    vague,
    asksForChange: change,
    planner,
    riskEngine,
  });
  const corpus = corpusOf(parsed);
  const signals = [
    ...hits(corpus, INCIDENT_HINTS).map((s) => `incident:${s.trim()}`),
    ...hits(corpus, SECURITY_HINTS).map((s) => `security:${s.trim()}`),
    ...hits(corpus, BUG_HINTS).map((s) => `bug:${s.trim()}`),
    ...hits(corpus, AUTH_HINTS).map((s) => `area:${s.trim()}`),
    ...hits(corpus, SOCIAL_HINTS).map((s) => `identity:${s.trim()}`),
    ...hits(corpus, RESEARCH_HINTS).map((s) => `research:${s.trim()}`),
    ...hits(corpus, DEBT_HINTS).map((s) => `debt:${s.trim()}`),
    ...hits(corpus, ARCH_HINTS).map((s) => `arch:${s.trim()}`),
    ...(parsed.branch ? [`branch:${parsed.branch}`] : []),
    ...(parsed.repository ? [`repo:${parsed.repository}`] : []),
  ].slice(0, 10);

  const summary = vague
    ? "Ticket is too thin to dispatch a ship plan. Research the question, then a human decides."
    : `${TASK_TYPE_LABEL[taskType]} in ${areas.map((id) => AREA_LABEL[id]).join(", ")}, ${risk} risk. Dispatch specialists instead of one model.`;

  const analysis: TaskAnalysis = {
    input: parsed,
    taskType,
    taskTypeLabel: TASK_TYPE_LABEL[taskType],
    risk,
    areas,
    area,
    understanding: { type: taskType, risk, areas },
    route,
    summary,
    requiredAgents: route.agents,
    signals,
    asksForChange: change,
    vague,
    missing: missingQuestions(text, vague, areas),
    controlKinds,
    planner,
    riskEngine,
  };
  return analysis;
}

export function understand(input: TaskInput | string): TaskUnderstanding {
  return toUnderstanding(understandTask(input));
}

export function route(input: TaskInput | string) {
  return understandTask(input).route.routing;
}

export function classifyTicket(ticket: string, extra?: Omit<TaskInput, "task">): TaskAnalysis {
  return understandTask({ task: ticket, ...extra });
}
