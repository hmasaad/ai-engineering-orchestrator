import { comesBefore, gateBefore, hasAgent, hasGate } from "./plan";
import { hasArea } from "./classify";
import { detectGuardrails, GUARDRAIL_CATALOG, heldFor } from "./guardrails";
import { isDatabaseChange, isSecuritySensitive, isSimpleUi } from "./router";
import { hasPerformanceIssue, riskPolicyOf } from "./risk";
import { isFilled } from "./state";
import type {
  EvalDimensionId,
  ExecutionPlan,
  QualityCheck,
  QualityGate,
  QualityReport,
  SharedAgentState,
  TaskAnalysis,
} from "./types";

export const EVAL_DIMENSIONS: { id: EvalDimensionId; label: string }[] = [
  { id: "correctness", label: "Correctness" },
  { id: "security", label: "Security" },
  { id: "tests", label: "Tests" },
  { id: "architecture", label: "Architecture" },
  { id: "regression", label: "Regression" },
  { id: "code_quality", label: "Code quality" },
];

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
  dimension: EvalDimensionId,
  label: string,
  pass: boolean,
  detail: string,
  severity: QualityCheck["severity"] = "error",
): QualityCheck {
  return { id, dimension, label, pass, severity, detail };
}

function guardrailStatus(checks: QualityCheck[], id: string): QualityGate["guardrails"]["prompt_injection"] {
  return checks.find((item) => item.id === id)?.pass === false ? "fail" : "pass";
}

export function finalizeReport(checks: QualityCheck[]): QualityReport {
  const errors = checks.filter((item) => !item.pass && item.severity === "error");
  const warnings = checks.filter((item) => !item.pass && item.severity === "warning");
  const passed = checks.filter((item) => item.pass).length;
  const score = Math.round((passed / Math.max(checks.length, 1)) * 100);
  const ready = errors.length === 0;

  const dimensions = Object.fromEntries(
    EVAL_DIMENSIONS.map((dim) => {
      const rows = checks.filter((item) => item.dimension === dim.id);
      const dimErrors = rows.filter((item) => !item.pass && item.severity === "error");
      const dimPassed = rows.filter((item) => item.pass).length;
      const total = rows.length;
      return [
        dim.id,
        {
          pass: dimErrors.length === 0,
          score: total === 0 ? 100 : Math.round((dimPassed / total) * 100),
        },
      ];
    }),
  ) as QualityReport["dimensions"];

  return {
    ready,
    verdict: ready ? "PASS" : "FAIL",
    score,
    errorCount: errors.length,
    warningCount: warnings.length,
    checks,
    dimensions,
    guardrails: Object.fromEntries(
      GUARDRAIL_CATALOG.map((item) => [item.id, guardrailStatus(checks, item.id.replaceAll("_", "-"))]),
    ) as QualityGate["guardrails"],
  };
}

export function compactGate(report: QualityReport): QualityGate {
  if (report.verdict && report.dimensions && report.guardrails) {
    return {
      verdict: report.verdict,
      score: report.score,
      dimensions: report.dimensions,
      guardrails: report.guardrails,
    };
  }
  return compactGate(finalizeReport(report.checks ?? []));
}

function guardrailChecks(analysis: TaskAnalysis, plan: ExecutionPlan, ticket: string): QualityCheck[] {
  const hits = detectGuardrails(ticket);

  return GUARDRAIL_CATALOG.map((item) => {
    const held = heldFor(item.id, analysis, plan);
    const hit = hits[item.id];
    return check(
      item.id.replaceAll("_", "-"),
      "security",
      `${item.label} did not rewrite the plan`,
      !hit || held,
      hit
        ? held
          ? `The ticket tried ${item.label.toLowerCase()}. Routing and gates did not obey.`
          : `${item.label} changed the route or dropped a required control.`
        : `No ${item.label.toLowerCase()} language in the ticket.`,
    );
  });
}

