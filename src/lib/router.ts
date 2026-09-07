import { isEngineeringDecision } from "./consensus";
import { AGENTS, PATTERN_LABEL } from "./roster";
import { hasDataExfiltration, hasPerformanceIssue, policyFor, riskPolicyOf } from "./risk";
import type {
  AgentId,
  AgentRoute,
  AgentRouting,
  AreaId,
  ControlKind,
  FiredRouteRule,
  PlannerResult,
  PublicAgentName,
  RiskEngineResult,
  RoutePattern,
  RouteSkip,
  TaskAnalysis,
} from "./types";

const SENSITIVE: AreaId[] = ["authentication", "payments", "privacy", "security"];
const UI_ONLY: AreaId[] = ["ui", "frontend", "documentation"];

/** Canonical feature spine. Other tickets take a subset — that is the router. */
export const FEATURE_SPINE: PublicAgentName[] = [
  "requirements",
  "architect",
  "security",
  "developer",
  "testing",
  "pr_reviewer",
];

/** Headline dynamic IF-rules. Not a predefined workflow. */
export const DYNAMIC_ROUTE_RULES: {
  id: FiredRouteRule["if"];
  then: FiredRouteRule["then"];
  label: string;
}[] = [
  { id: "security-sensitive", then: "security", label: "IF security-sensitive → Security Agent" },
  { id: "database-change", then: "database", label: "IF database change → Database Agent" },
  { id: "performance-issue", then: "performance", label: "IF performance issue → Performance Agent" },
];

const TO_PUBLIC: Partial<Record<AgentId, PublicAgentName>> = {
  requirements: "requirements",
  architect: "architect",
  security: "security",
  database: "database",
  performance: "performance",
  implement: "developer",
  tests: "testing",
  pr_review: "pr_reviewer",
  bug: "bug",
  research: "research",
  rca: "rca",
  tech_debt: "tech_debt",
};

const SKIP_REASON: Record<PublicAgentName, string> = {
  requirements: "Scope is already a single, concrete change.",
  architect: "No structural design decision.",
  security: "Not security-sensitive.",
  database: "Not a database change.",
  performance: "Not a performance issue.",
  developer: "This ticket does not ask for a code change.",
  testing: "Risk is LOW — tests are optional.",
  pr_reviewer: "Risk is LOW — review is optional.",
  bug: "Not a failure report.",
  research: "The routed specialists already cover the evidence this ticket needs.",
  rca: "No incident or bug to lock a cause for.",
  tech_debt: "Not a cleanup or debt ticket.",
};

type RouteInput = Pick<TaskAnalysis, "taskType" | "risk" | "areas" | "vague" | "asksForChange"> & {
  planner?: PlannerResult;
  riskEngine?: RiskEngineResult;
  ticket?: string;
  controlKinds?: ControlKind[];
  input?: { task?: string };
};

function ticketOf(input: { ticket?: string; input?: { task?: string } }) {
  return input.ticket ?? input.input?.task ?? "";
}

function toPublic(id: AgentId): PublicAgentName | null {
  return TO_PUBLIC[id] ?? null;
}

function publicAgents(ids: AgentId[]): PublicAgentName[] {
  return ids.map(toPublic).filter((id): id is PublicAgentName => Boolean(id));
}

function skippedFrom(selected: AgentId[], extra: RouteSkip[] = []): RouteSkip[] {
  const present = new Set(publicAgents(selected));
  const skips: RouteSkip[] = FEATURE_SPINE.filter((agent) => !present.has(agent)).map((agent) => ({
    agent,
    reason: SKIP_REASON[agent],
  }));
  for (const name of ["database", "performance"] as PublicAgentName[]) {
    if (!present.has(name)) skips.push({ agent: name, reason: SKIP_REASON[name] });
  }
  return [...skips, ...extra.filter((item) => !present.has(item.agent))];
}

function sensitive(areas: AreaId[]) {
  return areas.some((id) => SENSITIVE.includes(id));
}

