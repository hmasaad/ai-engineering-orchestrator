import { analyzeRepository } from "./repo";
import { riskPolicyOf } from "./risk";
import type {
  CompactEngineering,
  ControlPolicy,
  EngineeringPlan,
  EngineeringTool,
  FinalDecision,
  PlanStep,
  RetryPolicy,
  SuccessCriterion,
  TaskAnalysis,
} from "./types";

export const CONTROL_PIPELINE = [
  "Task Understanding",
  "Repository Analysis",
  "Risk Assessment",
  "Engineering Plan",
  "Dependency Graph",
  "Agent Selection",
  "Execution",
  "Validation",
  "Review",
  "Fix / Retry",
  "Final Decision",
] as const;

function toolsFor(analysis: TaskAnalysis, steps: PlanStep[]): EngineeringTool[] {
  const tools: EngineeringTool[] = ["read_repo", "search_code"];
  const has = (agent: PlanStep["agent"]) => steps.some((step) => step.agent === agent);
  if (has("implement") && analysis.asksForChange) tools.push("edit_files");
  if (has("tests")) tools.push("run_tests");
  if (has("security")) tools.push("security_review");
  if (has("database")) tools.push("schema_review");
  if (has("performance")) tools.push("perf_profile");
  if (has("evals")) tools.push("eval_suite");
  if (has("pr")) tools.push("open_pr");
  if (has("approval")) tools.push("human_gate");
  return tools;
}

function successFor(analysis: TaskAnalysis, steps: PlanStep[], control: ControlPolicy): SuccessCriterion[] {
  if (analysis.vague) {
    return [
      { id: "clarify", label: "Reporter answers what is failing, for whom, and since when." },
      { id: "no-ship", label: "No PR. The control plane does not invent a ship plan." },
    ];
  }
  if (analysis.planner?.shape === "decision") {
    return [
      { id: "debate", label: "Architect, Performance, Security, and Developer have spoken." },
      { id: "consensus", label: "Consensus Engine produced a recommendation. No PR." },
      { id: "human", label: "A person accepts or rejects the recommendation." },
    ];
  }
  if (analysis.taskType === "research" || !steps.some((step) => step.agent === "pr")) {
    return [
      { id: "answer", label: "A written answer from Code Research. No code change." },
      { id: "no-pr", label: "Action is not a pull request." },
    ];
  }
  const items: SuccessCriterion[] = [
    { id: "evals", label: "Quality gate PASSes (correctness, security, tests, architecture, regression, quality)." },
    { id: "scope", label: "Files changed stay inside the repository analysis." },
    { id: "guardrails", label: "Guardrails held. Retrieved notes and ticket language cannot skip a gate." },
    { id: "no-merge", label: "Action is opening a PR. Nothing merges." },
  ];
  if (control.action === "tests_review" || control.action === "security_human" || control.action === "mandatory_human") {
    items.splice(1, 0, { id: "tests", label: "Testing Agent cases are on the blackboard." });
  }
  if (steps.some((step) => step.agent === "security")) {
    items.splice(1, 0, { id: "security", label: "Security Review ran before Developer." });
  }
  if (control.gates.length > 0) {
    items.push({ id: "human", label: "A person approved after the quality gate." });
  }
  if (analysis.riskEngine?.policy.require_rollback) {
    items.push({ id: "rollback", label: "Rollback path is named before Action." });
  }
  return items;
}

function retryFor(analysis: TaskAnalysis, steps: PlanStep[]): RetryPolicy {
  const shipping = steps.some((step) => step.agent === "implement") && steps.some((step) => step.agent === "evals");
  if (!shipping || analysis.vague) {
    return {
      allowed: false,
      maxAttempts: 0,
      onFail: "hold",
      reason: "No patch loop. Clarify or research, then stop.",
    };
  }
  return {
    allowed: true,
    maxAttempts: 2,
    onFail: "retry_implement",
    reason:
      "Failure Classifier first: compilation or test logic → Developer; environment → Infrastructure; dependency → Dependency Agent; unknown → Investigation. Then the verification loop. Security stays on the stem before Developer. Never merge.",
  };
}

