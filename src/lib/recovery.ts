import { isSimpleUi } from "./router";
import { reviewBlockers } from "./verification";
import type {
  AgentId,
  Artifact,
  ExecutionPlan,
  FailureCause,
  FailureKind,
  FailureRecovery,
  Finding,
  OrchestrationRun,
  RecoveryDecision,
  RecoveryEvent,
  RecoveryOutcome,
  RecoveryStage,
  RecoveryTarget,
  TaskAnalysis,
} from "./types";

export const FAILURE_KINDS: { id: FailureKind; label: string; target: RecoveryTarget; hint: string }[] = [
  { id: "tool_failure", label: "Tool failure", target: "investigation", hint: "A tool returned an error. Do not re-prompt the same agent." },
  { id: "agent_failure", label: "Agent failure", target: "investigation", hint: "The specialist crashed or returned nothing usable." },
  { id: "timeout", label: "Timeout", target: "infrastructure", hint: "The step exceeded its budget. Infrastructure, not another code pass." },
  { id: "invalid_output", label: "Invalid output", target: "developer", hint: "The artifact failed its contract or review. Developer fixes the output." },
  { id: "test_failure", label: "Test failure", target: "developer", hint: "Tests failed. Classify the cause before picking who acts." },
  { id: "security_failure", label: "Security failure", target: "human", hint: "Do not retry Security after Tests. Hold for a human." },
  { id: "conflicting_opinions", label: "Conflicting agent opinions", target: "investigation", hint: "Specialists disagree. Investigate instead of picking a winner." },
  { id: "token_limit", label: "Token limit", target: "investigation", hint: "The context window filled. Shrink the task; do not retry the same prompt." },
  { id: "dependency_failure", label: "Dependency failure", target: "dependency", hint: "A module or lockfile broke the build. Dependency Agent, not Developer-by-default." },
];

export const TEST_CAUSE_ROUTES: {
  cause: FailureCause;
  label: string;
  target: RecoveryTarget;
  hint: string;
  match: RegExp;
}[] = [
  {
    cause: "compilation",
    label: "Compilation?",
    target: "developer",
    hint: "Broken build. Developer fixes the compile error.",
    match: /compil|ts\d+|cannot find name|build failed|syntaxerror/i,
  },
  {
    cause: "test_logic",
    label: "Test logic?",
    target: "developer",
    hint: "Assertions failed. Developer fixes the code or the case.",
    match: /assertion|expected |test logic|failed \d+|spec failed/i,
  },
  {
    cause: "environment",
    label: "Environment?",
    target: "infrastructure",
    hint: "CI, docker, or a missing service. Infrastructure, not another code prompt.",
    match: /econnrefused|enoent|ci_|docker|environment|eaddrinuse/i,
  },
  {
    cause: "dependency",
    label: "Dependency?",
    target: "dependency",
    hint: "Missing module or lockfile drift. Dependency Agent.",
    match: /cannot find module|unmet peer|err_module_not_found|lockfile/i,
  },
  {
    cause: "unknown",
    label: "Unknown?",
    target: "investigation",
    hint: "No signature. Investigation Agent gathers evidence first.",
    match: /./,
  },
];

function hayOf(artifact: Pick<Artifact, "title" | "summary" | "sections" | "findings">) {
  const sections = artifact.sections.flatMap((section) => [section.heading, ...section.bullets]);
  const findings = artifact.findings.map((item) => `${item.title} ${item.detail}`);
  return [artifact.title, artifact.summary, ...sections, ...findings].join("\n");
}

export function classifyTestCause(text: string): { cause: FailureCause; target: RecoveryTarget } {
  for (const row of TEST_CAUSE_ROUTES) {
    if (row.cause === "unknown") continue;
    if (row.match.test(text)) return { cause: row.cause, target: row.target };
  }
  return { cause: "unknown", target: "investigation" };
}

