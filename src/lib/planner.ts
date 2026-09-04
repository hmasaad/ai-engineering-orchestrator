import type { ControlKind, PlannerResult, PlannerShape, TaskType } from "./types";

function hay(text: string) {
  return ` ${text.toLowerCase().replace(/\s+/g, " ").trim()} `;
}

function any(text: string, needles: string[]) {
  const h = hay(text);
  return needles.some((needle) => h.includes(needle.toLowerCase()));
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
  if (taskType === "incident") return "incident";
  if (taskType === "security") return "security";
  if (taskType === "bug") return "fix";
  if (taskType === "architecture") return "feature";
  if (taskType === "tech_debt" || taskType === "refactor") return "debt";
  if (kinds.includes("schema_change") || kinds.includes("database_migration") || kinds.includes("destructive")) {
    return "schema";
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
    shape === "clarify" ? "clarify" : shape === "research" ? "research" : input.taskType === "research" ? "respond" : "change";

  const constraints: string[] = [];
  if (shape === "clarify") constraints.push("Do not invent a ship plan.");
  if (shape === "ui-patch") constraints.push("Keep the change proportional. No architecture parade.");
  if (shape === "schema") constraints.push("Additive fields are medium. Drops are high.");
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

export function compactPlanner(planner: PlannerResult) {
  return {
    intent: planner.intent,
    change: planner.change,
    shape: planner.shape,
    constraints: planner.constraints,
  };
}