export function isSimpleUi(
  analysis: Pick<TaskAnalysis, "areas" | "risk" | "taskType" | "vague"> & {
    planner?: PlannerResult;
    ticket?: string;
    input?: { task?: string };
  },
) {
  if (analysis.vague) return false;
  if (analysis.planner?.shape === "schema" || analysis.planner?.shape === "performance") return false;
  if (hasPerformanceIssue(ticketOf(analysis))) return false;
  if (hasDataExfiltration(ticketOf(analysis))) return false;
  if (analysis.risk !== "low") return false;
  if (!["feature", "refactor", "tech_debt"].includes(analysis.taskType)) return false;
  if (sensitive(analysis.areas)) return false;
  if (analysis.areas.length === 0) return false;
  return analysis.areas.every((id) => UI_ONLY.includes(id));
}

export function isSecuritySensitive(input: RouteInput): boolean {
  if (input.vague || input.taskType === "research") return false;
  const policy = input.riskEngine?.policy ?? policyFor(input.risk, input.vague);
  return (
    policy.require_security ||
    input.taskType === "security" ||
    input.taskType === "incident" ||
    (input.controlKinds ?? []).includes("security_sensitive") ||
    sensitive(input.areas) ||
    hasDataExfiltration(ticketOf(input))
  );
}

export function isDatabaseChange(input: RouteInput): boolean {
  if (input.vague || input.taskType === "research") return false;
  if (input.planner?.shape === "schema") return true;
  const kinds = input.controlKinds ?? [];
  return (
    kinds.includes("schema_change") ||
    kinds.includes("database_migration") ||
    kinds.includes("destructive")
  );
}

function insertBefore(agents: AgentId[], before: AgentId, agent: AgentId) {
  if (agents.includes(agent)) return;
  const at = agents.indexOf(before);
  agents.splice(at >= 0 ? at : agents.length, 0, agent);
}

export function applyDynamicRules(agents: AgentId[], input: RouteInput): {
  agents: AgentId[];
  rules: FiredRouteRule[];
} {
  const next = [...agents];
  const rules: FiredRouteRule[] = [];

  if (isSecuritySensitive(input)) {
    insertBefore(next, "implement", "security");
    rules.push({ if: "security-sensitive", then: "security" });
  }
  if (isDatabaseChange(input)) {
    insertBefore(next, "implement", "database");
    rules.push({ if: "database-change", then: "database" });
  }
  if (hasPerformanceIssue(ticketOf(input))) {
    insertBefore(next, "implement", "performance");
    rules.push({ if: "performance-issue", then: "performance" });
  }

  return { agents: next, rules };
}

function makeRoute(
  pattern: RoutePattern,
  reason: string,
  agents: AgentId[],
  input: RouteInput,
  extraSkips: RouteSkip[] = [],
): AgentRoute {
  const applied = applyDynamicRules(agents, input);
  const routing: AgentRouting = {
    pattern,
    agents: publicAgents(applied.agents),
    rules: applied.rules,
  };
  return {
    pattern,
    reason,
    agents: applied.agents,
    routing,
    skipped: skippedFrom(applied.agents, extraSkips),
  };
}

function applyPolicy(agents: AgentId[], input: RouteInput): AgentId[] {
  const policy = input.riskEngine?.policy ?? policyFor(input.risk, input.vague);
  const next = [...agents];
  if (input.asksForChange) {
    if (!next.includes("implement")) next.push("implement");
    if (policy.require_tests && !next.includes("tests")) next.push("tests");
    if (policy.require_review && !next.includes("pr_review")) next.push("pr_review");
    if (!policy.require_tests) {
      const i = next.indexOf("tests");
      if (i >= 0) next.splice(i, 1);
    }
    if (!policy.require_review) {
      const i = next.indexOf("pr_review");
      if (i >= 0) next.splice(i, 1);
    }
  }
  return next;
}

