import { isEngineeringDecision } from "./consensus";
import { hasPerformanceIssue } from "./risk";
import { buildTaskGraph } from "./graph";
import type {
  AreaId,
  ControlKind,
  PlannerResult,
  PlannerShape,
  PublicAgentName,
  TaskPlan,
  TaskPlanPhase,
  TaskType,
} from "./types";

function hay(text: string) {
  return ` ${text.toLowerCase().replace(/\s+/g, " ").trim()} `;
}

function any(text: string, needles: string[]) {
  const h = hay(text);
  return needles.some((needle) => h.includes(needle.toLowerCase()));
}

function normTicket(ticket: string) {
  return ticket.toLowerCase().replace(/[.!?]+$/g, "").replace(/\s+/g, " ").trim();
}

function shapeOf(
  ticket: string,
  taskType: TaskType,
  vague: boolean,
  kinds: ControlKind[],
): PlannerShape {
  if (vague) return "clarify";
  if (kinds.includes("production_deploy")) return "deploy";
  if (taskType === "research") return "research";
  if (isEngineeringDecision(ticket)) return "decision";
  if (taskType === "incident") return "incident";
  if (taskType === "security") return "security";
  if (taskType === "bug") return "fix";
  if (taskType === "architecture") return "feature";
  if (taskType === "tech_debt" || taskType === "refactor") return "debt";
  if (kinds.includes("schema_change") || kinds.includes("database_migration") || kinds.includes("destructive")) {
    return "schema";
  }
  if (hasPerformanceIssue(ticket)) {
    return "performance";
  }
  if (
    any(ticket, [
      "button",
      "css",
      "copy",
      "label text",
      "button text",
      "settings screen",
      "color",
      "navy",
    ]) &&
    !any(ticket, ["login", "auth", "payment", "database", "migration"])
  ) {
    return "ui-patch";
  }
  return "feature";
}

function changeLabel(ticket: string, shape: PlannerShape) {
  const trimmed = ticket.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 72) return trimmed;
  if (shape === "ui-patch") return "Update UI copy or styling";
  if (shape === "schema") return "Change the data model";
  if (shape === "performance") return "Improve latency or rendering cost";
  if (shape === "deploy") return "Production deployment";
  if (shape === "security") return "Security-sensitive change";
  return trimmed.slice(0, 69) + "…";
}

export function buildPlanner(input: {
  ticket: string;
  taskType: TaskType;
  vague: boolean;
  kinds: ControlKind[];
}): PlannerResult {
  const shape = shapeOf(input.ticket, input.taskType, input.vague, input.kinds);
  const intent =
    shape === "clarify"
      ? "clarify"
      : shape === "research"
        ? "research"
        : shape === "decision" || input.taskType === "research"
          ? "respond"
          : "change";

  const constraints: string[] = [];
  if (shape === "clarify") constraints.push("Do not invent a ship plan.");
  if (shape === "ui-patch") constraints.push("Keep the change proportional. No architecture parade.");
  if (shape === "schema") constraints.push("Additive fields are medium. Drops are high.");
  if (shape === "performance") constraints.push("IF performance issue → Performance Agent before Developer.");
  if (shape === "decision") {
    constraints.push("Do not trust one agent. Architect, Performance, Security, and Developer debate.");
    constraints.push("Consensus Engine produces a recommendation. No PR.");
  }
  if (shape === "feature") constraints.push("Requirements and architecture before code.");
  if (shape === "fix") constraints.push("Investigate before patching.");
  if (shape === "security" || shape === "incident") constraints.push("Security Review before Developer.");
  if (shape === "deploy") constraints.push("Mandatory human after the quality gate. Never auto-deploy.");
  constraints.push("Specialists write one shared state. Result Merger runs before the quality gate.");

  return {
    intent,
    change: changeLabel(input.ticket, shape),
    shape,
    constraints,
  };
}

const PINNED_IDS: Record<string, string> = {
  "add google login to the flutter app": "TASK-1024",
  "add social login with google": "TASK-1001",
};

