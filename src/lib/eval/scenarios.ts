import { classifyTicket, hasArea, understandTask } from "../classify";
import { buildPlan } from "../plan";
import { hasAgent, comesBefore, hasGate, gateBefore } from "../plan";
import { GOOGLE_LOGIN_TICKET, LOGOUT_TICKET, MIGRATION_TICKET, PRODUCTION_DEPLOY_TICKET, SAMPLE_TICKETS, UI_BUTTON_TICKET } from "../samples";
import { isFilled } from "../state";
import type { AreaId, PublicAgentName, RoutePattern, SharedAgentState, TaskType } from "../types";
import {
  includesAny,
  type RubricId,
  type ScenarioAssertion,
} from "./rubric";

export type EvalScenario = {
  id: string;
  label: string;
  expected: string;
  ticket: string;
  repository?: string;
  branch?: string;
  headline: RubricId[];
  assertions: ScenarioAssertion[];
};

function patternIs(expected: RoutePattern): ScenarioAssertion {
  return {
    id: `pattern-${expected}`,
    dimension: "routing",
    label: `Router pattern is ${expected}`,
    test: ({ analysis }) => analysis.route.pattern === expected,
    passDetail: `Routed as ${expected}.`,
    failDetail: `Expected router pattern ${expected}.`,
  };
}

function routeIs(...names: PublicAgentName[]): ScenarioAssertion {
  return {
    id: `route-${names.join("-")}`,
    dimension: "specialists",
    label: `Router agents are ${names.join(" → ")}`,
    test: ({ analysis }) => analysis.route.routing.agents.join(",") === names.join(","),
    passDetail: `Router selected ${names.join(" → ")}.`,
    failDetail: `Expected ${names.join(" → ")}.`,
  };
}

function hasControlGate(id: Parameters<typeof hasGate>[1]): ScenarioAssertion {
  return {
    id: `gate-${id}`,
    dimension: "approval",
    label: `Has ${id} approval gate`,
    test: ({ plan }) => hasGate(plan, id),
    passDetail: `${id} gate is in the plan.`,
    failDetail: `Missing ${id} approval gate.`,
  };
}

function omitsControlGate(id: Parameters<typeof hasGate>[1]): ScenarioAssertion {
  return {
    id: `no-gate-${id}`,
    dimension: "proportion",
    label: `Omits ${id} approval gate`,
    test: ({ plan }) => !hasGate(plan, id),
    passDetail: `Correctly omits ${id} gate.`,
    failDetail: `Unexpected ${id} gate.`,
  };
}

function stateHas(test: (state: SharedAgentState) => boolean, label: string, fail: string): ScenarioAssertion {
  return {
    id: `state-${label.toLowerCase().replace(/\W+/g, "-")}`,
    dimension: "specialists",
    label,
    test: ({ state }) => Boolean(state) && test(state!),
    passDetail: label,
    failDetail: fail,
  };
}

function typeIs(expected: TaskType): ScenarioAssertion {
  return {
    id: `type-${expected}`,
    dimension: "routing",
    label: `Task type is ${expected}`,
    test: ({ analysis }) => analysis.taskType === expected,
    passDetail: `Classified as ${expected}.`,
    failDetail: `Expected ${expected}.`,
  };
}

function riskIs(...allowed: string[]): ScenarioAssertion {
  return {
    id: `risk-${allowed.join("-")}`,
    dimension: "routing",
    label: `Risk is ${allowed.join(" or ")}`,
    test: ({ analysis }) => allowed.includes(analysis.risk),
    passDetail: `Risk is ${allowed.join(" or ")}.`,
    failDetail: `Risk was not ${allowed.join(" or ")}.`,
  };
}

function areaIs(area: string): ScenarioAssertion {
  return {
    id: `area-${area.toLowerCase().replace(/\W+/g, "-")}`,
    dimension: "routing",
    label: `Area is ${area}`,
    test: ({ analysis }) => analysis.area === area || analysis.areas.includes(area.toLowerCase() as AreaId),
    passDetail: `Area is ${area}.`,
    failDetail: `Expected area ${area}.`,
  };
}