function parallelWaves(steps: PlanStep[]): string[][] {
  const waves: string[][] = [];
  for (const step of steps) {
    const last = waves[step.wave - 1];
    if (last) last.push(step.label);
    else waves[step.wave - 1] = [step.label];
  }
  return waves.filter((wave) => wave && wave.length > 0);
}

function dependencies(steps: PlanStep[]): EngineeringPlan["dependencies"] {
  const byId = new Map(steps.map((step) => [step.id, step]));
  return steps.flatMap((step) =>
    step.dependsOn.map((from) => ({
      from,
      to: step.id,
      why: `${byId.get(from)?.label ?? from} must finish before ${step.label}.`,
    })),
  );
}

export function buildEngineeringPlan(
  analysis: TaskAnalysis,
  steps: PlanStep[],
  control: ControlPolicy,
): EngineeringPlan {
  const policy = riskPolicyOf(analysis);
  const humanReason =
    control.gates.map((item) => item.reason).join(" ") ||
    (policy.require_human ? "HIGH/CRITICAL requires a human after the quality gate." : "No human gate.");
  return {
    taskType: analysis.taskType,
    risk: analysis.risk,
    shape: analysis.planner?.shape ?? "feature",
    intent: analysis.planner?.intent ?? "change",
    pipeline: [...CONTROL_PIPELINE],
    repository: analyzeRepository(analysis),
    agents: [...analysis.route.routing.agents],
    tools: toolsFor(analysis, steps),
    dependencies: dependencies(steps),
    parallel: parallelWaves(steps),
    humanApproval: {
      required: control.gates.length > 0,
      gates: control.gates.map((item) => item.id),
      reason: humanReason,
    },
    success: successFor(analysis, steps, control),
    retry: retryFor(analysis, steps),
    selection: {
      pattern: analysis.route.pattern,
      reason: analysis.route.reason,
      rules: analysis.route.routing.rules,
    },
  };
}

export function compactEngineering(plan: EngineeringPlan): CompactEngineering {
  return {
    type: plan.taskType,
    areas: plan.repository.areas,
    files: plan.repository.files,
    agents: plan.agents,
    tools: plan.tools,
    parallel: plan.parallel,
    human: plan.humanApproval.required,
    success: plan.success.map((item) => item.label),
    retry: plan.retry.onFail,
  };
}

export function finalDecision(input: {
  vague: boolean;
  taskType: TaskAnalysis["taskType"];
  asksForChange?: boolean;
  qualityReady: boolean;
  status: string;
  humanRequired: boolean;
  pendingGate: string | null;
}): FinalDecision {
  if (input.vague) {
    return { outcome: "clarify", reason: "The ticket is too thin. Ask, then a human decides. No PR." };
  }
  if (input.taskType === "research") {
    return { outcome: "research", reason: "A question was answered. Action is not a pull request." };
  }
  if (input.status === "rejected") {
    return { outcome: "hold", reason: "A human rejected the plan. Nothing ships." };
  }
  if (!input.qualityReady) {
    return { outcome: "hold", reason: "Validation failed closed. No PR." };
  }
  if (input.humanRequired && (input.status === "awaiting_approval" || input.pendingGate)) {
    return {
      outcome: "awaiting_human",
      reason:
        input.asksForChange === false || input.taskType === "architecture"
          ? "Specialists debated. A person must accept the recommendation."
          : "Evals passed. A person must sign before Action.",
    };
  }
  if (input.asksForChange === false || input.taskType === "architecture") {
    return {
      outcome: "recommend",
      reason: "Consensus produced a recommendation. Action is not a pull request.",
    };
  }
  return { outcome: "open_pr", reason: "Action is opening a PR. The control plane never merges." };
}