export function draftRecovery(plan: ExecutionPlan): FailureRecovery {
  const looping = plan.engineering?.retry.allowed ?? plan.steps.some((step) => step.agent === "evals");
  return {
    kinds: FAILURE_KINDS.map((item) => item.id),
    routes: TEST_CAUSE_ROUTES.map((item) => ({
      cause: item.cause,
      target: item.target,
      label: item.label,
    })),
    outcome: looping ? "pending" : "idle",
    events: [],
    last: null,
  };
}

export function testFailureArtifacts(artifacts: Pick<Artifact, "agent" | "title" | "summary" | "sections" | "findings" | "contract">[] | undefined) {
  return (artifacts ?? []).filter((item) => {
    if (item.agent !== "tests") return false;
    if (item.contract?.output.status === "failed") return true;
    if (/tests failed/i.test(item.title)) return true;
    return item.findings.some((finding) => finding.severity === "blocker");
  });
}

function loopingTicket(analysis: TaskAnalysis) {
  if (analysis.vague || analysis.taskType === "research" || isSimpleUi(analysis)) return false;
  return analysis.taskType === "feature" || analysis.taskType === "bug";
}

export function testRecovered(recovery: FailureRecovery | undefined) {
  return Boolean(recovery?.events.some((event) => event.decision.kind === "test_failure"));
}

export function reviewRecovered(run: {
  verification?: { cycles: { trigger: string }[] };
  recovery?: FailureRecovery;
}) {
  if (run.verification?.cycles.some((cycle) => cycle.trigger === "review")) return true;
  return Boolean(run.recovery?.events.some((event) => event.stage === "review" && event.result === "reroute"));
}

export function compilationLoopIssues(analysis: TaskAnalysis, recovered: boolean): Finding[] {
  if (recovered) return [];
  if (!loopingTicket(analysis)) return [];
  const symbol = analysis.area === "Authentication" ? "GoogleToken" : `${analysis.area}Patch`;
  return [
    {
      severity: "blocker",
      title: "Compilation failed",
      detail: `error TS2304: Cannot find name '${symbol}'. Tests never reached assertions.`,
    },
  ];
}

function fromTests(artifacts: OrchestrationRun["artifacts"]): RecoveryDecision | null {
  const failed = testFailureArtifacts(artifacts);
  if (failed.length === 0) return null;
  const text = failed.map((item) => hayOf(item)).join("\n");
  const { cause, target } = classifyTestCause(text);
  const evidence = failed.flatMap((item) => item.findings.map((finding) => finding.title));
  return {
    kind: cause === "dependency" ? "dependency_failure" : "test_failure",
    cause,
    target,
    reason: `Testing Agent failed. Failure Classifier: ${cause} → ${targetLabel(target)}.`,
    fromAgent: "tests",
    evidence: evidence.length ? evidence : ["Tests failed"],
  };
}

function fromReview(artifacts: OrchestrationRun["artifacts"]): RecoveryDecision | null {
  const blockers = reviewBlockers(artifacts);
  if (blockers.length === 0) return null;
  return {
    kind: "invalid_output",
    cause: "contract",
    target: "developer",
    reason: `PR Reviewer found ${blockers.length} issue${blockers.length === 1 ? "" : "s"}. Invalid output → Developer, not the same review prompt.`,
    fromAgent: "pr_review",
    evidence: blockers.map((item) => item.title),
  };
}

