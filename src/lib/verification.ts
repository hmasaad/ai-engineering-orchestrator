import { isSimpleUi } from "./router";
import type {
  Artifact,
  ExecutionPlan,
  Finding,
  OrchestrationRun,
  TaskAnalysis,
  VerificationCycle,
  VerificationLoop,
  VerificationTrigger,
} from "./types";

export const VERIFICATION_STAGES = ["Developer", "Tests", "Code Review", "Evals"] as const;

export function draftVerification(plan: ExecutionPlan): VerificationLoop {
  const looping = plan.engineering?.retry.allowed ?? plan.steps.some((step) => step.agent === "evals");
  return {
    stages: [...VERIFICATION_STAGES],
    pass: null,
    outcome: looping ? "pending" : "idle",
    attempts: 0,
    cycles: [],
  };
}

export function reviewBlockers(artifacts: Pick<Artifact, "agent" | "findings">[] | undefined) {
  return (artifacts ?? [])
    .filter((item) => item.agent === "pr_review")
    .flatMap((item) => (item.findings ?? []).filter((finding) => finding.severity === "blocker"));
}

export function reviewLoopIssues(analysis: TaskAnalysis, reviewRecovered: boolean): Finding[] {
  if (reviewRecovered) return [];
  if (analysis.vague || analysis.taskType === "research" || isSimpleUi(analysis)) return [];
  if (analysis.taskType !== "feature" && analysis.taskType !== "bug") return [];
  const area = analysis.area;
  return [
    {
      severity: "blocker",
      title: `${area} error path is untested`,
      detail: "PR Reviewer found no test for the failure mode named in the ticket.",
    },
    {
      severity: "blocker",
      title: "Happy-path-only handler",
      detail: "One code path still assumes the client is honest. Fix before evals.",
    },
    {
      severity: "blocker",
      title: "PR body omits the risk note",
      detail: "Reviewers cannot see what must stay on after this change.",
    },
  ];
}

export function recordCycle(
  loop: VerificationLoop | undefined,
  cycle: VerificationCycle,
): VerificationLoop {
  const cycles = [...(loop?.cycles ?? []), cycle];
  return {
    stages: [...VERIFICATION_STAGES],
    pass: cycle.result === "pass" ? true : false,
    outcome: cycle.result === "pass" ? "passed" : cycle.result === "hold" ? "exhausted" : "fixing",
    attempts: cycle.attempt,
    cycles,
  };
}

export function closeVerification(
  run: Pick<OrchestrationRun, "quality" | "verification" | "retries" | "plan">,
): VerificationLoop {
  const base = run.verification ?? draftVerification(run.plan);
  const ready = run.quality.ready;
  if (base.outcome === "idle") return { ...base, pass: ready, outcome: ready ? "passed" : "idle" };
  if (ready) {
    return {
      ...base,
      pass: true,
      outcome: "passed",
      attempts: run.retries ?? base.attempts,
    };
  }
  const exhausted = (run.retries ?? 0) >= (run.plan.engineering?.retry.maxAttempts ?? 0);
  return {
    ...base,
    pass: false,
    outcome: exhausted ? "exhausted" : base.outcome,
    attempts: run.retries ?? base.attempts,
  };
}

export function compactVerification(loop: VerificationLoop) {
  const last = loop.cycles.at(-1);
  return {
    outcome: loop.outcome,
    pass: loop.pass,
    attempts: loop.attempts,
    trigger: last?.trigger ?? null,
    issues: last?.issues.length ?? 0,
    stages: loop.stages,
    cycles: loop.cycles.map((cycle) => ({
      attempt: cycle.attempt,
      trigger: cycle.trigger,
      result: cycle.result,
      issues: cycle.issues.length,
    })),
  };
}

export function verificationTrigger(run: {
  artifacts: Pick<Artifact, "agent" | "findings">[];
  quality?: { ready: boolean };
}): { trigger: VerificationTrigger; issues: string[]; reason: string } | null {
  const blockers = reviewBlockers(run.artifacts);
  if (blockers.length > 0) {
    return {
      trigger: "review",
      issues: blockers.map((item) => item.title),
      reason: `PR Reviewer found ${blockers.length} issue${blockers.length === 1 ? "" : "s"}.`,
    };
  }
  if (run.quality && !run.quality.ready) {
    return {
      trigger: "evals",
      issues: ["Quality gate failed"],
      reason: "Evals FAIL. Guardrails held — retry Developer.",
    };
  }
  return null;
}
