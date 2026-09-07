import { classifyTicket, understandTask } from "../classify";
import { buildPlan } from "../plan";
import { evaluatePlan, evaluateRun } from "../quality";
import { executePlan } from "../orchestrate";
import { SAMPLE_TICKETS, sampleToInput } from "../samples";
import { attacksFor, planFromAgents } from "./attacks";
import { aggregateMetrics, observeGold, type GoldObservation, type SuiteMetrics } from "./metrics";
import { EVAL_SCENARIOS, type EvalScenario } from "./scenarios";
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
  metrics: SuiteMetrics;
};

function goldCase(scenario: EvalScenario): { result: CaseResult; observation: GoldObservation } {
  const started = performance.now();
  const run = executePlan({
    task: scenario.ticket,
    repository: scenario.repository,
    branch: scenario.branch,
  });
  const latencyMs = performance.now() - started;
  const ctx = {
    ticket: scenario.ticket,
    analysis: run.analysis,
    plan: run.plan,
    state: run.state,
    hay: scenario.ticket.toLowerCase(),
  };
  const score = scoreAssertions(scenario.id, scenario.assertions, ctx);
  const gate = evaluateRun(run);
  const failed = score.assertions.filter((item) => !item.pass);
  const ok = failed.length === 0 && score.score >= GOLD_MIN && gate.errorCount === 0;
  const result: CaseResult = {
    kind: "gold",
    ok,
    score,
    gate,
  };
  return {
    result,
    observation: observeGold({
      scenario,
      analysis: run.analysis,
      plan: run.plan,
      score,
      gate,
      ok,
      latencyMs,
    }),
  };
}

function attackCases(scenario: EvalScenario): CaseResult[] {
  const analysis = understandTask({
    task: scenario.ticket,
    repository: scenario.repository,
    branch: scenario.branch,
  });
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

export function scoreScenario(scenario: EvalScenario): ScenarioResult & { observation: GoldObservation } {
  const gold = goldCase(scenario);
  const attacks = attackCases(scenario);
  return {
    id: scenario.id,
    label: scenario.label,
    expected: scenario.expected,
    ticket: scenario.ticket,
    headline: scenario.headline,
    gold: gold.result,
    attacks,
    ok: gold.result.ok && attacks.every((item) => item.ok),
    observation: gold.observation,
  };
}

export function runScenarioSuite() {
  const scored = EVAL_SCENARIOS.map(scoreScenario);
  return {
    passed: scored.every((item) => item.ok),
    results: scored.map(({ observation: _observation, ...result }) => result),
    observations: scored.map((item) => item.observation),
  };
}

export function runSampleSuite() {
  return SAMPLE_TICKETS.map((sample) => {
    const run = executePlan(sampleToInput(sample));
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
  const { results: scenarios, observations } = runScenarioSuite();
  return {
    passed: samples.every((item) => item.ok) && scenarios.every((item) => item.ok),
    samples,
    scenarios,
    metrics: aggregateMetrics(observations, samples),
  };
}

export function scoreTicket(ticket: string) {
  const scenario = EVAL_SCENARIOS.find((item) => item.ticket === ticket);
  const analysis = scenario
    ? understandTask({
        task: scenario.ticket,
        repository: scenario.repository,
        branch: scenario.branch,
      })
    : classifyTicket(ticket);
  const plan = buildPlan(analysis);
  if (!scenario) {
    return {
      analysis,
      plan,
      gate: evaluatePlan(analysis, plan, ticket),
      score: null,
    };
  }
  const scored = scoreScenario(scenario);
  const { observation: _observation, ...result } = scored;
  return {
    analysis,
    plan,
    gate: evaluatePlan(analysis, plan, ticket),
    score: result,
  };
}
