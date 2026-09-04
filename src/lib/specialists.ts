import { evaluatePlan } from "./quality";
import { AGENTS } from "./roster";
import type { AgentId, Artifact, OrchestrationRun, PlanStep } from "./types";

type Ctx = {
  ticket: string;
  run: Pick<OrchestrationRun, "analysis" | "plan" | "artifacts">;
  step: PlanStep;
};

function section(heading: string, bullets: string[]) {
  return { heading, bullets };
}

function prior(ctx: Ctx, agent: AgentId) {
  return ctx.run.artifacts.find((item) => item.agent === agent);
}

function authBug(ctx: Ctx) {
  return ctx.run.analysis.area === "Authentication" && ctx.run.analysis.taskType === "bug";
}

function bugArtifact(ctx: Ctx): Artifact {
  if (authBug(ctx)) {
    return {
      agent: "bug",
      title: "Session drop after upgrade",
      summary:
        "Users are being signed out after an app upgrade. Treat this as a session-lifecycle bug, not a UI glitch.",
      sections: [
        section("Symptoms", [
          "Logout is intermittent and clustered after upgrading the client.",
          "No consistent crash. The next cold start often requires a full login.",
          "Reports mention 'randomly', which usually means a race on resume or token refresh.",
        ]),
        section("Ranked hypotheses", [
          "H1 — Refresh-token rotation: new client rejects the old refresh cookie after the upgrade.",
          "H2 — Resume race: token refresh and app-state restore both write session, last write wins empty.",
          "H3 — Clock / expiry skew: upgraded binary uses a stricter JWT leeway.",
          "H4 — Multi-device: upgrade on one device revokes the family and signs the others out.",
        ]),
        section("Out of scope until proven", [
          "Do not reset all sessions as a 'fix' before Security Review.",
          "Do not blame 'the user's network' without a repro on a clean upgrade path.",
        ]),
      ],
      findings: [
        {
          severity: "blocker",
          title: "Auth session is in play",
          detail: "Any patch that touches tokens needs Security Review before Generate Fix.",
        },
      ],
      recommendation: "Send Code Research at token storage, refresh, and upgrade migration next.",
    };
  }

  return {
    agent: "bug",
    title: `${ctx.run.analysis.area} failure`,
    summary: `Symptoms read as a ${ctx.run.analysis.taskType} in ${ctx.run.analysis.area}. Rank hypotheses before a patch.`,
    sections: [
      section("Symptoms", [ctx.ticket.trim()]),
      section("Hypotheses", [
        "Regression in the last change that touched this area.",
        "State restored in the wrong order after a lifecycle event.",
        "Contract mismatch between client and API.",
      ]),
    ],
    findings: [],
    recommendation: "Research the suspected modules before locking a root cause.",
  };
}

