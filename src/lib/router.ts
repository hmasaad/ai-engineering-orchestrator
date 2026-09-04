import { AGENTS, PATTERN_LABEL } from "./roster";
import { policyFor, riskPolicyOf } from "./risk";
import type {
  AgentId,
  AgentRoute,
  AgentRouting,
  AreaId,
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

const TO_PUBLIC: Partial<Record<AgentId, PublicAgentName>> = {
  requirements: "requirements",
  architect: "architect",
  security: "security",
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
  security: "Risk Engine did not require Security Review.",
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
};

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
  return [...skips, ...extra.filter((item) => !present.has(item.agent))];
}

function sensitive(areas: AreaId[]) {
  return areas.some((id) => SENSITIVE.includes(id));
}

export function isSimpleUi(analysis: Pick<TaskAnalysis, "areas" | "risk" | "taskType" | "vague">) {
  if (analysis.vague) return false;
  if (analysis.risk !== "low") return false;
  if (!["feature", "refactor", "tech_debt"].includes(analysis.taskType)) return false;
  if (sensitive(analysis.areas)) return false;
  if (analysis.areas.length === 0) return false;
  return analysis.areas.every((id) => UI_ONLY.includes(id));
}

function makeRoute(
  pattern: RoutePattern,
  reason: string,
  agents: AgentId[],
  extraSkips: RouteSkip[] = [],
): AgentRoute {
  const routing: AgentRouting = { pattern, agents: publicAgents(agents) };
  return {
    pattern,
    reason,
    agents,
    routing,
    skipped: skippedFrom(agents, extraSkips),
  };
}

function applyPolicy(agents: AgentId[], input: RouteInput): AgentId[] {
  const policy = input.riskEngine?.policy ?? policyFor(input.risk, input.vague);
  const next = [...agents];
  if (policy.require_security && input.asksForChange && !next.includes("security")) {
    const at = next.indexOf("implement");
    next.splice(at >= 0 ? at : next.length, 0, "security");
  }
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
    riskEngine: analysis.riskEngine ?? { level: analysis.risk, score: 0, factors: [], policy: policyFor(analysis.risk, analysis.vague) },
  });
  const shape = analysis.planner?.shape;

  if (analysis.vague) {
    return makeRoute("vague", "The ticket is too thin to pick specialists. Research, then a human.", [
      "research",
    ]);
  }

  if (analysis.taskType === "research") {
    return makeRoute("research", "A question gets Code Research only. No ship plan.", ["research"]);
  }

  if (analysis.taskType === "architecture") {
    const agents: AgentId[] = ["research", "architect"];
    if (policy.require_security) agents.push("security");
    return makeRoute("architecture", "System design before anyone writes code.", agents);
  }

  if (shape === "deploy") {
    const agents = applyPolicy(["implement"], analysis);
    return makeRoute(
      "deploy",
      "CRITICAL production work. Specialists run, then Result Merger, quality gate, mandatory human, Action.",
      agents,
    );
  }

  if (isSimpleUi(analysis) && analysis.asksForChange) {
    return makeRoute(
      "ui",
      "LOW risk UI change. Automatic after the quality gate — no human, no architecture parade.",
      applyPolicy(["implement"], analysis),
    );
  }

  if (shape === "schema") {
    return makeRoute(
      "schema",
      analysis.risk === "high"
        ? "Destructive schema change. Tests, review, and a human after the quality gate."
        : "MEDIUM schema change. Testing Agent and PR Reviewer, then Action. No human gate.",
      applyPolicy(["implement"], analysis),
    );
  }

  if (analysis.taskType === "incident" || analysis.taskType === "bug") {
    const agents: AgentId[] = ["bug", "research", "rca"];
    const routed = applyPolicy(agents, analysis);
    return makeRoute(
      analysis.taskType === "incident" ? "incident" : "bug",
      analysis.taskType === "incident"
        ? "Incidents get investigation and a security pass before any patch."
        : "Bugs get investigation and a locked cause before anyone writes a fix.",
      routed,
    );
  }

  if (analysis.taskType === "security") {
    const agents: AgentId[] = ["research", "security"];
    return makeRoute(
      "security",
      "HIGH: threat-model first. Then Developer, tests, review, quality gate, human, Action.",
      applyPolicy(agents, analysis),
    );
  }

  if (analysis.taskType === "tech_debt" || analysis.taskType === "refactor") {
    const agents: AgentId[] = ["tech_debt", "research"];
    if (analysis.risk !== "low") agents.push("architect");
    return makeRoute(
      "debt",
      "Debt work stays proportional. Security only if the Risk Engine requires it.",
      applyPolicy(agents, analysis),
    );
  }

  const agents: AgentId[] = ["requirements", "architect"];
  return makeRoute(
    "feature",
    policy.require_security
      ? "HIGH feature. Requirements, Architect, Security, then Developer."
      : "MEDIUM feature. Requirements and Architect, then tests and review. No security parade.",
    applyPolicy(agents, analysis),
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