function fromEvals(run: Pick<OrchestrationRun, "artifacts" | "quality">): RecoveryDecision | null {
  if (run.quality?.ready !== false) return null;
  const tests = fromTests(run.artifacts);
  if (tests) return tests;
  const review = fromReview(run.artifacts);
  if (review) return review;
  const failed = run.quality.checks.filter((item) => !item.pass && item.severity === "error");
  const text = failed.map((item) => `${item.label} ${item.detail}`).join("\n");
  if (/timeout|timed out/i.test(text)) {
    return {
      kind: "timeout",
      cause: "timeout",
      target: "infrastructure",
      reason: "Evals timed out. Infrastructure, not another Developer prompt.",
      fromAgent: "evals",
      evidence: failed.map((item) => item.label),
    };
  }
  if (/token|context window/i.test(text)) {
    return {
      kind: "token_limit",
      cause: "token_limit",
      target: "investigation",
      reason: "Token limit. Shrink the task. Do not retry the same prompt.",
      fromAgent: "evals",
      evidence: failed.map((item) => item.label),
    };
  }
  if (/tool /i.test(text)) {
    return {
      kind: "tool_failure",
      cause: "tool",
      target: "investigation",
      reason: "A tool failed under evals. Investigate the tool, do not re-prompt Developer.",
      fromAgent: "evals",
      evidence: failed.map((item) => item.label),
    };
  }
  return {
    kind: "invalid_output",
    cause: "test_logic",
    target: "developer",
    reason: "Evals FAIL. Guardrails held — classify as invalid output and send Developer, not the same eval prompt.",
    fromAgent: "evals",
    evidence: failed.map((item) => item.label).slice(0, 5),
  };
}

export function classifyFailure(
  run: Pick<OrchestrationRun, "artifacts" | "quality">,
  stage: RecoveryStage,
): RecoveryDecision | null {
  if (stage === "tests") return fromTests(run.artifacts);
  if (stage === "review") return fromReview(run.artifacts);
  return fromEvals(run);
}

export function targetLabel(target: RecoveryTarget) {
  if (target === "developer") return "Developer";
  if (target === "infrastructure") return "Infrastructure";
  if (target === "dependency") return "Dependency Agent";
  if (target === "investigation") return "Investigation Agent";
  if (target === "security") return "Security";
  if (target === "human") return "Human";
  return "Hold";
}

export function canReroute(target: RecoveryTarget, plan: ExecutionPlan) {
  if (target === "developer") return plan.steps.some((step) => step.agent === "implement");
  if (target === "investigation") {
    return plan.steps.some((step) => step.agent === "bug" || step.agent === "rca" || step.agent === "research");
  }
  return false;
}

export function cutForTarget(plan: ExecutionPlan, target: RecoveryTarget) {
  if (target === "developer") return plan.steps.findIndex((step) => step.agent === "implement");
  if (target === "investigation") {
    const ids: AgentId[] = ["bug", "rca", "research"];
    return plan.steps.findIndex((step) => ids.includes(step.agent));
  }
  return -1;
}

export function recordRecovery(
  recovery: FailureRecovery | undefined,
  event: RecoveryEvent,
  plan: ExecutionPlan,
): FailureRecovery {
  const base = recovery ?? draftRecovery(plan);
  const events = [...base.events, event];
  const outcome: RecoveryOutcome =
    event.result === "hold" ? "held" : event.result === "recovered" ? "recovered" : "rerouting";
  return {
    ...base,
    outcome,
    events,
    last: event.decision,
  };
}

export function closeRecovery(
  run: Pick<OrchestrationRun, "quality" | "recovery" | "retries" | "plan">,
): FailureRecovery {
  const base = run.recovery ?? draftRecovery(run.plan);
  const ready = run.quality.ready;
  if (base.outcome === "idle") return base;
  if (ready) {
    return {
      ...base,
      outcome: base.events.length > 0 ? "recovered" : "idle",
    };
  }
  if (base.outcome === "held") return base;
  const exhausted = (run.retries ?? 0) >= (run.plan.engineering?.retry.maxAttempts ?? 0);
  return { ...base, outcome: exhausted ? "held" : base.outcome };
}

export function compactRecovery(recovery: FailureRecovery) {
  const last = recovery.last ?? recovery.events.at(-1)?.decision ?? null;
  return {
    outcome: recovery.outcome,
    kind: last?.kind ?? null,
    cause: last?.cause ?? null,
    target: last?.target ?? null,
    from: last?.fromAgent ?? null,
    events: recovery.events.map((event) => ({
      attempt: event.attempt,
      stage: event.stage,
      kind: event.decision.kind,
      cause: event.decision.cause,
      target: event.decision.target,
      result: event.result,
    })),
  };
}
