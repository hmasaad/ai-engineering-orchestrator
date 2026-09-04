import { classifyTicket } from "../classify";
import { buildPlan } from "../plan";
import { evaluatePlan } from "../quality";
import { executePlan } from "../orchestrate";
import { SAMPLE_TICKETS } from "../samples";
import { attacksFor, planFromAgents } from "./attacks";
import { EVAL_SCENARIOS, contextFor, type EvalScenario } from "./scenarios";
import { scoreAssertions, type ScenarioScore } from "./rubric";

const GOLD_MIN = 80;

export type CaseResult = {
  kind: "gold" | "attack";
  ok: boolean;
  label?: string;
  score: ScenarioScore;
  gate: ReturnType<typeof evaluatePlan>;
};

export type ScenarioResult = {
  id: string;
  label: string;
  expected: string;
  ticket: string;
  headline: EvalScenario["headline"];
  gold: CaseResult;
  attacks: CaseResult[];
  ok: boolean;
};

export type Suite = {
  passed: boolean;
  samples: {
    id: string;
    ok: boolean;
    score: number;
    ready: boolean;
    errors: string[];
  }[];
  scenarios: ScenarioResult[];
};

function goldCase(scenario: EvalScenario): CaseResult {
  const ctx = contextFor(scenario.ticket);
  const score = scoreAssertions(scenario.id, scenario.assertions, ctx);
  const gate = evaluatePlan(ctx.analysis, ctx.plan, ctx.ticket);
  const failed = score.assertions.filter((item) => !item.pass);
  return {
    kind: "gold",
    ok: failed.length === 0 && score.score >= GOLD_MIN && gate.errorCount === 0,
    score,
    gate,
  };
}

function attackCases(scenario: EvalScenario): CaseResult[] {
  const analysis = classifyTicket(scenario.ticket);
  return attacksFor(scenario).map((attack) => {
    const plan = planFromAgents(analysis, attack.agents, attack.human);
    const ctx = { ticket: scenario.ticket, analysis, plan, hay: scenario.ticket.toLowerCase() };
    const score = scoreAssertions(`${scenario.id}:${attack.id}`, scenario.assertions, ctx);
    const gate = evaluatePlan(analysis, plan, scenario.ticket);
    const headlinesFail = scenario.headline.some((id) => {
      const dim = score.dimensions.find((item) => item.id === id);
      return (dim?.score ?? 100) < 100;
    });
    const assertionFailed = score.assertions.some((item) => !item.pass);
    return {
      kind: "attack" as const,
      ok: assertionFailed && (gate.errorCount > 0 || headlinesFail),
      label: attack.label,
      score,
      gate,
    };
  });
}

export function scoreScenario(scenario: EvalScenario): ScenarioResult {
  const gold = goldCase(scenario);
  const attacks = attackCases(scenario);
  return {
    id: scenario.id,
    label: scenario.label,
    expected: scenario.expected,
    ticket: scenario.ticket,
    headline: scenario.headline,
    gold,
    attacks,
    ok: gold.ok && attacks.every((item) => item.ok),
  };
}

export function runScenarioSuite() {
  const results = EVAL_SCENARIOS.map(scoreScenario);
  return {
    passed: results.every((item) => item.ok),
    results,
  };
}

export function runSampleSuite() {
  return SAMPLE_TICKETS.map((sample) => {
    const run = executePlan(sample.ticket);
    const errors = run.quality.checks.filter((item) => !item.pass && item.severity === "error");
    return {
      id: sample.id,
      ok: errors.length === 0,
      score: run.quality.score,
      ready: run.quality.ready,
      errors: errors.map((item) => item.id),
    };
  });
}

export function runEvalSuite(): Suite {
  const samples = runSampleSuite();
  const scenarios = runScenarioSuite().results;
  return {
    passed: samples.every((item) => item.ok) && scenarios.every((item) => item.ok),
    samples,
    scenarios,
  };
}

export function scoreTicket(ticket: string) {
  const analysis = classifyTicket(ticket);
  const plan = buildPlan(analysis);
  const scenario = EVAL_SCENARIOS.find((item) => item.ticket === ticket);
  if (!scenario) {
    return {
      analysis,
      plan,
      gate: evaluatePlan(analysis, plan, ticket),
      score: null,
    };
  }
  return {
    analysis,
    plan,
    gate: evaluatePlan(analysis, plan, ticket),
    score: scoreScenario(scenario),
  };
}
