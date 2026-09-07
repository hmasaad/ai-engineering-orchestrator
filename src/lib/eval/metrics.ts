import { hasAgent } from "../plan";
import { isDatabaseChange, isSecuritySensitive } from "../router";
import { hasPerformanceIssue, riskPolicyOf } from "../risk";
import type { AgentId, ExecutionPlan, PublicAgentName, QualityReport, TaskAnalysis } from "../types";
import type { EvalScenario } from "./scenarios";
import type { ScenarioScore } from "./rubric";

/** Control-plane and IF-rule specialists the policy may select. */
export type EvalToolId = Extract<
  AgentId,
  "security" | "database" | "performance" | "tests" | "pr_review" | "merge" | "evals" | "approval" | "pr"
>;

export const EVAL_TOOLS: EvalToolId[] = [
  "security",
  "database",
  "performance",
  "tests",
  "pr_review",
  "merge",
  "evals",
  "approval",
  "pr",
];

/** Deterministic specialist-units. Human approval is not model cost. */
export const UNIT_COST: Record<AgentId, number> = {
  requirements: 2,
  bug: 2,
  research: 2,
  rca: 2,
  architect: 3,
  tech_debt: 2,
  security: 4,
  database: 3,
  performance: 3,
  implement: 5,
  tests: 3,
  pr_review: 2,
  merge: 1,
  evals: 1,
  approval: 0,
  pr: 1,
};

export const EVAL_MEASURES = [
  { id: "task_success", label: "Task success" },
  { id: "agent_selection_accuracy", label: "Agent selection accuracy" },
  { id: "tool_selection_accuracy", label: "Tool selection accuracy" },
  { id: "code_correctness", label: "Code correctness" },
  { id: "security", label: "Security" },
  { id: "regression_rate", label: "Regression rate" },
  { id: "human_intervention_rate", label: "Human intervention rate" },
  { id: "cost", label: "Cost" },
  { id: "latency", label: "Latency" },
] as const;

export type EvalMeasureId = (typeof EVAL_MEASURES)[number]["id"];

export type MeasureStat = {
  id: EvalMeasureId;
  label: string;
  score: number | null;
  display: string;
  detail: string;
  better: "higher" | "lower" | "neutral";
};

export type SuiteMetrics = {
  task_success: MeasureStat;
  agent_selection_accuracy: MeasureStat;
  tool_selection_accuracy: MeasureStat;
  code_correctness: MeasureStat;
  security: MeasureStat;
  regression_rate: MeasureStat;
  human_intervention_rate: MeasureStat;
  cost: MeasureStat;
  latency: MeasureStat;
};

export type GoldObservation = {
  id: string;
  ok: boolean;
  selectedAgents: PublicAgentName[];
  expectedAgents: PublicAgentName[] | null;
  specialistsScore: number;
  requiredTools: EvalToolId[];
  selectedTools: EvalToolId[];
  correctness: number;
  security: number;
  regression: number;
  guardrailPassRate: number;
  humanRequired: boolean;
  humanPresent: boolean;
  cost: number;
  waves: number;
  latencyMs: number;
};

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function pct(passed: number, total: number) {
  if (total === 0) return 100;
  return Math.round((passed / total) * 100);
}

