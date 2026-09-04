import { classifyTicket } from "../classify";
import { buildPlan } from "../plan";
import { hasAgent, comesBefore } from "../plan";
import { LOGOUT_TICKET, SAMPLE_TICKETS } from "../samples";
import type { TaskType } from "../types";
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
  headline: RubricId[];
  assertions: ScenarioAssertion[];
};

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
    test: ({ analysis }) => analysis.area === area,
    passDetail: `Area is ${area}.`,
    failDetail: `Expected area ${area}.`,
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
        label: "Security Review before Generate Fix",
        test: ({ plan }) => comesBefore(plan, "security", "implement"),
        passDetail: "Security sits in front of the patch.",
        failDetail: "A fix was planned before Security Review.",
      },
      {
        id: "bug-before-fix",
        dimension: "order",
        label: "Bug Agent before Generate Fix",
        test: ({ plan }) => comesBefore(plan, "bug", "implement"),
        passDetail: "Investigation precedes the patch.",
        failDetail: "Generate Fix ran without Bug Investigation first.",
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
      needs("research", "architect", "implement", "tests", "evals", "pr"),
      {
        id: "architect-before-fix",
        dimension: "order",
        label: "Architect before Generate Fix",
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
        label: "Security before Generate Fix",
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
      omits("security", "architect", "approval"),
      {
        id: "not-auth",
        dimension: "routing",
        label: "Not authentication",
        test: ({ analysis }) => analysis.area !== "Authentication",
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
];

export function scenarioById(id: string) {
  return EVAL_SCENARIOS.find((item) => item.id === id);
}

export function matchScenario(ticket: string) {
  const hay = ticket.toLowerCase();
  return EVAL_SCENARIOS.find((item) => hay.includes(item.ticket.toLowerCase().slice(0, 24)));
}

export function contextFor(ticket: string) {
  const analysis = classifyTicket(ticket);
  const plan = buildPlan(analysis);
  return { ticket, analysis, plan, hay: ticket.toLowerCase() };
}

export function includesLogoutLanguage(ticket: string) {
  return includesAny(ticket, ["logged out", "logout", "session"]);
}
