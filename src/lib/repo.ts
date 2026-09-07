import { hasArea } from "./classify";
import { isEngineeringDecision } from "./consensus";
import { filesForTrack as partitionFiles } from "./graph";
import { isSimpleUi } from "./router";
import type { AreaId, RepoAnalysis, TaskAnalysis, WorkTrack } from "./types";

function slugOf(task: string) {
  return task.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
}

/** Deterministic affected paths. No git clone — the control plane stays offline. */
export function affectedFiles(analysis: TaskAnalysis): string[] {
  const task = analysis.input.task;
  const flutter = /flutter/i.test(task);
  if (isEngineeringDecision(task) || analysis.planner?.shape === "decision") {
    return ["src/api/rest/handlers.ts", "src/api/graphql/schema.ts", "src/clients/api.ts"];
  }
  if (hasArea(analysis, "authentication") && analysis.taskType === "feature" && flutter) {
    return [
      "lib/auth/google_sign_in.dart",
      "lib/screens/login.dart",
      "src/api/auth/google.ts",
      "src/auth/users.ts",
    ];
  }
  if (hasArea(analysis, "authentication") && analysis.taskType === "feature") {
    return [
      "src/auth/google.ts",
      "src/api/auth/google.ts",
      "ios/Auth/GoogleSignIn.swift",
      "android/auth/GoogleSignIn.kt",
    ];
  }
  if (hasArea(analysis, "authentication") && analysis.taskType === "bug") {
    return ["src/auth/refresh.ts", "src/auth/session.ts", "src/auth/upgrade-migration.ts"];
  }
  if (analysis.planner?.shape === "performance") {
    return ["src/screens/SettingsList.tsx", "src/screens/virtualize.ts"];
  }
  if (isSimpleUi(analysis) || hasArea(analysis, "ui")) {
    return ["src/screens/Settings.tsx", "src/screens/Settings.css"];
  }
  if (hasArea(analysis, "payments")) {
    return ["src/payments/webhook.ts", "src/payments/idempotency.ts"];
  }
  if (hasArea(analysis, "booking")) {
    return ["src/booking/reminders.ts", "src/notify/appointment.ts"];
  }
  if (analysis.planner?.shape === "schema" || analysis.controlKinds.includes("schema_change")) {
    return ["src/db/migrations/add_field.sql", "src/models/account.ts"];
  }
  if (analysis.planner?.shape === "deploy" || analysis.controlKinds.includes("production_deploy")) {
    return ["deploy/checkout.yaml", "src/checkout/service.ts"];
  }
  if (hasArea(analysis, "authentication")) {
    return ["src/auth/session.ts", "src/auth/refresh.ts"];
  }
  const slug = slugOf(task);
  return [`src/${analysis.areas[0] ?? "app"}/${slug || "change"}.ts`];
}

export function filesForTrack(analysis: TaskAnalysis, track?: WorkTrack) {
  return partitionFiles(affectedFiles(analysis), track);
}

function blastRadius(analysis: TaskAnalysis): RepoAnalysis["blastRadius"] {
  if (isSimpleUi(analysis)) return "local";
  if (isEngineeringDecision(analysis.input.task) || analysis.planner?.shape === "decision") {
    return "cross-cutting";
  }
  if (
    analysis.controlKinds.includes("production_deploy") ||
    hasArea(analysis, "authentication") ||
    hasArea(analysis, "payments") ||
    hasArea(analysis, "privacy") ||
    hasArea(analysis, "security")
  ) {
    return "cross-cutting";
  }
  if (
    analysis.planner?.shape === "schema" ||
    analysis.controlKinds.includes("schema_change") ||
    analysis.controlKinds.includes("database_migration")
  ) {
    return "service";
  }
  if (analysis.areas.length > 2) return "cross-cutting";
  return "service";
}

function modulesFrom(files: string[], areas: AreaId[]) {
  const seen = new Set<string>();
  const modules: RepoAnalysis["modules"] = [];
  for (const file of files) {
    const dir = file.split("/").slice(0, 2).join("/");
    if (seen.has(dir)) continue;
    seen.add(dir);
    const area = areas.find((item) => dir.toLowerCase().includes(item.slice(0, 4))) ?? areas[0];
    modules.push({
      path: dir,
      reason: area ? `Touches ${area}.` : "In the change set inferred from the ticket.",
    });
  }
  return modules;
}

export function analyzeRepository(analysis: TaskAnalysis): RepoAnalysis {
  const files = affectedFiles(analysis);
  return {
    repository: analysis.input.repository?.trim() || "local",
    branch: analysis.input.branch?.trim() || "unspecified",
    areas: [...analysis.areas],
    modules: modulesFrom(files, analysis.areas),
    files,
    blastRadius: blastRadius(analysis),
  };
}
