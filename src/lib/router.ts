import { AGENTS, PATTERN_LABEL } from "./roster";
import type {
  AgentId,
  AgentRoute,
  AgentRouting,
  AreaId,
  PublicAgentName,
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
  security: "Not an authentication, payments, or threat-model change.",
  developer: "This ticket does not ask for a code change.",
  testing: "No change to lock with tests.",
  pr_reviewer: "No PR will be opened.",
  bug: "Not a failure report.",
  research: "The routed specialists already cover the evidence this ticket needs.",
  rca: "No incident or bug to lock a cause for.",
  tech_debt: "Not a cleanup or debt ticket.",
};

type RouteInput = Pick<TaskAnalysis, "taskType" | "risk" | "areas" | "vague" | "asksForChange">;

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

function ship(): AgentId[] {
  return ["implement", "tests", "pr_review"];
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

export function routeTask(analysis: RouteInput): AgentRoute {
  if (analysis.vague) {
    return makeRoute("vague", "The ticket is too thin to pick specialists. Research, then a human.", [
      "research",
    ]);
  }

  if (analysis.taskType === "research") {
    return makeRoute("research", "A question gets Code Research only. No ship plan.", ["research"]);
  }

  if (analysis.taskType === "architecture") {
    return makeRoute("architecture", "System design before anyone writes code.", [
      "research",
      "architect",
      "security",
    ]);
  }

  if (isSimpleUi(analysis) && analysis.asksForChange) {
    return makeRoute(
      "ui",
      "A simple UI change skips requirements, architecture, and security. Developer, tests, then PR Reviewer.",
      ship(),
    );
  }

  const needsSecurity =
    analysis.taskType === "security" ||
    analysis.taskType === "incident" ||
    analysis.risk === "high" ||
    analysis.risk === "critical" ||
    sensitive(analysis.areas);

  if (analysis.taskType === "incident" || analysis.taskType === "bug") {
    const agents: AgentId[] = ["bug", "research", "rca"];
    if (needsSecurity) agents.push("security");
    if (analysis.asksForChange) agents.push(...ship());
    return makeRoute(
      analysis.taskType === "incident" ? "incident" : "bug",
      analysis.taskType === "incident"
        ? "Incidents get investigation and a security pass before any patch."
        : "Bugs get investigation and a locked cause before anyone writes a fix.",
      agents,
    );
  }

  if (analysis.taskType === "security") {
    const agents: AgentId[] = ["research", "security"];
    if (analysis.asksForChange) agents.push(...ship());
    return makeRoute("security", "Threat-model first. Then Developer, Testing, and PR Reviewer.", agents);
  }

  if (analysis.taskType === "tech_debt" || analysis.taskType === "refactor") {
    const agents: AgentId[] = ["tech_debt", "research"];
    if (analysis.risk !== "low") agents.push("architect");
    if (needsSecurity) agents.push("security");
    if (analysis.asksForChange) agents.push(...ship());
    return makeRoute("debt", "Debt work stays proportional. Security only if the area is sensitive.", agents);
  }

  const agents: AgentId[] = ["requirements", "architect", "security"];
  if (analysis.asksForChange) agents.push(...ship());
  return makeRoute(
    "feature",
    "A feature request is not a one-shot patch. Requirements, then Architect, then Security, then Developer.",
    agents,
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
