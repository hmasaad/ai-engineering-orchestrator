import { executePlan } from "./orchestrate";
import type { OrchestrationRun, TaskInput } from "./types";

export type SampleTicket = {
  id: string;
  label: string;
  expected: string;
  ticket: string;
  repository?: string;
  branch?: string;
};

export const LOGOUT_TICKET =
  "Users are getting logged out randomly after upgrading the app.";

export const GOOGLE_LOGIN_TICKET = "Add social login with Google";

export const UI_BUTTON_TICKET = "Change the primary button on the settings screen to navy.";

export const PRODUCTION_DEPLOY_TICKET = "Deploy the new checkout service to production.";

export const MIGRATION_TICKET =
  "Add a database migration that drops the unused users_legacy table.";

export const SAMPLE_TICKETS: SampleTicket[] = [
  {
    id: "google-login",
    label: "Google social login",
    expected: "Feature · High · authentication, backend, mobile, security",
    ticket: GOOGLE_LOGIN_TICKET,
    repository: "my-app",
    branch: "feature/google-login",
  },
  {
    id: "logout-auth",
    label: "Logout after upgrade",
    expected: "Bug · High · Authentication · security before fix · human gate",
    ticket: LOGOUT_TICKET,
  },
  {
    id: "booking-feature",
    label: "New booking reminder",
    expected: "Feature · Architect before code · tests and evals before PR",
    ticket:
      "Add a feature so customers can receive a reminder the day before their salon appointment.",
  },
  {
    id: "login-rate-limit",
    label: "Login rate limit",
    expected: "Security · review before patch · human approval",
    ticket:
      "Add a rate limit on the login endpoint to stop brute force password guesses.",
  },
  {
    id: "css-cleanup",
    label: "Unused CSS",
    expected: "Simple UI · Developer → Testing → PR Reviewer",
    ticket: "Please clean up unused CSS on the settings screen.",
  },
  {
    id: "ui-button",
    label: "Settings button color",
    expected: "Simple UI · Developer → Testing → PR Reviewer",
    ticket: UI_BUTTON_TICKET,
  },
  {
    id: "session-research",
    label: "How sessions work",
    expected: "Research only · no PR · no Developer Agent",
    ticket: "How does session refresh work in the mobile app?",
  },
  {
    id: "vague",
    label: "It's broken",
    expected: "Vague · clarify · do not ship",
    ticket: "It's broken",
  },
  {
    id: "checkout-outage",
    label: "Checkout outage",
    expected: "Incident · Critical · Payments · human approval",
    ticket: "P0: checkout is down and customers cannot pay. Production is failing charges.",
  },
  {
    id: "payment-debt",
    label: "Payment webhook debt",
    expected: "Tech debt in Payments · security + human because of the area",
    ticket:
      "Pay down technical debt in the payment webhook handler. It is not idempotent and retries double-charge merchants.",
  },
  {
    id: "prod-deploy",
    label: "Production deploy",
    expected: "Plan approval → implement → ship approval → PR",
    ticket: PRODUCTION_DEPLOY_TICKET,
  },
  {
    id: "db-migration",
    label: "Drop unused table",
    expected: "Destructive migration · two human gates",
    ticket: MIGRATION_TICKET,
  },
];

export function sampleById(id: string) {
  return SAMPLE_TICKETS.find((item) => item.id === id);
}

export function sampleToInput(sample: SampleTicket): TaskInput {
  return {
    task: sample.ticket,
    repository: sample.repository,
    branch: sample.branch,
  };
}

export function runSample(id: string): OrchestrationRun {
  const sample = sampleById(id);
  if (!sample) throw new Error(`Unknown sample: ${id}`);
  const run = executePlan(sampleToInput(sample));
  run.id = `sample-${id}`;
  return run;
}