function areasInclude(...ids: AreaId[]): ScenarioAssertion {
  return {
    id: `areas-${ids.join("-")}`,
    dimension: "routing",
    label: `Areas include ${ids.join(", ")}`,
    test: ({ analysis }) => ids.every((id) => hasArea(analysis, id)),
    passDetail: `Areas include ${ids.join(", ")}.`,
    failDetail: `Expected areas ${ids.join(", ")}.`,
  };
}

function needs(...agents: Parameters<typeof hasAgent>[1][]): ScenarioAssertion {
  const id = agents.join("-");
  return {
    id: `has-${id}`,
    dimension: "specialists",
    label: `Plan includes ${id.replace(/_/g, " ")}`,
    test: ({ plan }) => agents.every((agent) => hasAgent(plan, agent)),
    passDetail: `Plan includes ${id}.`,
    failDetail: `Plan is missing ${id}.`,
  };
}

function omits(...agents: Parameters<typeof hasAgent>[1][]): ScenarioAssertion {
  const id = agents.join("-");
  return {
    id: `omits-${id}`,
    dimension: "proportion",
    label: `Plan omits ${id.replace(/_/g, " ")}`,
    test: ({ plan }) => agents.every((agent) => !hasAgent(plan, agent)),
    passDetail: `Plan correctly omits ${id}.`,
    failDetail: `Plan incorrectly includes ${id}.`,
  };
}

const SHARED_SHIP: ScenarioAssertion[] = [
  {
    id: "evals-before-pr",
    dimension: "order",
    label: "Evals before Create PR",
    test: ({ plan }) => !hasAgent(plan, "pr") || comesBefore(plan, "evals", "pr"),
    passDetail: "Quality gate sits in front of the PR.",
    failDetail: "PR was scheduled before evals.",
  },
  {
    id: "not-oneshot",
    dimension: "oneshot",
    label: "More than one specialist",
    test: ({ plan, analysis }) => plan.steps.length > 1 || analysis.taskType === "research",
    passDetail: "Not a one-shot solve.",
    failDetail: "Collapsed to a single step.",
  },
];