function researchArtifact(ctx: Ctx): Artifact {
  if (ctx.run.analysis.vague) {
    return {
      agent: "research",
      title: "Ticket is underspecified",
      summary: "There is not enough signal to pick a ship plan. These are the questions to answer first.",
      sections: [
        section(
          "Ask the reporter",
          ctx.run.analysis.missing.map((item) => `${item.question} (${item.whyItMatters})`),
        ),
        section("Do not do", [
          "Do not generate a fix.",
          "Do not open a PR.",
          "Do not fan the ticket out to every specialist.",
        ]),
      ],
      findings: [
        {
          severity: "blocker",
          title: "Missing task type",
          detail: "The orchestrator stopped instead of inventing work.",
        },
      ],
      recommendation: "Human approval decides whether this is a bug, a feature, or a question.",
    };
  }

  if (ctx.run.analysis.taskType === "research") {
    return {
      agent: "research",
      title: `How ${ctx.run.analysis.area} works`,
      summary: "This ticket is a question. Answer it. Do not quietly turn it into a patch.",
      sections: [
        section("Read first", [
          `${ctx.run.analysis.area} session or domain module.`,
          "Call path from UI action to persistence.",
          "Tests that name the behavior in the ticket.",
        ]),
        section("Report shape", [
          "What the current code does.",
          "Where the behavior lives.",
          "What would have to change if someone later asks for a fix.",
        ]),
      ],
      findings: [],
      recommendation: "Stop after the report unless a human files a change ticket.",
    };
  }

  if (authBug(ctx)) {
    return {
      agent: "research",
      title: "Auth and upgrade paths",
      summary: "Evidence should come from session storage, refresh rotation, and the upgrade migration — not from a model guess.",
      sections: [
        section("Places to read", [
          "Token / session store (secure storage vs cookies vs memory).",
          "Refresh rotation and reuse detection.",
          "App upgrade / migration hooks that rewrite stored credentials.",
          "Resume / connectivity listeners that trigger silent re-auth.",
        ]),
        section("Evidence to collect", [
          "A failing upgrade repro: vN logged in → install vN+1 → cold start.",
          "Whether refresh tokens are rotated, revoked, or format-shifted.",
          "Logs around 401 handling: does a 401 clear the session before retry?",
        ]),
      ],
      findings: [],
      recommendation: "Hand the file list and repro to Root Cause Analysis.",
    };
  }

  return {
    agent: "research",
    title: `${ctx.run.analysis.area} evidence`,
    summary: `Gather the ${ctx.run.analysis.area} modules and contracts this ticket depends on.`,
    sections: [
      section("Search", [
        `Modules named after ${ctx.run.analysis.area}.`,
        "Recent diffs that touch the same area.",
        "Tests that describe the expected behavior.",
      ]),
    ],
    findings: [],
    recommendation: "Pass evidence forward. Do not skip to Generate Fix.",
  };
}

function rcaArtifact(ctx: Ctx): Artifact {
  if (authBug(ctx)) {
    return {
      agent: "rca",
      title: "Upgrade invalidates the refresh token family",
      summary:
        "Most likely cause: the upgraded client writes a new token format and treats the previous refresh token as reuse, which revokes the session family.",
      sections: [
        section("Locked cause", [
          "Upgrade path migrates storage without a one-time accept of the prior refresh token.",
          "Reuse detection then looks like theft, so the server revokes the family.",
          "The user sees a 'random' logout because it only happens on first launch after update.",
        ]),
        section("Contributing factors", [
          "401 handler clears local session before a single retry.",
          "No telemetry distinguishing 'revoked family' from 'expired access token'.",
        ]),
        section("Blast radius", [
          "Every logged-in user who upgrades.",
          "Multi-device users may be signed out everywhere if the family is shared.",
        ]),
      ],
      findings: [
        {
          severity: "blocker",
          title: "Do not disable reuse detection",
          detail: "Turning off refresh reuse checks would 'fix' logout by weakening session theft protection.",
        },
      ],
      recommendation: "Security Review must bless the migration strategy before a patch is generated.",
    };
  }

  const bug = prior(ctx, "bug");
  return {
    agent: "rca",
    title: `Root cause in ${ctx.run.analysis.area}`,
    summary: bug?.summary ?? "Cause locked from the evidence the research step collected.",
    sections: [
      section("Cause", [
        "The last change in this area violated an existing contract.",
        "Failure appears when a lifecycle event hits the new code path.",
      ]),
    ],
    findings: [],
    recommendation: "If security is next, wait. If not, Generate Fix against this cause only.",
  };
}

function architectArtifact(ctx: Ctx): Artifact {
  return {
    agent: "architect",
    title: `${ctx.run.analysis.area} change shape`,
    summary: "Design the smallest change that fits the existing system. Do not start with a rewrite.",
    sections: [
      section("Boundaries", [
        `Keep ${ctx.run.analysis.area} ownership in the module that already owns it.`,
        "Do not introduce a new service for a local contract fix.",
      ]),
      section("Data", [
        "Say what is stored, what is derived, and what must stay backward compatible.",
      ]),
    ],
    findings: [],
    recommendation: "Implementation follows this shape. Security still reviews auth and payment edges.",
  };
}

