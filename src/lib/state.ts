import { isSimpleUi } from "./router";
import { hasArea } from "./classify";
import type {
  AgentId,
  Artifact,
  RunStatus,
  SharedAgentState,
  SharedArchitecture,
  SharedFinding,
  SharedRequirements,
  SharedReview,
  TaskAnalysis,
  TaskInput,
} from "./types";

export function isFilled(value: object | unknown[] | undefined): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value).length > 0;
}

export function initSharedState(task: string, status: RunStatus = "planned"): SharedAgentState {
  return {
    task: task.trim() || "...",
    requirements: {},
    architecture: {},
    files_changed: [],
    security_findings: [],
    tests: [],
    review: {},
    status,
  };
}

export function compactState(state: SharedAgentState): SharedAgentState {
  return {
    task: state.task,
    requirements: state.requirements,
    architecture: state.architecture,
    files_changed: [...state.files_changed],
    security_findings: [...state.security_findings],
    tests: [...state.tests],
    review: state.review,
    status: state.status,
  };
}

function bullets(artifact: Artifact, heading: string): string[] {
  return artifact.sections.find((section) => section.heading.toLowerCase() === heading.toLowerCase())
    ?.bullets ?? [];
}

function filesFor(analysis: TaskAnalysis, task: string): string[] {
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
  if (isSimpleUi(analysis) || hasArea(analysis, "ui")) {
    return ["src/screens/Settings.tsx", "src/screens/Settings.css"];
  }
  if (hasArea(analysis, "payments")) {
    return ["src/payments/webhook.ts", "src/payments/idempotency.ts"];
  }
  if (hasArea(analysis, "booking")) {
    return ["src/booking/reminders.ts", "src/notify/appointment.ts"];
  }
  const slug = task.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
  return [`src/${analysis.areas[0] ?? "app"}/${slug || "change"}.ts`];
}

function asRequirements(artifact: Artifact): SharedRequirements {
  return {
    summary: artifact.summary,
    in_scope: bullets(artifact, "In scope"),
    out_of_scope: bullets(artifact, "Out of scope"),
    success: bullets(artifact, "Success"),
  };
}

function asArchitecture(artifact: Artifact): SharedArchitecture {
  return {
    summary: artifact.summary,
    boundaries: bullets(artifact, "Boundaries"),
    data: bullets(artifact, "Data"),
  };
}

function asFindings(artifact: Artifact): SharedFinding[] {
  if (artifact.findings.length > 0) return artifact.findings.map((item) => ({ ...item }));
  const threats = bullets(artifact, "Threats");
  if (threats.length > 0) {
    return threats.map((title) => ({
      severity: "should_fix" as const,
      title,
      detail: artifact.summary,
    }));
  }
  return [
    {
      severity: "nit",
      title: "Reviewed",
      detail: artifact.summary,
    },
  ];
}

function asTests(artifact: Artifact): string[] {
  const cases = [
    ...bullets(artifact, "Must pass"),
    ...bullets(artifact, "Cases"),
    ...bullets(artifact, "Must fail if the bad fix lands"),
  ];
  return cases.length > 0 ? cases : [artifact.summary];
}

function asReview(artifact: Artifact): SharedReview {
  return {
    summary: artifact.summary,
    recommendation: artifact.recommendation,
    findings: artifact.findings.map((item) => ({ ...item })),
  };
}

export function writeSharedState(
  state: SharedAgentState,
  agent: AgentId,
  artifact: Artifact,
  analysis: TaskAnalysis,
): SharedAgentState {
  const next = compactState(state);

  switch (agent) {
    case "requirements":
      next.requirements = asRequirements(artifact);
      break;
    case "architect":
      next.architecture = asArchitecture(artifact);
      break;
    case "security":
      next.security_findings = asFindings(artifact);
      break;
    case "implement":
      next.files_changed = filesFor(analysis, state.task);
      break;
    case "tests":
      next.tests = asTests(artifact);
      break;
    case "pr_review":
      next.review = asReview(artifact);
      break;
    default:
      break;
  }

  return next;
}

export function setStateStatus(state: SharedAgentState, status: RunStatus): SharedAgentState {
  return { ...compactState(state), status };
}

export function draftState(input: TaskInput | string): SharedAgentState {
  const task = typeof input === "string" ? input : input.task;
  return initSharedState(task);
}