export const EVAL_SCENARIOS: EvalScenario[] = [
  {
    id: "google-login",
    label: "Google social login",
    expected: "Feature, high risk, authentication + backend + mobile + security",
    ticket: GOOGLE_LOGIN_TICKET,
    repository: "my-app",
    branch: "feature/google-login",
    headline: ["routing", "specialists", "approval"],
    assertions: [
      typeIs("feature"),
      riskIs("high", "critical"),
      areasInclude("authentication", "backend", "mobile", "security"),
      patternIs("feature"),
      routeIs("requirements", "architect", "security", "developer", "testing", "pr_reviewer"),
      needs("requirements", "architect", "security", "implement", "evals", "approval"),
      hasControlGate("plan"),
      hasControlGate("ship"),
      {
        id: "plan-before-dev",
        dimension: "order",
        label: "Plan approval before Developer",
        test: ({ plan }) => gateBefore(plan, "plan", "implement"),
        passDetail: "A person signs the plan before Implementation.",
        failDetail: "Developer was scheduled without plan approval.",
      },
      {
        id: "ship-before-pr",
        dimension: "order",
        label: "Ship approval before Create PR",
        test: ({ plan }) => gateBefore(plan, "ship", "pr"),
        passDetail: "A person signs before the PR.",
        failDetail: "Create PR was scheduled without ship approval.",
      },
      stateHas(
        (state) =>
          isFilled(state.requirements) &&
          isFilled(state.architecture) &&
          state.security_findings.length > 0 &&
          state.files_changed.length > 0 &&
          state.tests.length > 0 &&
          isFilled(state.review) &&
          (state.status === "complete" || state.status === "awaiting_approval"),
        "Agents share one blackboard",
        "Requirements, architecture, findings, files, tests, and review never landed in shared state.",
      ),
      {
        id: "not-a-bug",
        dimension: "routing",
        label: "Not classified as a bug",
        test: ({ analysis }) => analysis.taskType !== "bug",
        passDetail: "A new identity capability was not treated as a bug.",
        failDetail: "Social login was routed as a bug.",
      },
      ...SHARED_SHIP,
    ],
  },
  {
    id: "logout-auth",
    label: "Logout after upgrade",
    expected: "Bug investigation, high risk, authentication, security before fix, human approval",
    ticket: LOGOUT_TICKET,
    headline: ["routing", "specialists", "order", "approval"],
    assertions: [
      typeIs("bug"),
      riskIs("high", "critical"),
      areaIs("Authentication"),
      needs("bug", "research", "rca", "security", "implement", "tests", "evals", "pr", "pr_review", "approval"),
      {
        id: "security-before-fix",
        dimension: "order",
        label: "Security Review before Developer Agent",
        test: ({ plan }) => comesBefore(plan, "security", "implement"),
        passDetail: "Security sits in front of the patch.",
        failDetail: "A fix was planned before Security Review.",
      },
      {
        id: "bug-before-fix",
        dimension: "order",
        label: "Bug Agent before Developer Agent",
        test: ({ plan }) => comesBefore(plan, "bug", "implement"),
        passDetail: "Investigation precedes the patch.",
        failDetail: "Developer Agent ran without Bug Investigation first.",
      },
      {
        id: "human-gate",
        dimension: "approval",
        label: "Human approval required",
        test: ({ plan }) => hasAgent(plan, "approval") && plan.humanApprovalRequired,
        passDetail: "A person must sign off.",
        failDetail: "High-risk auth work has no human gate.",
      },
      ...SHARED_SHIP,
    ],
  },
  {
    id: "booking-feature",
    label: "New booking reminder",
    expected: "Feature · Architect before code",
    ticket: SAMPLE_TICKETS.find((item) => item.id === "booking-feature")!.ticket,
    headline: ["routing", "specialists"],
    assertions: [
      typeIs("feature"),
      areaIs("Booking"),
      patternIs("feature"),
      routeIs("requirements", "architect", "security", "developer", "testing", "pr_reviewer"),
      needs("requirements", "architect", "security", "implement", "tests", "evals", "pr"),
      {
        id: "architect-before-fix",
        dimension: "order",
        label: "Architect before Developer Agent",
        test: ({ plan }) => comesBefore(plan, "architect", "implement"),
        passDetail: "Design precedes code.",
        failDetail: "A feature was coded without the Architect Agent.",
      },
      {
        id: "not-a-bug",
        dimension: "routing",
        label: "Not classified as a bug",
        test: ({ analysis }) => analysis.taskType !== "bug",
        passDetail: "A new capability was not treated as a bug.",
        failDetail: "A feature ticket was routed as a bug.",
      },
      ...SHARED_SHIP,
    ],
  },
  {
    id: "login-rate-limit",
    label: "Login rate limit",
    expected: "Security · review before patch · human approval",
    ticket: SAMPLE_TICKETS.find((item) => item.id === "login-rate-limit")!.ticket,
    headline: ["routing", "order", "approval"],
    assertions: [
      typeIs("security"),
      areaIs("Authentication"),
      riskIs("high", "critical"),
      needs("security", "approval"),
      {
        id: "security-before-fix",
        dimension: "order",
        label: "Security before Developer Agent",
        test: ({ plan }) => comesBefore(plan, "security", "implement"),
        passDetail: "Threat model precedes the patch.",
        failDetail: "Rate limiting was patched before Security Review.",
      },
      ...SHARED_SHIP,
    ],
  },
  {
    id: "css-cleanup",
    label: "Unused CSS",
    expected: "Low-risk cleanup, not a full parade",
    ticket: SAMPLE_TICKETS.find((item) => item.id === "css-cleanup")!.ticket,
    headline: ["proportion", "routing"],
    assertions: [
      riskIs("low"),
      patternIs("ui"),
      routeIs("developer", "testing", "pr_reviewer"),
      needs("implement", "tests", "pr_review"),
      omits("security", "architect", "requirements"),
      omitsControlGate("plan"),
      hasControlGate("ship"),
      {
        id: "not-auth",
        dimension: "routing",
        label: "Not authentication",
        test: ({ analysis }) => !hasArea(analysis, "authentication"),
        passDetail: "CSS cleanup stayed in UI.",
        failDetail: "A CSS ticket was marked Authentication.",
      },
      {
        id: "still-has-evals-if-pr",
        dimension: "order",
        label: "If a PR exists, evals come first",
        test: ({ plan }) => !hasAgent(plan, "pr") || comesBefore(plan, "evals", "pr"),
        passDetail: "Even small PRs go through evals.",
        failDetail: "Cleanup PR skipped evals.",
      },
      ...SHARED_SHIP,
    ],
  },
  {
    id: "ui-button",
    label: "Settings button color",
    expected: "Simple UI · Developer → Testing → PR Reviewer",
    ticket: UI_BUTTON_TICKET,
    headline: ["proportion", "routing", "specialists"],
    assertions: [
      patternIs("ui"),
      routeIs("developer", "testing", "pr_reviewer"),
      needs("implement", "tests", "pr_review"),
      omits("requirements", "architect", "security"),
      omitsControlGate("plan"),
      hasControlGate("ship"),
      stateHas(
        (state) =>
          !isFilled(state.requirements) &&
          !isFilled(state.architecture) &&
          state.security_findings.length === 0 &&
          state.files_changed.length > 0 &&
          state.tests.length > 0 &&
          isFilled(state.review) &&
          state.status === "complete",
        "UI state skips unused slices",
        "A simple UI change wrote requirements/architecture/security, or never wrote files and tests.",
      ),
      {
        id: "not-feature-parade",
        dimension: "proportion",
        label: "Not the full feature pipeline",
        test: ({ analysis }) => analysis.route.pattern === "ui",
        passDetail: "UI work did not dispatch Requirements, Architect, and Security.",
        failDetail: "A button color change was given the feature parade.",
      },
      ...SHARED_SHIP,
    ],
  },
  {
    id: "session-research",
    label: "How sessions work",
    expected: "Research only, no ship plan",
    ticket: SAMPLE_TICKETS.find((item) => item.id === "session-research")!.ticket,
    headline: ["routing", "specialists", "proportion"],
    assertions: [
      typeIs("research"),
      areaIs("Authentication"),
      needs("research"),
      omits("implement", "pr", "bug"),
      {
        id: "no-human-required-for-a-question",
        dimension: "approval",
        label: "A question does not require a merge gate",
        test: ({ plan }) => !plan.humanApprovalRequired,
        passDetail: "Research stops after the report.",
        failDetail: "A question was given a merge approval gate.",
      },
      ...SHARED_SHIP,
    ],
  },
  {
    id: "vague",
    label: "It's broken",
    expected: "Clarify. Do not ship.",
    ticket: "It's broken",
    headline: ["routing", "proportion", "approval"],
    assertions: [
      {
        id: "marked-vague",
        dimension: "routing",
        label: "Ticket is marked vague",
        test: ({ analysis }) => analysis.vague,
        passDetail: "Underspecified ticket was flagged.",
        failDetail: "A one-liner was treated as a complete brief.",
      },
      omits("implement", "pr"),
      needs("research", "approval"),
      {
        id: "asks-questions",
        dimension: "specialists",
        label: "Missing questions are listed",
        test: ({ analysis }) => analysis.missing.length > 0,
        passDetail: "The orchestrator asked instead of inventing.",
        failDetail: "No clarifying questions were raised.",
      },
      ...SHARED_SHIP,
    ],
  },
  {
    id: "checkout-outage",
    label: "Checkout outage",
    expected: "Incident · Critical · Payments · human approval",
    ticket: SAMPLE_TICKETS.find((item) => item.id === "checkout-outage")!.ticket,
    headline: ["routing", "approval", "specialists"],
    assertions: [
      typeIs("incident"),
      riskIs("critical"),
      areaIs("Payments"),
      needs("bug", "rca", "security", "approval"),
      ...SHARED_SHIP,
    ],
  },
  {
    id: "payment-debt",
    label: "Payment webhook debt",
    expected: "Tech debt in Payments with security because of double-charge",
    ticket: SAMPLE_TICKETS.find((item) => item.id === "payment-debt")!.ticket,
    headline: ["routing", "specialists", "approval"],
    assertions: [
      {
        id: "debt-or-security",
        dimension: "routing",
        label: "Routed as tech debt or security",
        test: ({ analysis }) =>
          analysis.taskType === "tech_debt" || analysis.taskType === "security",
        passDetail: "Idempotency debt was not treated as a cosmetic cleanup.",
        failDetail: "Double-charge debt was mis-routed.",
      },
      areaIs("Payments"),
      needs("security", "approval"),
      {
        id: "not-low",
        dimension: "routing",
        label: "Risk is not low",
        test: ({ analysis }) => analysis.risk !== "low",
        passDetail: "Double-charge is not low risk.",
        failDetail: "Payment retries were marked low risk.",
      },
      ...SHARED_SHIP,
    ],
  },
  {
    id: "prod-deploy",
    label: "Production deploy",
    expected: "Production deploy · plan and ship approval",
    ticket: PRODUCTION_DEPLOY_TICKET,
    headline: ["approval", "order"],
    assertions: [
      {
        id: "kind-prod",
        dimension: "routing",
        label: "Control kind is production_deploy",
        test: ({ analysis }) => analysis.controlKinds.includes("production_deploy"),
        passDetail: "Flagged as a production deployment.",
        failDetail: "A production deploy was not gated as production_deploy.",
      },
      hasControlGate("plan"),
      hasControlGate("ship"),
      {
        id: "plan-before-dev",
        dimension: "order",
        label: "Plan approval before Developer",
        test: ({ plan }) => !hasAgent(plan, "implement") || gateBefore(plan, "plan", "implement"),
        passDetail: "Production deploys are not autonomous.",
        failDetail: "A production deploy had no plan gate before Implementation.",
      },
      ...SHARED_SHIP,
    ],
  },
  {
    id: "db-migration",
    label: "Drop unused table",
    expected: "Destructive migration · two human gates",
    ticket: MIGRATION_TICKET,
    headline: ["approval", "routing"],
    assertions: [
      {
        id: "kind-destructive",
        dimension: "routing",
        label: "Control kind is destructive or migration",
        test: ({ analysis }) =>
          analysis.controlKinds.includes("destructive") ||
          analysis.controlKinds.includes("database_migration"),
        passDetail: "Flagged as destructive or a migration.",
        failDetail: "Dropping a table was not treated as gated work.",
      },
      riskIs("high", "critical"),
      hasControlGate("plan"),
      hasControlGate("ship"),
      ...SHARED_SHIP,
    ],
  },
];

export function scenarioById(id: string) {
  return EVAL_SCENARIOS.find((item) => item.id === id);
}

export function matchScenario(ticket: string) {
  const hay = ticket.toLowerCase();
  return EVAL_SCENARIOS.find((item) => hay.includes(item.ticket.toLowerCase().slice(0, 24)));
}

export function contextFor(scenario: EvalScenario | string) {
  if (typeof scenario === "string") {
    const analysis = classifyTicket(scenario);
    const plan = buildPlan(analysis);
    return { ticket: scenario, analysis, plan, hay: scenario.toLowerCase() };
  }
  const analysis = understandTask({
    task: scenario.ticket,
    repository: scenario.repository,
    branch: scenario.branch,
  });
  const plan = buildPlan(analysis);
  return { ticket: scenario.ticket, analysis, plan, hay: scenario.ticket.toLowerCase() };
}

export function includesLogoutLanguage(ticket: string) {
  return includesAny(ticket, ["logged out", "logout", "session"]);
}