function round(value: number, digits = 0) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function f1(expected: string[], actual: string[]) {
  const exp = new Set(expected);
  const act = new Set(actual);
  let overlap = 0;
  for (const item of act) if (exp.has(item)) overlap += 1;
  const precision = act.size === 0 ? 1 : overlap / act.size;
  const recall = exp.size === 0 ? 1 : overlap / exp.size;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

export function requiredTools(analysis: TaskAnalysis): EvalToolId[] {
  const policy = riskPolicyOf(analysis);
  const tools: EvalToolId[] = [];
  const ticket = analysis.input.task;
  const change = analysis.asksForChange;

  if (isSecuritySensitive({ ...analysis, ticket })) tools.push("security");
  if (isDatabaseChange({ ...analysis, ticket })) tools.push("database");
  if (hasPerformanceIssue(ticket)) tools.push("performance");

  if (change) {
    tools.push("merge", "evals", "pr");
    if (policy.require_tests) tools.push("tests");
    if (policy.require_review) tools.push("pr_review");
  }
  if (policy.require_human || analysis.vague) tools.push("approval");
  return EVAL_TOOLS.filter((id) => tools.includes(id));
}

export function selectedTools(plan: ExecutionPlan): EvalToolId[] {
  const present = new Set(plan.steps.map((step) => step.agent));
  return EVAL_TOOLS.filter((id) => present.has(id));
}

export function planCost(plan: ExecutionPlan) {
  return plan.steps.reduce((sum, step) => sum + (UNIT_COST[step.agent] ?? 1), 0);
}

export function planWaves(plan: ExecutionPlan) {
  return plan.steps.reduce((max, step) => Math.max(max, step.wave), 0);
}

export function observeGold(input: {
  scenario: EvalScenario;
  analysis: TaskAnalysis;
  plan: ExecutionPlan;
  score: ScenarioScore;
  gate: QualityReport;
  ok: boolean;
  latencyMs: number;
}): GoldObservation {
  const expected =
    input.scenario.assertions.find((item) => item.expectedAgents)?.expectedAgents ?? null;
  const specialists = input.score.dimensions.find((item) => item.id === "specialists");
  const guardrails = Object.values(input.gate.guardrails ?? {});
  const guardrailPass = guardrails.filter((item) => item === "pass").length;

  return {
    id: input.scenario.id,
    ok: input.ok,
    selectedAgents: input.analysis.route.routing.agents,
    expectedAgents: expected ?? null,
    specialistsScore: specialists?.score ?? 100,
    requiredTools: requiredTools(input.analysis),
    selectedTools: selectedTools(input.plan),
    correctness: input.gate.dimensions.correctness?.score ?? 0,
    security: input.gate.dimensions.security?.score ?? 0,
    regression: input.gate.dimensions.regression?.score ?? 0,
    guardrailPassRate: pct(guardrailPass, guardrails.length || 1),
    humanRequired: riskPolicyOf(input.analysis).require_human || input.analysis.vague,
    humanPresent: hasAgent(input.plan, "approval"),
    cost: planCost(input.plan),
    waves: planWaves(input.plan),
    latencyMs: input.latencyMs,
  };
}

function measure(
  id: EvalMeasureId,
  label: string,
  score: number | null,
  display: string,
  detail: string,
  better: MeasureStat["better"] = "higher",
): MeasureStat {
  return { id, label, score, display, detail, better };
}

export function aggregateMetrics(
  observations: GoldObservation[],
  samples: { ok: boolean }[],
): SuiteMetrics {
  const goldPass = observations.filter((item) => item.ok).length;
  const samplePass = samples.filter((item) => item.ok).length;
  const labeled = observations.filter((item) => item.expectedAgents);
  const exactRoutes = labeled.filter(
    (item) => item.expectedAgents!.join(",") === item.selectedAgents.join(","),
  ).length;
  const agentF1 = mean(
    labeled.map((item) => f1(item.expectedAgents ?? [], item.selectedAgents)),
  );
  const toolF1 = mean(observations.map((item) => f1(item.requiredTools, item.selectedTools)));
  const toolPrecision = mean(
    observations.map((item) => {
      const act = new Set(item.selectedTools);
      const exp = new Set(item.requiredTools);
      let overlap = 0;
      for (const id of act) if (exp.has(id)) overlap += 1;
      return act.size === 0 ? 1 : overlap / act.size;
    }),
  );
  const toolRecall = mean(
    observations.map((item) => {
      const act = new Set(item.selectedTools);
      const exp = new Set(item.requiredTools);
      let overlap = 0;
      for (const id of exp) if (act.has(id)) overlap += 1;
      return exp.size === 0 ? 1 : overlap / exp.size;
    }),
  );
  const humanCorrect = observations.filter((item) => item.humanPresent === item.humanRequired).length;
  const humanRate = pct(
    observations.filter((item) => item.humanPresent).length,
    observations.length,
  );
  const regressionRate = round(100 - mean(observations.map((item) => item.regression)), 1);
  const latencies = observations.map((item) => item.latencyMs);
  const avgCost = round(mean(observations.map((item) => item.cost)), 1);
  const totalCost = observations.reduce((sum, item) => sum + item.cost, 0);
  const avgMs = round(mean(latencies), 1);
  const p95 = round(percentile(latencies, 95), 1);
  const avgWaves = round(mean(observations.map((item) => item.waves)), 1);
  const agentScore = labeled.length
    ? Math.round(agentF1 * 100)
    : Math.round(mean(observations.map((item) => item.specialistsScore)));
  const securityScore = Math.round(
    mean(observations.map((item) => (item.security + item.guardrailPassRate) / 2)),
  );

  return {
    task_success: measure(
      "task_success",
      "Task success",
      pct(goldPass + samplePass, observations.length + samples.length),
      `${pct(goldPass + samplePass, observations.length + samples.length)}`,
      `${goldPass}/${observations.length} gold · ${samplePass}/${samples.length} samples`,
    ),
    agent_selection_accuracy: measure(
      "agent_selection_accuracy",
      "Agent selection accuracy",
      agentScore,
      `${agentScore}`,
      labeled.length
        ? `${exactRoutes}/${labeled.length} exact routes · F1 ${Math.round(agentF1 * 100)}`
        : `Specialists dimension ${agentScore}`,
    ),
    tool_selection_accuracy: measure(
      "tool_selection_accuracy",
      "Tool selection accuracy",
      Math.round(toolF1 * 100),
      `${Math.round(toolF1 * 100)}`,
      `P ${Math.round(toolPrecision * 100)} · R ${Math.round(toolRecall * 100)}`,
    ),
    code_correctness: measure(
      "code_correctness",
      "Code correctness",
      Math.round(mean(observations.map((item) => item.correctness))),
      `${Math.round(mean(observations.map((item) => item.correctness)))}`,
      "Quality gate correctness on gold runs",
    ),
    security: measure(
      "security",
      "Security",
      securityScore,
      `${securityScore}`,
      `Gate ${Math.round(mean(observations.map((item) => item.security)))} · guardrails ${Math.round(mean(observations.map((item) => item.guardrailPassRate)))}`,
    ),
    regression_rate: measure(
      "regression_rate",
      "Regression rate",
      Math.round(100 - regressionRate),
      `${regressionRate}%`,
      "Share of regression checks that failed on gold. Lower is better.",
      "lower",
    ),
    human_intervention_rate: measure(
      "human_intervention_rate",
      "Human intervention rate",
      pct(humanCorrect, observations.length),
      `${humanRate}%`,
      `${observations.filter((item) => item.humanPresent).length}/${observations.length} tickets needed a human · accuracy ${pct(humanCorrect, observations.length)}`,
      "neutral",
    ),
    cost: measure(
      "cost",
      "Cost",
      null,
      `${avgCost}`,
      `${avgCost} specialist-units / ticket · ${totalCost} total`,
      "neutral",
    ),
    latency: measure(
      "latency",
      "Latency",
      null,
      `${avgMs}ms`,
      `avg ${avgMs}ms · p95 ${p95}ms · ${avgWaves} waves`,
      "lower",
    ),
  };
}

export function metricsList(metrics: SuiteMetrics): MeasureStat[] {
  return EVAL_MEASURES.map((item) => metrics[item.id]);
}