export function routeTask(analysis: RouteInput): AgentRoute {
  const policy = riskPolicyOf({
    risk: analysis.risk,
    vague: analysis.vague,
    riskEngine: analysis.riskEngine ?? {
      level: analysis.risk,
      score: 0,
      factors: [],
      policy: policyFor(analysis.risk, analysis.vague),
    },
  });
  const shape = analysis.planner?.shape;

  if (analysis.vague) {
    return makeRoute("vague", "The ticket is too thin to pick specialists. Research, then a human.", [
      "research",
    ], analysis);
  }

  if (analysis.taskType === "research") {
    return makeRoute("research", "A question gets Code Research only. No ship plan.", ["research"], analysis);
  }

  if (analysis.taskType === "architecture") {
    if (isEngineeringDecision(ticketOf(analysis)) || shape === "decision") {
      return makeRoute(
        "architecture",
        "High-risk decision. Architect, Performance, Security, and Developer debate. Consensus Engine, not a PR.",
        ["architect", "performance", "security", "implement"],
        analysis,
      );
    }
    return makeRoute(
      "architecture",
      "System design before anyone writes code. Dynamic IF-rules still apply.",
      applyPolicy(["research", "architect"], analysis),
      analysis,
    );
  }

  if (shape === "deploy") {
    return makeRoute(
      "deploy",
      "CRITICAL production work. IF-rules add Security / Database / Performance when they match.",
      applyPolicy(["implement"], analysis),
      analysis,
    );
  }

  if (isSimpleUi(analysis) && analysis.asksForChange) {
    return makeRoute(
      "ui",
      "LOW risk UI change. Dynamic IF-rules did not fire. Automatic after the quality gate.",
      applyPolicy(["implement"], analysis),
      analysis,
    );
  }

  if (shape === "performance") {
    return makeRoute(
      "performance",
      "IF performance issue → Performance Agent, then Developer, tests, and review.",
      applyPolicy(["implement"], analysis),
      analysis,
    );
  }

  if (shape === "schema") {
    return makeRoute(
      "schema",
      analysis.risk === "high"
        ? "IF database change → Database Agent. Destructive work still needs a human after the gate."
        : "IF database change → Database Agent. MEDIUM: tests and review, then Action.",
      applyPolicy(["implement"], analysis),
      analysis,
    );
  }

  if (analysis.taskType === "incident" || analysis.taskType === "bug") {
    return makeRoute(
      analysis.taskType === "incident" ? "incident" : "bug",
      analysis.taskType === "incident"
        ? "Incidents get investigation. IF security-sensitive → Security Agent before the patch."
        : "Bugs get investigation. IF-rules add Security, Database, or Performance when they match.",
      applyPolicy(["bug", "research", "rca"], analysis),
      analysis,
    );
  }

  if (analysis.taskType === "security") {
    return makeRoute(
      "security",
      "IF security-sensitive → Security Agent. Threat-model first, then Developer.",
      applyPolicy(["research", "security"], analysis),
      analysis,
    );
  }

  if (analysis.taskType === "tech_debt" || analysis.taskType === "refactor") {
    const agents: AgentId[] = ["tech_debt", "research"];
    if (analysis.risk !== "low") agents.push("architect");
    return makeRoute(
      "debt",
      "Debt work stays proportional. Dynamic IF-rules still apply.",
      applyPolicy(agents, analysis),
      analysis,
    );
  }

  return makeRoute(
    "feature",
    policy.require_security
      ? "IF security-sensitive → Security Agent. Requirements and Architect still run."
      : "Feature request. Security, Database, and Performance agents join only when their IF matches.",
    applyPolicy(["requirements", "architect"], analysis),
    analysis,
  );
}

export function routeLabel(pattern: RoutePattern) {
  return PATTERN_LABEL[pattern];
}

export function specialistLabel(id: AgentId) {
  return AGENTS[id].label;
}

export function compactRoute(route: AgentRoute): AgentRouting {
  return route.routing;
}
