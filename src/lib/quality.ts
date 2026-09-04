import { comesBefore, gateBefore, hasAgent, hasGate } from "./plan";
import { hasArea } from "./classify";
import { isSimpleUi } from "./router";
import { isFilled } from "./state";
import type { ExecutionPlan, QualityCheck, QualityReport, SharedAgentState, TaskAnalysis } from "./types";

export type EvaluableRun = {
  ticket?: string;
  analysis: TaskAnalysis;
  plan: ExecutionPlan;
  artifacts?: { agent: string; sections?: { heading: string }[] }[];
  state?: SharedAgentState;
  status?: string;
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
  const ship = hasAgent(plan, "implement") || hasAgent(plan, "pr");
  const auth = hasArea(analysis, "authentication");
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
      new Set(agents.filter((id) => id !== "approval")).size ===
        agents.filter((id) => id !== "approval").length,
      new Set(agents.filter((id) => id !== "approval")).size ===
        agents.filter((id) => id !== "approval").length
        ? "No repeated specialists. Approval gates may appear twice."
        : "The same specialist was scheduled twice.",
    ),
    check(
      "research-before-change",
      "Evidence before a fix",
      !hasAgent(plan, "implement") ||
        isSimpleUi(analysis) ||
        comesBefore(plan, "research", "implement") ||
        comesBefore(plan, "requirements", "implement") ||
        hasAgent(plan, "bug"),
      hasAgent(plan, "implement") &&
        !isSimpleUi(analysis) &&
        !hasAgent(plan, "research") &&
        !hasAgent(plan, "requirements") &&
        !hasAgent(plan, "bug")
        ? "Developer Agent ran without Requirements, Research, or Bug Investigation."
        : "Evidence is gathered before a patch, unless the ticket is a simple UI change.",
    ),
    check(
      "security-before-fix",
      "Security Agent before Developer when required",
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
      "plan-gate-before-implement",
      "Plan approval before Implementation when required",
      !hasAgent(plan, "implement") ||
        isSimpleUi(analysis) ||
        (hasGate(plan, "plan") && gateBefore(plan, "plan", "implement")),
      hasAgent(plan, "implement") &&
        !isSimpleUi(analysis) &&
        !(hasGate(plan, "plan") && gateBefore(plan, "plan", "implement"))
        ? "Implementation was scheduled without a human on the plan."
        : "A person approves the plan before Developer writes code.",
    ),
    check(
      "ship-gate-before-pr",
      "Ship approval before Create PR",
      !hasAgent(plan, "pr") || (hasGate(plan, "ship") && gateBefore(plan, "ship", "pr")),
      hasAgent(plan, "pr") && !hasGate(plan, "ship")
        ? "A PR was scheduled without a human ship gate."
        : "Agents do not open PRs autonomously.",
    ),
    check(
      "not-autonomous",
      "Shipping work is not fully autonomous",
      !ship || hasAgent(plan, "approval"),
      ship && !hasAgent(plan, "approval")
        ? "Agents were allowed to ship without a human."
        : "Control gates stop autonomous shipping.",
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
      "Features get an architect pass unless they are a simple UI change",
      analysis.taskType !== "feature" ||
        analysis.vague ||
        isSimpleUi(analysis) ||
        hasAgent(plan, "architect"),
      analysis.taskType === "feature" && !isSimpleUi(analysis) && !hasAgent(plan, "architect")
        ? "A feature skipped the Architect Agent."
        : "Feature work is designed before it is coded, except simple UI changes.",
    ),
    check(
      "ui-not-a-parade",
      "Simple UI work is not a full feature pipeline",
      !isSimpleUi(analysis) ||
        (!hasAgent(plan, "requirements") && !hasAgent(plan, "architect") && !hasAgent(plan, "security")),
      isSimpleUi(analysis) && hasAgent(plan, "architect")
        ? "A simple UI change was given the full feature pipeline."
        : "UI routing stays proportional.",
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
      !/logged out|logout|session/.test(text) || hasArea(analysis, "authentication") || analysis.vague,
      /logged out|logout|session/.test(text) && !hasArea(analysis, "authentication")
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

  const agents = new Set(run.artifacts.map((item) => item.agent));
  const state = run.state;
  if (state) {
    extra.push(
      check(
        "shared-state-task",
        "Shared state carries the ticket",
        state.task.trim().length > 0,
        state.task.trim() ? "Agents are writing to one blackboard." : "Shared state lost the task.",
      ),
    );
    extra.push(
      check(
        "status-in-state",
        "Shared state status matches the run",
        !run.status || state.status === run.status,
        `State status is ${state.status}.`,
      ),
    );
    extra.push(
      check(
        "requirements-in-state",
        "Requirements Agent writes shared requirements",
        !agents.has("requirements") || isFilled(state.requirements),
        agents.has("requirements") && !isFilled(state.requirements)
          ? "Requirements ran but shared state.requirements is still empty."
          : "Requirements landed in shared state.",
      ),
    );
    extra.push(
      check(
        "architecture-in-state",
        "Architect writes shared architecture",
        !agents.has("architect") || isFilled(state.architecture),
        agents.has("architect") && !isFilled(state.architecture)
          ? "Architect ran but shared state.architecture is still empty."
          : "Architecture landed in shared state.",
      ),
    );
    extra.push(
      check(
        "security-in-state",
        "Security findings are shared",
        !agents.has("security") || state.security_findings.length > 0,
        agents.has("security") && state.security_findings.length === 0
          ? "Security ran but shared no findings."
          : "Later agents can read security_findings.",
      ),
    );
    extra.push(
      check(
        "files-in-state",
        "Developer writes files_changed",
        !agents.has("implement") || state.files_changed.length > 0,
        agents.has("implement") && state.files_changed.length === 0
          ? "Developer ran but files_changed is empty."
          : "The diff list is on the blackboard.",
      ),
    );
    extra.push(
      check(
        "tests-in-state",
        "Testing Agent writes tests",
        !agents.has("tests") || state.tests.length > 0,
        agents.has("tests") && state.tests.length === 0
          ? "Testing ran but shared state.tests is empty."
          : "Tests landed in shared state.",
      ),
    );
    extra.push(
      check(
        "review-in-state",
        "PR Reviewer writes review",
        !agents.has("pr_review") || isFilled(state.review),
        agents.has("pr_review") && !isFilled(state.review)
          ? "PR Reviewer ran but shared state.review is still empty."
          : "Review landed in shared state.",
      ),
    );
    extra.push(
      check(
        "developer-read-security",
        "Developer reads security findings from shared state",
        !agents.has("implement") ||
          !agents.has("security") ||
          run.artifacts.some(
            (item) =>
              item.agent === "implement" &&
              item.sections?.some((section) => /shared state/i.test(section.heading)),
          ),
        agents.has("implement") && agents.has("security")
          ? "Developer Agent did not read security_findings from shared state."
          : "Developer Agent consumed security_findings instead of starting from a blank prompt.",
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