export function evaluatePlan(analysis: TaskAnalysis, plan: ExecutionPlan, ticket = ""): QualityReport {
  const text = ticket.toLowerCase();
  const agents = plan.steps.map((step) => step.agent);
  const ship = hasAgent(plan, "implement") || hasAgent(plan, "pr");
  const auth = hasArea(analysis, "authentication");
  const policy = riskPolicyOf(analysis);
  const high = policy.require_human;

  const checks: QualityCheck[] = [
    check(
      "not-one-shot",
      "correctness",
      "Not a one-shot LLM solve",
      agents.length > 1 || analysis.taskType === "research",
      agents.length > 1
        ? "The plan routes through specialists."
        : "A single step is how tickets get 'just fixed' by one model.",
    ),
    check(
      "no-duplicate-agents",
      "code_quality",
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
      "correctness",
      "Evidence before a fix",
      !hasAgent(plan, "implement") ||
        isSimpleUi(analysis) ||
        analysis.planner?.shape === "schema" ||
        analysis.planner?.shape === "performance" ||
        analysis.planner?.shape === "deploy" ||
        analysis.planner?.shape === "ui-patch" ||
        comesBefore(plan, "research", "implement") ||
        comesBefore(plan, "requirements", "implement") ||
        comesBefore(plan, "database", "implement") ||
        comesBefore(plan, "performance", "implement") ||
        hasAgent(plan, "bug"),
      hasAgent(plan, "implement") &&
        !isSimpleUi(analysis) &&
        analysis.planner?.shape !== "schema" &&
        analysis.planner?.shape !== "performance" &&
        analysis.planner?.shape !== "deploy" &&
        analysis.planner?.shape !== "ui-patch" &&
        !hasAgent(plan, "research") &&
        !hasAgent(plan, "requirements") &&
        !hasAgent(plan, "bug")
        ? "Developer Agent ran without Requirements, Research, or Bug Investigation."
        : "Evidence is gathered before a patch, unless the ticket is a simple UI change.",
    ),
    check(
      "security-before-fix",
      "security",
      "Security Agent before Developer when required",
      !ship || !auth || (hasAgent(plan, "security") && comesBefore(plan, "security", "implement")),
      auth && ship && !hasAgent(plan, "security")
        ? "Authentication work shipped without Security Review."
        : "Security sits in front of the patch when auth is involved.",
    ),
    check(
      "if-security-sensitive",
      "security",
      "IF security-sensitive → Security Agent",
      !ship ||
        !isSecuritySensitive({ ...analysis, ticket }) ||
        (hasAgent(plan, "security") && comesBefore(plan, "security", "implement")),
      isSecuritySensitive({ ...analysis, ticket }) && ship && !hasAgent(plan, "security")
        ? "A security-sensitive ticket skipped the Security Agent."
        : "Security is dispatched only when the IF matches.",
    ),
    check(
      "if-database-change",
      "architecture",
      "IF database change → Database Agent",
      !ship ||
        !isDatabaseChange({ ...analysis, ticket }) ||
        (hasAgent(plan, "database") && comesBefore(plan, "database", "implement")),
      isDatabaseChange({ ...analysis, ticket }) && ship && !hasAgent(plan, "database")
        ? "A database change skipped the Database Agent."
        : "Database is dispatched only when the IF matches.",
    ),
    check(
      "if-performance-issue",
      "regression",
      "IF performance issue → Performance Agent",
      !ship ||
        !hasPerformanceIssue(ticket) ||
        (hasAgent(plan, "performance") && comesBefore(plan, "performance", "implement")),
      hasPerformanceIssue(ticket) && ship && !hasAgent(plan, "performance")
        ? "A performance issue skipped the Performance Agent."
        : "Performance is dispatched only when the IF matches.",
    ),
    check(
      "evals-before-pr",
      "tests",
      "Evals before Create PR",
      !hasAgent(plan, "pr") || (hasAgent(plan, "evals") && comesBefore(plan, "evals", "pr")),
      hasAgent(plan, "pr") && !comesBefore(plan, "evals", "pr")
        ? "A PR was planned before the quality gate."
        : "The gate sits in front of the PR.",
    ),
    check(
      "tests-before-pr",
      "tests",
      "Tests before Action when the Risk Engine requires them",
      !ship || !policy.require_tests || (hasAgent(plan, "tests") && comesBefore(plan, "tests", "pr")),
      policy.require_tests && ship && !comesBefore(plan, "tests", "pr")
        ? "MEDIUM+ work was planned without tests locking the change."
        : "Testing sits in front of Action when required.",
    ),
    check(
      "review-before-action",
      "code_quality",
      "PR Reviewer before Action when the Risk Engine requires review",
      !ship ||
        !policy.require_review ||
        (hasAgent(plan, "pr_review") && comesBefore(plan, "pr_review", "pr")),
      policy.require_review && ship && !hasAgent(plan, "pr_review")
        ? "MEDIUM+ work skipped the reviewer."
        : "A reviewer looks at the change before Action.",
    ),
    check(
      "human-on-high-risk",
      "security",
      "Human approval on HIGH/CRITICAL risk",
      !high || hasAgent(plan, "approval"),
      high && !hasAgent(plan, "approval")
        ? "HIGH/CRITICAL work has no human gate."
        : "A person signs off when the Risk Engine requires a human.",
    ),
    check(
      "human-after-evals",
      "architecture",
      "Human sits after the quality gate when required",
      !high ||
        !hasAgent(plan, "pr") ||
        (hasAgent(plan, "evals") &&
          hasGate(plan, "ship") &&
          comesBefore(plan, "evals", "approval") &&
          gateBefore(plan, "ship", "pr")),
      high && hasAgent(plan, "pr") && !gateBefore(plan, "ship", "pr")
        ? "Action was scheduled without a human after the quality gate."
        : "HIGH/CRITICAL: merger → evals → human → Action.",
    ),
    check(
      "low-is-automatic",
      "code_quality",
      "LOW risk is automatic",
      analysis.risk !== "low" || analysis.vague || !ship || !hasAgent(plan, "approval"),
      analysis.risk === "low" && ship && hasAgent(plan, "approval")
        ? "A LOW-risk change was given a human gate."
        : "LOW risk goes through the quality gate, then Action.",
    ),
    check(
      "ship-gate-before-pr",
      "code_quality",
      "Ship approval before Action when a human is required",
      !ship || !policy.require_human || (hasGate(plan, "ship") && gateBefore(plan, "ship", "pr")),
      policy.require_human && ship && !hasGate(plan, "ship")
        ? "HIGH/CRITICAL Action was scheduled without a human."
        : "Humans approve after the quality gate when risk requires it.",
    ),
    check(
      "not-autonomous",
      "security",
      "HIGH/CRITICAL shipping is not fully autonomous",
      !ship || !policy.require_human || hasAgent(plan, "approval"),
      ship && policy.require_human && !hasAgent(plan, "approval")
        ? "HIGH/CRITICAL work was allowed to ship without a human."
        : "The Risk Engine decides when Action is automatic.",
    ),
    check(
      "merge-before-evals",
      "architecture",
      "Result Merger before the quality gate",
      !hasAgent(plan, "evals") ||
        !ship ||
        (hasAgent(plan, "merge") && comesBefore(plan, "merge", "evals")),
      ship && hasAgent(plan, "evals") && !comesBefore(plan, "merge", "evals")
        ? "The quality gate ran before results were merged."
        : "Merger folds specialist output before evals.",
    ),
    check(
      "bug-path",
      "regression",
      "Bugs get investigation, not an instant patch",
      analysis.vague || analysis.taskType !== "bug" || (hasAgent(plan, "bug") && hasAgent(plan, "rca")),
      analysis.taskType === "bug" && !hasAgent(plan, "bug")
        ? "A bug ticket skipped Bug Investigation."
        : "Bug tickets go through investigation and RCA.",
    ),
    check(
      "feature-architect",
      "architecture",
      "Features get an architect pass unless they are a simple UI change",
      analysis.taskType !== "feature" ||
        analysis.vague ||
        isSimpleUi(analysis) ||
        analysis.planner?.shape === "schema" ||
        analysis.planner?.shape === "performance" ||
        analysis.planner?.shape === "deploy" ||
        analysis.planner?.shape === "ui-patch" ||
        hasAgent(plan, "architect"),
      analysis.taskType === "feature" &&
        !isSimpleUi(analysis) &&
        analysis.planner?.shape !== "schema" &&
        analysis.planner?.shape !== "performance" &&
        analysis.planner?.shape !== "deploy" &&
        !hasAgent(plan, "architect")
        ? "A feature skipped the Architect Agent."
        : "Feature work is designed before it is coded, except simple UI changes.",
    ),
    check(
      "ui-not-a-parade",
      "architecture",
      "Simple UI work is not a full feature pipeline",
      !isSimpleUi(analysis) ||
        (!hasAgent(plan, "requirements") && !hasAgent(plan, "architect") && !hasAgent(plan, "security")),
      isSimpleUi(analysis) && hasAgent(plan, "architect")
        ? "A simple UI change was given the full feature pipeline."
        : "UI routing stays proportional.",
    ),
    check(
      "research-does-not-ship",
      "correctness",
      "Research tickets do not open a PR",
      analysis.taskType !== "research" || analysis.vague || !hasAgent(plan, "pr"),
      analysis.taskType === "research" && hasAgent(plan, "pr")
        ? "A question was turned into a ship plan."
        : "Questions stay questions.",
    ),
    check(
      "vague-does-not-ship",
      "correctness",
      "Vague tickets do not generate a fix",
      !analysis.vague || (!hasAgent(plan, "implement") && !hasAgent(plan, "pr")),
      analysis.vague && hasAgent(plan, "implement")
        ? "An underspecified ticket was given a patch plan."
        : "Thin tickets stop for clarification.",
    ),
    check(
      "low-risk-not-overrouted",
      "architecture",
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
      "regression",
      "Logout tickets are classified as authentication",
      !/logged out|logout|session/.test(text) || hasArea(analysis, "authentication") || analysis.vague,
      /logged out|logout|session/.test(text) && !hasArea(analysis, "authentication")
        ? "A session/logout ticket was not marked Authentication."
        : "Session language maps to Authentication.",
    ),
    ...guardrailChecks(analysis, plan, ticket),
  ];

  return finalizeReport(checks);
}

