import type { AgentId, ExecutionPlan, SharedAgentState, TaskAnalysis } from "../types";
import { AGENTS } from "../roster";
import { evaluatePlan } from "../quality";
import { comesBefore, hasAgent } from "../plan";

export const RUBRIC_DIMENSIONS = [
  { id: "routing", label: "Task routing", weight: 25 },
  { id: "specialists", label: "Specialist selection", weight: 25 },
  { id: "order", label: "Execution order", weight: 20 },
  { id: "approval", label: "Human gate", weight: 15 },
  { id: "proportion", label: "Proportionality", weight: 10 },
  { id: "oneshot", label: "No one-shot solve", weight: 5 },
] as const;

export type RubricId = (typeof RUBRIC_DIMENSIONS)[number]["id"];

export type ScoreContext = {
  ticket: string;
  analysis: TaskAnalysis;
  plan: ExecutionPlan;
  hay: string;
  state?: SharedAgentState;
};

export type ScenarioAssertion = {
  id: string;
  dimension: RubricId;
  label: string;
  test: (ctx: ScoreContext) => boolean;
  passDetail: string;
  failDetail: string;
};

export type AssertionResult = {
  id: string;
  dimension: RubricId;
  label: string;
  pass: boolean;
  detail: string;
};

export type DimensionScore = {
  id: RubricId;
  label: string;
  weight: number;
  score: number;
  passed: number;
  total: number;
};

export type ScenarioScore = {
  scenarioId: string;
  score: number;
  dimensions: DimensionScore[];
  assertions: AssertionResult[];
};

export function includesAny(hay: string, needles: string[]) {
  const text = hay.toLowerCase();
  return needles.some((needle) => text.includes(needle.toLowerCase()));
}

export function planAgents(plan: ExecutionPlan): AgentId[] {
  return plan.steps.map((step) => step.agent);
}

export function agentList(plan: ExecutionPlan) {
  return planAgents(plan).map((id) => AGENTS[id].label).join(" → ");
}

export function scoreAssertions(
  scenarioId: string,
  assertions: ScenarioAssertion[],
  ctx: ScoreContext,
): ScenarioScore {
  const results: AssertionResult[] = assertions.map((item) => {
    const pass = item.test(ctx);
    return {
      id: item.id,
      dimension: item.dimension,
      label: item.label,
      pass,
      detail: pass ? item.passDetail : item.failDetail,
    };
  });

  const dimensions: DimensionScore[] = RUBRIC_DIMENSIONS.map((dim) => {
    const rows = results.filter((item) => item.dimension === dim.id);
    const total = rows.length || 1;
    const passed = rows.length ? rows.filter((item) => item.pass).length : 1;
    return {
      id: dim.id,
      label: dim.label,
      weight: dim.weight,
      score: Math.round((passed / total) * 100),
      passed: rows.length ? passed : 1,
      total,
    };
  });

  const score = Math.round(
    dimensions.reduce((sum, dim) => sum + (dim.score * dim.weight) / 100, 0),
  );

  return { scenarioId, score, dimensions, assertions: results };
}

export function gateScore(analysis: TaskAnalysis, plan: ExecutionPlan, ticket: string) {
  return evaluatePlan(analysis, plan, ticket);
}

export { comesBefore, hasAgent };