function debtArtifact(ctx: Ctx): Artifact {
  return {
    agent: "tech_debt",
    title: `Debt in ${ctx.run.analysis.area}`,
    summary:
      ctx.run.analysis.risk === "low"
        ? "This looks like contained cleanup. Do not drag Security and Architect into a CSS ticket."
        : "Name the debt this change would hide.",
    sections: [
      section("Now vs later", [
        ctx.run.analysis.risk === "low"
          ? "Pay the local cleanup. Do not expand scope."
          : "If the upgrade path is already brittle, pay the migration debt in the same PR.",
      ]),
    ],
    findings: [],
    recommendation: "Keep the plan proportional to the ticket.",
  };
}

function securityArtifact(ctx: Ctx): Artifact {
  if (authBug(ctx)) {
    return {
      agent: "security",
      title: "Session migration without weakening reuse checks",
      summary: "The fix must migrate old refresh tokens once, not disable reuse detection or log tokens.",
      sections: [
        section("Threats", [
          "Stolen refresh token replay — reuse detection stays on.",
          "Session fixation across upgrade — new family after a successful one-time migrate.",
          "Token leakage in logs or crash reports during the migration window.",
        ]),
        section("Required controls", [
          "One-time accept of the previous token format, then rotate.",
          "Do not persist tokens in plaintext logs.",
          "Do not skip logout-on-revoke for actual reuse.",
        ]),
      ],
      findings: [
        {
          severity: "blocker",
          title: "No 'just catch 401 and ignore'",
          detail: "Swallowing 401s would hide theft and leave stale sessions on device.",
        },
      ],
      recommendation: "Generate Fix may proceed only with a migration, not a bypass.",
    };
  }

  return {
    agent: "security",
    title: `${ctx.run.analysis.area} threat review`,
    summary: "Review the change for abuse cases before a patch is written.",
    sections: [
      section("Look at", [
        "Authn/authz on the new path.",
        "Injection, secrets, and sensitive logs.",
        "Whether failure modes fail closed.",
      ]),
    ],
    findings: [],
    recommendation: "Block Generate Fix if a control would be removed to make the bug disappear.",
  };
}

function implementArtifact(ctx: Ctx): Artifact {
  const rca = prior(ctx, "rca");
  if (authBug(ctx)) {
    return {
      agent: "implement",
      title: "One-time refresh-token migration",
      summary:
        "Accept the previous refresh token once on first launch after upgrade, rotate to the new family, keep reuse detection on.",
      sections: [
        section("Change", [
          "Migration hook: if stored token is v1 and server returns reuse_detected on v2 parse, retry once with a migrate endpoint.",
          "On success, store v2 and drop v1.",
          "401 handler: retry refresh once before clearing the session.",
        ]),
        section("Not in this patch", [
          "Do not turn off family revoke.",
          "Do not force every user to re-login 'to be safe'.",
        ]),
      ],
      findings: [],
      recommendation: rca?.recommendation ?? "Generate tests for upgrade and for actual reuse.",
    };
  }

  return {
    agent: "implement",
    title: `Scoped ${ctx.run.analysis.area} change`,
    summary: "A patch against the locked cause, not a rewrite.",
    sections: [
      section("Change", [
        ctx.ticket.trim(),
        "Keep the diff inside the owning module.",
      ]),
    ],
    findings: [],
    recommendation: "Tests must reproduce the original failure.",
  };
}

function testsArtifact(ctx: Ctx): Artifact {
  if (authBug(ctx)) {
    return {
      agent: "tests",
      title: "Upgrade session regressions",
      summary: "Cover the upgrade migrate path and the real theft path so one test cannot green both.",
      sections: [
        section("Must pass", [
          "v1 session survives upgrade to v2 via one-time migrate, user stays logged in.",
          "A replayed refresh token after rotation is rejected and the family is revoked.",
          "A single 401 on expired access token retries refresh and does not clear storage.",
        ]),
        section("Must fail if the bad fix lands", [
          "If reuse detection is disabled, the theft test fails the gate.",
        ]),
      ],
      findings: [],
      recommendation: "Evals should refuse a plan that skipped these cases.",
    };
  }

  return {
    agent: "tests",
    title: `${ctx.run.analysis.area} regressions`,
    summary: "Reproduce the ticket, then assert the fix.",
    sections: [
      section("Cases", [
        "Happy path for the reported behavior.",
        "The failure mode in the ticket.",
        "One abuse / edge case if Security ran.",
      ]),
    ],
    findings: [],
    recommendation: "Quality gate next.",
  };
}