export function evaluateRun(run: EvaluableRun): QualityReport {
  const base = evaluatePlan(run.analysis, run.plan, run.ticket);
  if (!run.artifacts || run.artifacts.length === 0) return base;

  const extra: QualityCheck[] = [];
  const ranEvals = run.artifacts.some((item) => item.agent === "evals");
  const expectsEvals = run.plan.steps.some((step) => step.agent === "evals");
  if (expectsEvals && (ranEvals || run.status === "complete")) {
    extra.push(
      check(
        "evals-artifact",
        "tests",
        "Evals produced a gate artifact",
        ranEvals,
        ranEvals
          ? "The quality gate left an artifact on the run."
          : "The plan included evals but no gate artifact was written.",
      ),
    );
  }

  const agents = new Set(run.artifacts.map((item) => item.agent));
  const state = run.state;
  if (state) {
    extra.push(
      check(
        "shared-state-task",
        "correctness",
        "Shared state carries the ticket",
        state.task.trim().length > 0,
        state.task.trim() ? "Agents are writing to one blackboard." : "Shared state lost the task.",
      ),
    );
    extra.push(
      check(
        "status-in-state",
        "correctness",
        "Shared state status matches the run",
        !run.status || state.status === run.status,
        `State status is ${state.status}.`,
      ),
    );
    extra.push(
      check(
        "requirements-in-state",
        "correctness",
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
        "architecture",
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
        "security",
        "Security findings are shared",
        !agents.has("security") || state.security_findings.length > 0,
        agents.has("security") && state.security_findings.length === 0
          ? "Security ran but shared no findings."
          : "Later agents can read security_findings.",
      ),
    );
    extra.push(
      check(
        "database-in-state",
        "architecture",
        "Database Agent writes shared notes",
        !agents.has("database") || isFilled(state.database),
        agents.has("database") && !isFilled(state.database)
          ? "Database ran but shared state.database is still empty."
          : "Schema notes landed in shared state.",
      ),
    );
    extra.push(
      check(
        "performance-in-state",
        "regression",
        "Performance Agent writes shared notes",
        !agents.has("performance") || isFilled(state.performance),
        agents.has("performance") && !isFilled(state.performance)
          ? "Performance ran but shared state.performance is still empty."
          : "Performance notes landed in shared state.",
      ),
    );
    extra.push(
      check(
        "files-in-state",
        "correctness",
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
        "tests",
        "Testing Agent writes tests",
        !agents.has("tests") || state.tests.length > 0,
        agents.has("tests") && state.tests.length === 0
          ? "Testing ran but shared state.tests is empty."
          : "Tests landed in shared state.",
      ),
    );
    extra.push(
      check(
        "regression-coverage",
        "regression",
        "Changed files have tests when both specialists ran",
        !agents.has("implement") || !agents.has("tests") || state.tests.length > 0,
        agents.has("implement") && agents.has("tests") && state.tests.length === 0
          ? "Developer changed files without a testing lock."
          : "Testing locked the files Developer changed.",
      ),
    );
    extra.push(
      check(
        "review-in-state",
        "code_quality",
        "PR Reviewer writes review",
        !agents.has("pr_review") || isFilled(state.review),
        agents.has("pr_review") && !isFilled(state.review)
          ? "PR Reviewer ran but shared state.review is still empty."
          : "Review landed in shared state.",
      ),
    );
    extra.push(
      check(
        "merged-in-state",
        "architecture",
        "Result Merger writes the merged result",
        !agents.has("merge") || isFilled(state.merged),
        agents.has("merge") && !isFilled(state.merged)
          ? "Merger ran but shared state.merged is still empty."
          : "Specialist outputs were folded before the quality gate.",
      ),
    );
    extra.push(
      check(
        "developer-read-security",
        "security",
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

  return finalizeReport([...base.checks, ...extra]);
}