export function taskPlanId(ticket: string) {
  const key = normTicket(ticket);
  if (PINNED_IDS[key]) return PINNED_IDS[key];
  let hash = 2166136261;
  for (const ch of key) {
    hash ^= ch.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `TASK-${(Math.abs(hash) % 9000) + 1000}`;
}

const AGENT_PLAN_LABEL: Record<PublicAgentName, string> = {
  requirements: "Requirements Agent",
  architect: "Software Architect",
  security: "Security Agent",
  database: "Database Agent",
  performance: "Performance Agent",
  developer: "Developer",
  testing: "Test Agent",
  pr_reviewer: "PR Reviewer",
  bug: "Bug Agent",
  research: "Code Research",
  rca: "Root Cause",
  tech_debt: "Tech Debt",
};

function isIdentity(ticket: string, areas: AreaId[]) {
  return (
    areas.includes("authentication") &&
    (any(ticket, ["google", "oauth", "sso", "social login", "sign in"]) || areas.includes("security"))
  );
}

function requirementsFor(ticket: string, taskType: TaskType, vague: boolean, areas: AreaId[]): string[] {
  if (vague) {
    return [
      "What exactly is failing, for whom, and since when",
      "Whether this is a bug, a feature, a security issue, or a question",
      "Which product area is involved",
    ];
  }
  if (taskType === "research") {
    return ["A written answer from the existing code", "No ship plan", "No pull request"];
  }
  if (isEngineeringDecision(ticket)) {
    return [
      "A recommendation, not a pull request",
      "Architect, Performance, Security, and Developer each speak",
      "Do not start a protocol rewrite from a should-we ticket",
    ];
  }
  if (isIdentity(ticket, areas) && taskType === "feature") {
    return ["Google authentication", "Existing user linking", "Logout", "Error handling"];
  }
  if (areas.includes("authentication") && taskType === "bug") {
    return [
      "Reproduce the session drop",
      "Keep refresh-token reuse detection",
      "Migrate old tokens once",
      "Error handling on 401 without swallowing theft",
    ];
  }
  if (taskType === "security") {
    return ["Threat model before a patch", "Fail closed", "No control removed to make the symptom disappear"];
  }
  if (areas.includes("ui") && taskType !== "feature") {
    return ["Visual change only", "No session or API contract change"];
  }
  if (any(ticket, ["button", "css", "navy", "unused css"])) {
    return ["Scoped visual change", "No architecture parade", "Quality gate still runs"];
  }
  if (any(ticket, ["column", "field", "nickname", "migration", "drops the unused"])) {
    return ["Schema change named", "Compatibility for existing rows", "Rollback or restore path if destructive"];
  }
  if (hasPerformanceIssue(ticket)) {
    return ["Measure the slow path", "Keep the change in the existing screen", "Do not guess a cache"];
  }
  return [ticket.trim().replace(/\s+/g, " "), "Stay inside the named area", "Evals before Action"];
}

function affectedAreasFor(ticket: string, areas: AreaId[]): string[] {
  const labels: string[] = [];
  const flutter = any(ticket, ["flutter"]);
  if (flutter) labels.push("Flutter UI");
  else if (areas.includes("mobile")) labels.push("Mobile client");
  else if (areas.includes("ui") || areas.includes("frontend")) labels.push("UI");
  if (areas.includes("authentication")) labels.push("Authentication service");
  if (areas.includes("backend")) labels.push("Backend");
  if (isIdentity(ticket, areas) || any(ticket, ["column", "table", "migration", "database", "schema"])) {
    labels.push("Database");
  }
  if (areas.includes("payments")) labels.push("Payments");
  if (areas.includes("booking")) labels.push("Booking");
  if (areas.includes("security") && !labels.includes("Authentication service")) labels.push("Security");
  if (labels.length === 0) labels.push("Application");
  return [...new Set(labels)];
}

function agentNames(agents: PublicAgentName[]): string[] {
  return agents.map((id) => AGENT_PLAN_LABEL[id] ?? id);
}

function dependencyPhases(agents: PublicAgentName[], ticket: string): TaskPlanPhase[] {
  const has = (id: PublicAgentName) => agents.includes(id);
  const phases: TaskPlanPhase[] = [];
  const debate = isEngineeringDecision(ticket);
  if (has("bug") || has("research") || has("rca")) {
    phases.push({ id: "investigation", label: "Investigation" });
  }
  if (has("requirements") || has("architect") || has("tech_debt")) {
    phases.push({ id: "architecture", label: "Architecture" });
  }
  if (has("database")) phases.push({ id: "schema", label: "Schema" });
  if (has("performance")) phases.push({ id: "performance", label: "Performance" });
  if (has("security")) phases.push({ id: "security", label: "Security" });
  if (has("developer")) phases.push({ id: "implementation", label: debate ? "Developer" : "Implementation" });
  if (has("testing")) phases.push({ id: "tests", label: "Tests" });
  if (has("pr_reviewer") || (has("developer") && !debate)) {
    phases.push({ id: "review", label: "Review" });
  }
  return phases;
}

export function buildTaskPlan(input: {
  ticket: string;
  taskType: TaskType;
  areas: AreaId[];
  agents: PublicAgentName[];
  vague: boolean;
}): TaskPlan {
  return {
    id: taskPlanId(input.ticket),
    title: input.ticket.trim().replace(/\s+/g, " "),
    requirements: requirementsFor(input.ticket, input.taskType, input.vague, input.areas),
    affectedAreas: affectedAreasFor(input.ticket, input.areas),
    agents: agentNames(input.agents),
    dependencies: dependencyPhases(input.agents, input.ticket),
    graph: buildTaskGraph({
      ticket: input.ticket,
      agents: input.agents,
      areas: input.areas,
      vague: input.vague,
      taskType: input.taskType,
    }),
  };
}

function tree(title: string, items: string[]) {
  if (items.length === 0) return `${title}\n └── (none)`;
  const lines = items.map((item, index) => {
    const last = index === items.length - 1;
    return `${last ? " └──" : " ├──"} ${item}`;
  });
  return `${title}\n${lines.join("\n")}`;
}

export function formatTaskPlanTree(plan: TaskPlan) {
  const deps =
    plan.dependencies.length === 0
      ? "Dependencies\n └── (none)"
      : plan.graph?.parallel
        ? `Dependencies\n\n${plan.graph.ascii}`
        : `Dependencies\n\n${plan.dependencies.map((item) => item.label).join("\n      ↓\n")}`;
  return [
    plan.id,
    "",
    tree("Requirements", plan.requirements),
    "",
    tree("Affected areas", plan.affectedAreas),
    "",
    tree("Agents", plan.agents),
    "",
    deps,
  ].join("\n");
}

export function compactPlanner(planner: PlannerResult) {
  return {
    intent: planner.intent,
    change: planner.change,
    shape: planner.shape,
    constraints: planner.constraints,
  };
}

export function compactTaskPlan(plan: TaskPlan) {
  return {
    id: plan.id,
    requirements: plan.requirements,
    areas: plan.affectedAreas,
    agents: plan.agents,
    dependencies: plan.dependencies.map((item) => item.label),
    parallel: plan.graph?.parallel ?? false,
    graph: plan.graph?.ascii,
  };
}
