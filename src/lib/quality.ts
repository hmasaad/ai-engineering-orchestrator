import { comesBefore, hasAgent } from "./plan";
import type { ExecutionPlan, QualityCheck, QualityReport, TaskAnalysis } from "./types";

export type EvaluableRun = {
  ticket?: string;
  analysis: TaskAnalysis;
  plan: ExecutionPlan;
  artifacts?: { agent: string }[];
};

function check(
  id: string,
  label: string,
  pass: boolean,
  detail: string,
  severity: QualityCheck["severity"] = "error",
): QualityCheck {
  return { id, label, pass, severity, detail };
}

export function evaluatePlan(analysis: TaskAnalysis, plan: ExecutionPlan, ticket = ""): QualityReport {
  const text = ticket.toLowerCase();
  const agents = plan.steps.map((step) => step.agent);
  const unique = new Set(agents);
  const ship = hasAgent(plan, "implement") || hasAgent(plan, "pr");
  const auth = analysis.area === "Authentication";
  const high = analysis.risk === "high" || analysis.risk === "critical";

  const checks: QualityCheck[] = [
    check(
      "not-one-shot",
      "Not a one-shot LLM solve",
      agents.length > 1 || analysis.taskType === "research",
      agents.length > 1
        ? "The plan routes through specialists."
        : "A single step is how tickets get 'just fixed' by one model.",
    ),
    check(
      "no-duplicate-agents",
      "Each specialist appears once",
      unique.size === agents.length,
      unique.size === agents.length ? "No repeated agents." : "The same agent was scheduled twice.",
    ),
    check(
      "research-before-change",
      "Research before a fix",
      !hasAgent(plan, "implement") || comesBefore(plan, "research", "implement") || hasAgent(plan, "bug"),
      hasAgent(plan, "implement") && !hasAgent(plan, "research") && !hasAgent(plan, "bug")
        ? "Generate Fix ran without Bug Investigation or Code Research."
        : "Evidence is gathered before a patch.",
    ),
    check(
      "security-before-fix",
      "Security Review before Generate Fix when required",
      !ship || !auth || (hasAgent(plan, "security") && comesBefore(plan, "security", "implement")),
      auth && ship && !hasAgent(plan, "security")
        ? "Authentication work shipped without Security Review."
        : "Security sits in front of the patch when auth is involved.",
    ),
    check(
      "evals-before-pr",
      "Evals before Create PR",
      !hasAgent(plan, "pr") || (hasAgent(plan, "evals") && comesBefore(plan, "evals", "pr")),
      hasAgent(plan, "pr") && !comesBefore(plan, "evals", "pr")
        ? "A PR was planned before the quality gate."
        : "The gate sits in front of the PR.",
    ),
    check(
      "review-after-pr",
      "PR Reviewer after Create PR",
      !hasAgent(plan, "pr") || (hasAgent(plan, "pr_review") && comesBefore(plan, "pr", "pr_review")),
      hasAgent(plan, "pr") && !hasAgent(plan, "pr_review")
        ? "The orchestrator would rubber-stamp its own PR."
        : "A reviewer agent looks at the PR.",
    ),
    check(
      "human-on-high-risk",
      "Human approval on high/critical risk",
      !high || hasAgent(plan, "approval"),
      high && !hasAgent(plan, "approval")
        ? "High-risk work has no human gate."
        : "A person signs off when risk is high.",
    ),
    check(
      "bug-path",
      "Bugs get investigation, not an instant patch",
      analysis.vague || analysis.taskType !== "bug" || (hasAgent(plan, "bug") && hasAgent(plan, "rca")),
      analysis.taskType === "bug" && !hasAgent(plan, "bug")
        ? "A bug ticket skipped Bug Investigation."
        : "Bug tickets go through investigation and RCA.",
    ),
    check(
      "feature-architect",
      "Features get an architect pass",
      analysis.taskType !== "feature" || analysis.vague || hasAgent(plan, "architect"),
      analysis.taskType === "feature" && !hasAgent(plan, "architect")
        ? "A feature skipped the Architect Agent."
        : "Feature work is designed before it is coded.",
    ),
    check(
      "research-does-not-ship",
      "Research tickets do not open a PR",
      analysis.taskType !== "research" || analysis.vague || !hasAgent(plan, "pr"),
      analysis.taskType === "research" && hasAgent(plan, "pr")
        ? "A question was turned into a ship plan."
        : "Questions stay questions.",
    ),
    check(
      "vague-does-not-ship",
      "Vague tickets do not generate a fix",
      !analysis.vague || (!hasAgent(plan, "implement") && !hasAgent(plan, "pr")),
      analysis.vague && hasAgent(plan, "implement")
        ? "An underspecified ticket was given a patch plan."
        : "Thin tickets stop for clarification.",
    ),
    check(
      "low-risk-not-overrouted",
      "Low-risk cleanup is not a full security+architect parade",
      analysis.risk !== "low" ||
        analysis.taskType === "security" ||
        !(hasAgent(plan, "security") && hasAgent(plan, "architect") && hasAgent(plan, "approval")),
      analysis.risk === "low" && hasAgent(plan, "security") && hasAgent(plan, "architect")
        ? "A low-risk cleanup dispatched every expensive agent."
        : "Routing stays proportional.",
      "warning",
    ),
    check(
      "logout-mentions-auth",
      "Logout tickets are classified as authentication",
      !/logged out|logout|session/.test(text) || analysis.area === "Authentication" || analysis.vague,
      /logged out|logout|session/.test(text) && analysis.area !== "Authentication"
        ? "A session/logout ticket was not marked Authentication."
        : "Session language maps to Authentication.",
    ),
  ];

  const errors = checks.filter((item) => !item.pass && item.severity === "error");
  const warnings = checks.filter((item) => !item.pass && item.severity === "warning");
  const passed = checks.filter((item) => item.pass).length;
  const score = Math.round((passed / checks.length) * 100);

  return {
    ready: errors.length === 0,
    score,
    errorCount: errors.length,
    warningCount: warnings.length,
    checks,
  };
}

export function evaluateRun(run: EvaluableRun): QualityReport {
  const base = evaluatePlan(run.analysis, run.plan, run.ticket);
  if (!run.artifacts || run.artifacts.length === 0) return base;

  const extra: QualityCheck[] = [];
  if (run.plan.steps.some((step) => step.agent === "evals")) {
    extra.push(
      check(
        "evals-artifact",
        "Evals produced a gate artifact",
        run.artifacts.some((item) => item.agent === "evals"),
        "The quality gate left an artifact on the run.",
      ),
    );
  }

  const checks = [...base.checks, ...extra];
  const errors = checks.filter((item) => !item.pass && item.severity === "error");
  const warnings = checks.filter((item) => !item.pass && item.severity === "warning");
  const score = Math.round((checks.filter((item) => item.pass).length / checks.length) * 100);
  return {
    ready: errors.length === 0,
    score,
    errorCount: errors.length,
    warningCount: warnings.length,
    checks,
  };
}

