import { executePlan } from "./orchestrate";
import type { OrchestrationRun } from "./types";

export type SampleTicket = {
  id: string;
  label: string;
  expected: string;
  ticket: string;
};

export const LOGOUT_TICKET =
  "Users are getting logged out randomly after upgrading the app.";

export const SAMPLE_TICKETS: SampleTicket[] = [
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
    expected: "Low-risk cleanup · do not dispatch Architect + Security + Human",
    ticket: "Please clean up unused CSS on the settings screen.",
  },
  {
    id: "session-research",
    label: "How sessions work",
    expected: "Research only · no PR · no Generate Fix",
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
];

export function sampleById(id: string) {
  return SAMPLE_TICKETS.find((item) => item.id === id);
}

export function runSample(id: string): OrchestrationRun {
  const sample = sampleById(id);
  if (!sample) throw new Error(`Unknown sample: ${id}`);
  const run = executePlan(sample.ticket);
  run.id = `sample-${id}`;
  return run;
}