function evalsArtifact(ctx: Ctx): Artifact {
  const quality = evaluatePlan(ctx.run.analysis, ctx.run.plan, ctx.ticket);
  return {
    agent: "evals",
    title: quality.ready ? "Quality gate passed" : "Quality gate failed",
    summary: quality.ready
      ? `Score ${quality.score}. The plan did not skip required specialists or invert order.`
      : `Score ${quality.score}. Do not open a PR until the errors are fixed.`,
    sections: [
      section(
        "Checks",
        quality.checks.map((check) => `${check.pass ? "pass" : check.severity}: ${check.label} — ${check.detail}`),
      ),
    ],
    findings: quality.checks
      .filter((check) => !check.pass && check.severity === "error")
      .map((check) => ({
        severity: "blocker" as const,
        title: check.label,
        detail: check.detail,
      })),
    recommendation: quality.ready
      ? "Create PR, then PR Reviewer, then a human if the plan says so."
      : "Stop. Do not create a PR.",
  };
}

function prArtifact(ctx: Ctx): Artifact {
  const title = authBug(ctx)
    ? "fix(auth): migrate refresh tokens across app upgrade"
    : `${ctx.run.analysis.taskType}: ${ctx.run.analysis.area.toLowerCase()} change`;
  return {
    agent: "pr",
    title,
    summary: "PR is drafted after evals. It is not merged.",
    sections: [
      section("Body", [
        ctx.ticket.trim(),
        `Risk: ${ctx.run.analysis.risk}. Area: ${ctx.run.analysis.area}.`,
        ctx.run.plan.humanApprovalRequired
          ? "Do not merge without human approval."
          : "Evals passed. Reviewer still runs.",
      ]),
    ],
    findings: [],
    recommendation: "PR Reviewer next.",
  };
}

function reviewArtifact(ctx: Ctx): Artifact {
  return {
    agent: "pr_review",
    title: "Review of the proposed PR",
    summary: "The orchestrator does not approve its own PR. A reviewer agent looks at evidence.",
    sections: [
      section("Lenses", [
        ctx.run.analysis.area === "Authentication" ? "Auth session and token handling." : `Focus on ${ctx.run.analysis.area}.`,
        "Tests cover the reported failure.",
        "No secrets in the diff.",
      ]),
    ],
    findings: authBug(ctx)
      ? [
          {
            severity: "should_fix",
            title: "Call out the migrate window in the PR body",
            detail: "Reviewers need to see that reuse detection stays on.",
          },
        ]
      : [],
    recommendation: ctx.run.plan.humanApprovalRequired
      ? "Stop for Human Approval."
      : "Ready for a person to merge if policy allows.",
  };
}

function approvalArtifact(ctx: Ctx): Artifact {
  return {
    agent: "approval",
    title: "Waiting for a human",
    summary: ctx.run.plan.approvalReason,
    sections: [
      section("What to check", [
        ctx.run.analysis.vague
          ? "Is this even a change request?"
          : "Does the locked cause match production?",
        "Did Security Review run before Generate Fix?",
        "Did Evals pass before Create PR?",
      ]),
      section("Orchestrator will not", ["Merge.", "Deploy.", "Bypass this gate because a model is confident."]),
    ],
    findings: [],
    recommendation: "Approve to mark the run complete, or reject with a note.",
  };
}

const BUILDERS: Record<AgentId, (ctx: Ctx) => Artifact> = {
  bug: bugArtifact,
  research: researchArtifact,
  rca: rcaArtifact,
  architect: architectArtifact,
  tech_debt: debtArtifact,
  security: securityArtifact,
  implement: implementArtifact,
  tests: testsArtifact,
  evals: evalsArtifact,
  pr: prArtifact,
  pr_review: reviewArtifact,
  approval: approvalArtifact,
};

export function runSpecialist(ctx: Ctx): Artifact {
  const builder = BUILDERS[ctx.step.agent];
  const artifact = builder(ctx);
  if (!artifact.title) artifact.title = AGENTS[ctx.step.agent].label;
  return artifact;
}
