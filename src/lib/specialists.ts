import { fulfillContract } from "./contract";
import { GUARDRAIL_CATALOG } from "./guardrails";
import { compactMerge } from "./merge";
import { compactGate, evaluateRun } from "./quality";
import { AGENTS } from "./roster";
import { hasArea } from "./classify";
import { buildConsensus, specialistDebate } from "./consensus";
import { isFilled, initSharedState } from "./state";
import { compilationLoopIssues, reviewRecovered, testRecovered } from "./recovery";
import { reviewLoopIssues } from "./verification";
import type { AgentId, Artifact, ArtifactSection, OrchestrationRun, PlanStep, SharedAgentState } from "./types";

type Ctx = {
  ticket: string;
  run: Pick<OrchestrationRun, "analysis" | "plan" | "artifacts" | "state" | "status" | "retries" | "verification" | "recovery">;
  step: PlanStep;
};

function stateOf(ctx: Ctx): SharedAgentState {
  return ctx.run.state ?? initSharedState(ctx.ticket);
}

function section(heading: string, bullets: string[]) {
  return { heading, bullets };
}

function fromPastRuns(ctx: Ctx): ArtifactSection | null {
  const learnings = stateOf(ctx).learnings;
  if (!learnings || !("hits" in learnings) || learnings.hits.length === 0) return null;
  return section(
    "From past runs",
    learnings.hits.map((hit) => {
      const lesson = hit.lessons[0] ? ` ${hit.lessons[0]}` : "";
      return `${hit.pattern} · ${hit.risk}: ${hit.ticket}.${lesson}`;
    }),
  );
}

function withLearnings(sections: ArtifactSection[], ctx: Ctx) {
  const past = fromPastRuns(ctx);
  return past ? [past, ...sections] : sections;
}

function prior(ctx: Ctx, agent: AgentId) {
  return ctx.run.artifacts.find((item) => item.agent === agent);
}

function authBug(ctx: Ctx) {
  return hasArea(ctx.run.analysis, "authentication") && ctx.run.analysis.taskType === "bug";
}

function identityFeature(ctx: Ctx) {
  return hasArea(ctx.run.analysis, "authentication") && ctx.run.analysis.taskType === "feature";
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
          detail: "Any patch that touches tokens needs Security Review before the Developer Agent.",
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
      sections: withLearnings(
        [
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
        ctx,
      ),
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
      sections: withLearnings(
        [
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
        ctx,
      ),
      findings: [],
      recommendation: "Stop after the report unless a human files a change ticket.",
    };
  }

  if (authBug(ctx)) {
    return {
      agent: "research",
      title: "Auth and upgrade paths",
      summary: "Evidence should come from session storage, refresh rotation, and the upgrade migration — not from a model guess.",
      sections: withLearnings(
        [
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
        ctx,
      ),
      findings: [],
      recommendation: "Hand the file list and repro to Root Cause Analysis.",
    };
  }

  return {
    agent: "research",
    title: `${ctx.run.analysis.area} evidence`,
    summary: `Gather the ${ctx.run.analysis.area} modules and contracts this ticket depends on.`,
    sections: withLearnings(
      [
        section("Search", [
          `Modules named after ${ctx.run.analysis.area}.`,
          "Recent diffs that touch the same area.",
          "Tests that describe the expected behavior.",
        ]),
      ],
      ctx,
    ),
    findings: [],
    recommendation: "Pass evidence forward. Do not skip to the Developer Agent.",
  };
}

function requirementsArtifact(ctx: Ctx): Artifact {
  if (identityFeature(ctx)) {
    return {
      agent: "requirements",
      title: "Google social login requirements",
      summary:
        "Users can sign in with Google without replacing the existing session model. Architect and Security still run before Developer.",
      sections: withLearnings(
        [
          section("In scope", [
            "Mobile client can start Google Sign-In and receive an app session.",
            "Backend verifies the Google token and links `sub` to the existing user.",
            "Existing email/password users can link Google later.",
          ]),
          section("Out of scope", [
            "A second user directory keyed only on Google email.",
            "Skipping Security Review because 'it is just OAuth'.",
          ]),
          section("Success", [
            "A new user can sign in with Google and stay signed in across an app restart.",
            "An existing user who links Google keeps the same account.",
          ]),
        ],
        ctx,
      ),
      findings: [],
      recommendation: "Hand requirements to the Architect Agent. Do not code yet.",
    };
  }

  return {
    agent: "requirements",
    title: `${ctx.run.analysis.area} requirements`,
    summary: "Lock what the feature must do before Architect or Developer start.",
    sections: withLearnings(
      [
        section("In scope", [ctx.ticket.trim()]),
        section("Constraints", [
          `Stay inside ${ctx.run.analysis.area}.`,
          "Do not expand into a rewrite.",
        ]),
      ],
      ctx,
    ),
    findings: [],
    recommendation: "Architect shapes the change against these requirements.",
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
    recommendation: "If security is next, wait. If not, the Developer Agent works against this cause only.",
  };
}

function architectArtifact(ctx: Ctx): Artifact {
  const debate = specialistDebate("architect", ctx.run.analysis);
  if (debate) {
    return {
      agent: "architect",
      title: debate.summary,
      summary:
        "Potential architectural benefits: one graph, fewer round-trips, typed clients. The existing REST modules already own the contracts. A rewrite is not required to get typed clients.",
      sections: withLearnings(
        [
          section("Opinion", [
            debate.summary,
            "Keep REST as the contract. Typed clients can be generated without a protocol rewrite.",
          ]),
          section("Boundaries", [
            "Do not stand up a parallel GraphQL runtime beside every REST handler.",
            "If a client needs aggregation, add a BFF in the existing module.",
          ]),
        ],
        ctx,
      ),
      findings: [],
      recommendation: "Mixed. Architecture is not a reason to migrate. Consensus still waits for Performance, Security, and Developer.",
    };
  }
  const requirements = stateOf(ctx).requirements;
  const fromRequirements = isFilled(requirements)
    ? section(
        "From shared state",
        "in_scope" in requirements
          ? requirements.in_scope.length > 0
            ? requirements.in_scope
            : [requirements.summary]
          : [JSON.stringify(requirements)],
      )
    : null;

  if (identityFeature(ctx)) {
    return {
      agent: "architect",
      title: "Google identity as an auth provider, not a new user system",
      summary:
        "Social login sits beside existing sessions. Keep identity in the auth module; the backend exchanges the Google token; the mobile client only hosts the SDK.",
      sections: withLearnings(
        [
          ...(fromRequirements ? [fromRequirements] : []),
          section("Boundaries", [
            "Mobile: Google Sign-In SDK, no tokens in logs, no custom WebView login.",
            "Backend: authorization-code or ID-token verify, then issue the app session.",
            "Do not create a parallel user table keyed only on Google email.",
          ]),
          section("Data", [
            "Link Google `sub` to the existing user record.",
            "Keep refresh/session tokens in the store you already trust.",
          ]),
        ],
        ctx,
      ),
      findings: [],
      recommendation: "Security Review must cover account linking and token storage before the Developer Agent.",
    };
  }

  return {
    agent: "architect",
    title: `${ctx.run.analysis.area} change shape`,
    summary: "Design the smallest change that fits the existing system. Do not start with a rewrite.",
    sections: withLearnings(
      [
        ...(fromRequirements ? [fromRequirements] : []),
        section("Boundaries", [
          `Keep ${ctx.run.analysis.area} ownership in the module that already owns it.`,
          "Do not introduce a new service for a local contract fix.",
        ]),
        section("Data", [
          "Say what is stored, what is derived, and what must stay backward compatible.",
        ]),
      ],
      ctx,
    ),
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
  const debate = specialistDebate("security", ctx.run.analysis);
  if (debate) {
    return {
      agent: "security",
      title: debate.summary,
      summary:
        "Additional attack surface: introspection, batched queries, nested depth, and a wider authz surface than the current resource URLs.",
      sections: withLearnings(
        [
          section("Threats", [
            "GraphQL introspection leaking the graph.",
            "Batched and nested queries as a cheap DoS.",
            "Field-level authz is easier to miss than REST resource URLs.",
          ]),
          section("Required controls", [
            "Do not add a new query language until REST has a named authz defect.",
            "Keep the existing resource URLs.",
          ]),
        ],
        ctx,
      ),
      findings: [
        {
          severity: "should_fix",
          title: "Additional attack surface",
          detail: "GraphQL expands parsing, depth, and authorization compared with REST.",
        },
      ],
      recommendation: "Against. Do not migrate for a cleaner schema. Consensus next.",
    };
  }
  const architecture = stateOf(ctx).architecture;
  const fromArchitecture = isFilled(architecture)
    ? section(
        "From shared state",
        "boundaries" in architecture
          ? architecture.boundaries
          : [architecture.summary ?? "Architecture is in shared state."],
      )
    : null;

  if (authBug(ctx)) {
    return {
      agent: "security",
      title: "Session migration without weakening reuse checks",
      summary: "The fix must migrate old refresh tokens once, not disable reuse detection or log tokens.",
      sections: withLearnings(
        [
          ...(fromArchitecture ? [fromArchitecture] : []),
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
        ctx,
      ),
      findings: [
        {
          severity: "blocker",
          title: "No 'just catch 401 and ignore'",
          detail: "Swallowing 401s would hide theft and leave stale sessions on device.",
        },
      ],
      recommendation: "The Developer Agent may proceed only with a migration, not a bypass.",
    };
  }

  if (identityFeature(ctx)) {
    return {
      agent: "security",
      title: "OAuth account linking without session theft",
      summary:
        "Google Sign-In is high risk: a bad link step can attach an attacker’s Google account to a victim, or leak ID tokens on device.",
      sections: withLearnings(
        [
          ...(fromArchitecture ? [fromArchitecture] : []),
          section("Threats", [
            "Account linking without proving control of the existing session.",
            "ID token accepted without verifying aud/iss/expiry.",
            "Access tokens written to crash logs or shared preferences.",
          ]),
          section("Required controls", [
            "Verify Google tokens on the backend, never trust the client.",
            "Link only when the user is already authenticated, or create a new user from `sub`.",
            "Keep reuse detection and secure storage for the app session you issue after Google.",
          ]),
        ],
        ctx,
      ),
      findings: [
        {
          severity: "blocker",
          title: "No client-only trust of Google",
          detail: "The mobile SDK is not the source of truth. The backend must verify the token.",
        },
      ],
      recommendation: "The Developer Agent may proceed only with server-side verification.",
    };
  }

  return {
    agent: "security",
    title: `${ctx.run.analysis.area} threat review`,
    summary: "Review the change for abuse cases before a patch is written.",
    sections: withLearnings(
      [
        ...(fromArchitecture ? [fromArchitecture] : []),
        section("Look at", [
          "Authn/authz on the new path.",
          "Injection, secrets, and sensitive logs.",
          "Whether failure modes fail closed.",
        ]),
      ],
      ctx,
    ),
    findings: [],
    recommendation: "Block the Developer Agent if a control would be removed to make the bug disappear.",
  };
}

function databaseArtifact(ctx: Ctx): Artifact {
  const destructive = ctx.run.analysis.controlKinds.includes("destructive");
  return {
    agent: "database",
    title: destructive ? "Destructive schema change" : `Additive schema in ${ctx.run.analysis.area}`,
    summary: destructive
      ? "Dropping a table is irreversible without a restore. Name the backup and the readers before Developer writes SQL."
      : "Additive column. Keep it nullable or backfilled so existing rows still load.",
    sections: withLearnings(
      [
        section("Schema", [
          ctx.ticket.trim(),
          destructive
            ? "Require a restore path. Do not drop until nothing reads the table."
            : "Type, nullability, default, and whether a backfill job is needed.",
        ]),
        section("Compatibility", [
          destructive
            ? "Find remaining queries, jobs, and models that still name the table."
            : "Existing rows must deserialize after the column lands.",
        ]),
      ],
      ctx,
    ),
    findings: destructive
      ? [
          {
            severity: "blocker",
            title: "No unreviewed DROP",
            detail: "The Testing Agent must cover a restore / dual-read window.",
          },
        ]
      : [],
    recommendation: "Developer writes the migration against these constraints. Result Merger still runs.",
  };
}

function performanceArtifact(ctx: Ctx): Artifact {
  const debate = specialistDebate("performance", ctx.run.analysis);
  if (debate) {
    return {
      agent: "performance",
      title: debate.summary,
      summary:
        "No measurable benefit. REST handlers are not the p95. GraphQL resolvers add N+1 risk and a new runtime without a measured win.",
      sections: withLearnings(
        [
          section("Bottleneck", [
            "No p95, payload size, or round-trip budget was given.",
            "GraphQL does not make an unmeasured REST API faster.",
          ]),
          section("Do not", [
            "Do not migrate protocols to chase an unmeasured win.",
            "Do not add a GraphQL dataloader layer as the first performance change.",
          ]),
        ],
        ctx,
      ),
      findings: [],
      recommendation: "Against. Measure REST first. Consensus still waits for Security and Developer.",
    };
  }
  return {
    agent: "performance",
    title: `Slow path in ${ctx.run.analysis.area}`,
    summary: "Find the cost before patching. A cache guessed in the Developer Agent is how you hide N+1.",
    sections: withLearnings(
      [
        section("Bottleneck", [
          ctx.ticket.trim(),
          "Measure p95 on the reported list or query, then name the hot loop.",
        ]),
        section("Do not", [
          "Do not add a cache as the first change.",
          "Do not skip pagination or virtualization if the list is the cost.",
        ]),
      ],
      ctx,
    ),
    findings: [],
    recommendation: "Developer patches the measured hot path. Tests must lock the p95 case.",
  };
}

function flutterTicket(ctx: Ctx) {
  return /flutter/i.test(ctx.ticket);
}

function implementArtifact(ctx: Ctx): Artifact {
  const debate = specialistDebate("implement", ctx.run.analysis);
  if (debate) {
    const shared = stateOf(ctx);
    const fromState = [
      isFilled(shared.architecture) && "summary" in shared.architecture
        ? `Architecture: ${shared.architecture.summary}`
        : null,
      isFilled(shared.performance) && "summary" in shared.performance
        ? `Performance: ${shared.performance.summary}`
        : null,
      ...shared.security_findings.map((item) => `Security (${item.severity}): ${item.title}`),
    ].filter((item): item is string => Boolean(item));
    return {
      agent: "implement",
      title: debate.summary,
      summary:
        "Migration cost estimated at 3–4 weeks: schema, resolvers, client generation, and dual-running REST. That is a platform rewrite, not a patch.",
      sections: withLearnings(
        [
          ...(fromState.length ? [section("From shared state", fromState)] : []),
          section("Cost", [
            debate.summary,
            "Schema, resolvers, client generation, and a dual-run of REST.",
            "This is an opinion, not a diff.",
          ]),
          section("Not a patch", [
            "Do not open a PR. Consensus Engine weighs this against the other specialists.",
          ]),
        ],
        ctx,
      ),
      findings: [],
      recommendation: "Against. Do not start the rewrite. Consensus Engine next.",
    };
  }
  const shared = stateOf(ctx);
  const findings = shared.security_findings;
  const architecture = shared.architecture;
  const database = shared.database;
  const performance = shared.performance;
  const fromState = [
    isFilled(architecture) && "summary" in architecture
      ? `Architecture: ${architecture.summary}`
      : null,
    isFilled(database) && "summary" in database ? `Database: ${database.summary}` : null,
    isFilled(performance) && "summary" in performance ? `Performance: ${performance.summary}` : null,
    ...findings.map((item) => `Security (${item.severity}): ${item.title}`),
  ].filter((item): item is string => Boolean(item));

  const rca = prior(ctx, "rca");
  if (authBug(ctx)) {
    return {
      agent: "implement",
      title: "One-time refresh-token migration",
      summary:
        "Accept the previous refresh token once on first launch after upgrade, rotate to the new family, keep reuse detection on.",
      sections: withLearnings(
        [
          ...(fromState.length ? [section("From shared state", fromState)] : []),
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
        ctx,
      ),
      findings: [],
      recommendation: rca?.recommendation ?? "Generate tests for upgrade and for actual reuse.",
    };
  }

  if (identityFeature(ctx) && ctx.step.track === "backend") {
    return {
      agent: "implement",
      title: "Backend Google token verify",
      summary: "Verify aud/iss/expiry, link `sub`, and issue the app session. Do not trust the client.",
      sections: withLearnings(
        [
          ...(fromState.length ? [section("From shared state", fromState)] : []),
          section("Change", [
            "Backend: verify aud/iss/expiry, link `sub`, issue the app session.",
            "Do not trust the client as the source of truth.",
          ]),
        ],
        ctx,
      ),
      findings: [],
      recommendation: "Tests must cover account linking and a forged ID token.",
    };
  }

  if (identityFeature(ctx) && ctx.step.track === "mobile") {
    const client = flutterTicket(ctx) ? "Flutter" : "Mobile";
    return {
      agent: "implement",
      title: `${client} Google Sign-In SDK`,
      summary: `${client} only hosts the SDK, then exchanges the token with the backend.`,
      sections: withLearnings(
        [
          ...(fromState.length ? [section("From shared state", fromState)] : []),
          section("Change", [
            `${client}: Google Sign-In SDK, then exchange the token with the backend.`,
            "Do not treat the client as the source of truth.",
          ]),
        ],
        ctx,
      ),
      findings: [],
      recommendation: "Tests must cover a cancelled Sign-In and a forged ID token from the client.",
    };
  }

  if (identityFeature(ctx)) {
    return {
      agent: "implement",
      title: "Google Sign-In beside the existing session",
      summary:
        "Add Google as a provider in the auth module. Backend verifies the token. Mobile only hosts the SDK.",
      sections: withLearnings(
        [
          ...(fromState.length ? [section("From shared state", fromState)] : []),
          section("Change", [
            "Mobile: Google Sign-In SDK, then exchange the token with the backend.",
            "Backend: verify aud/iss/expiry, link `sub`, issue the app session.",
            "Do not trust the client as the source of truth.",
          ]),
        ],
        ctx,
      ),
      findings: [],
      recommendation: "Tests must cover account linking and a forged ID token.",
    };
  }

  return {
    agent: "implement",
    title: `Scoped ${ctx.run.analysis.area} change`,
    summary: "A patch against the locked cause, not a rewrite.",
    sections: withLearnings(
      [
        ...(fromState.length ? [section("From shared state", fromState)] : []),
        section("Change", [
          ctx.ticket.trim(),
          "Keep the diff inside the owning module.",
        ]),
      ],
      ctx,
    ),
    findings: [],
    recommendation: "Tests must reproduce the original failure.",
  };
}

function testsArtifact(ctx: Ctx): Artifact {
  const files = stateOf(ctx).files_changed;
  const findings = stateOf(ctx).security_findings;
  const fromState = [
    ...files.map((file) => `Cover ${file}`),
    ...findings.map((item) => `Do not green a fix that ignores: ${item.title}`),
  ];

  if (identityFeature(ctx) && ctx.step.track === "backend") {
    return {
      agent: "tests",
      title: "Backend identity regressions",
      summary: "Cover token verify, account linking, and a forged ID token.",
      sections: [
        ...(fromState.length ? [section("From shared state", fromState)] : []),
        section("Cases", [
          "A valid Google token links to the existing user and issues an app session.",
          "A forged ID token is rejected.",
          "Email-only matching does not take over another account.",
        ]),
      ],
      findings: [],
      recommendation: "Quality gate next after both tracks join.",
    };
  }

  if (identityFeature(ctx) && ctx.step.track === "mobile") {
    const client = flutterTicket(ctx) ? "Flutter" : "Mobile";
    return {
      agent: "tests",
      title: `${client} Sign-In regressions`,
      summary: `Cover the ${client} SDK happy path and a cancelled sign-in.`,
      sections: [
        ...(fromState.length ? [section("From shared state", fromState)] : []),
        section("Cases", [
          `${client} Sign-In SDK returns a token and the app exchanges it with the backend.`,
          "A cancelled sign-in leaves the existing session untouched.",
        ]),
      ],
      findings: [],
      recommendation: "Quality gate next after both tracks join.",
    };
  }

  if (authBug(ctx)) {
    return {
      agent: "tests",
      title: "Upgrade session regressions",
      summary: "Cover the upgrade migrate path and the real theft path so one test cannot green both.",
      sections: [
        ...(fromState.length ? [section("From shared state", fromState)] : []),
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
      ...(fromState.length ? [section("From shared state", fromState)] : []),
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
  const quality = evaluateRun({
    ticket: ctx.ticket,
    analysis: ctx.run.analysis,
    plan: ctx.run.plan,
    artifacts: ctx.run.artifacts,
    state: ctx.run.state,
    status: ctx.run.status,
  });
  const gate = compactGate(quality);
  return {
    agent: "evals",
    title: gate.verdict === "PASS" ? "Quality gate passed" : "Quality gate failed",
    summary:
      gate.verdict === "PASS"
        ? `Score ${gate.score}. Correctness, security, tests, architecture, regression, and code quality passed.`
        : `Score ${gate.score}. Fail closed — do not open a PR.`,
    sections: [
      section(
        "Dimensions",
        Object.entries(gate.dimensions).map(
          ([id, row]) => `${row.pass ? "pass" : "fail"}: ${id.replaceAll("_", " ")} · ${row.score}`,
        ),
      ),
      section(
        "Guardrails",
        GUARDRAIL_CATALOG.map((item) => `${gate.guardrails[item.id]}: ${item.label.toLowerCase()}`),
      ),
      section(
        "Checks",
        quality.checks.map((item) => `${item.pass ? "pass" : item.severity}: ${item.label} — ${item.detail}`),
      ),
    ],
    findings: quality.checks
      .filter((item) => !item.pass && item.severity === "error")
      .map((item) => ({
        severity: "blocker" as const,
        title: item.label,
        detail: item.detail,
      })),
    recommendation:
      gate.verdict === "PASS"
        ? ctx.run.plan.control.autonomous
          ? "Quality gate passed. Action is automatic."
          : "Quality gate passed. Human approval next, then Action."
        : "Stop. Do not take Action.",
  };
}

function mergeArtifact(ctx: Ctx): Artifact {
  const merged = compactMerge(stateOf(ctx));
  return {
    agent: "merge",
    title: merged.recommendation === "hold" ? "Merged result — hold" : "Merged result",
    summary: "Specialist outputs are folded into one object before the quality gate.",
    sections: [
      section("files_changed", merged.files_changed.length ? merged.files_changed : ["(none yet)"]),
      section("tests", merged.tests.length ? merged.tests : ["(none)"]),
      section(
        "security_findings",
        merged.security_findings.length
          ? merged.security_findings.map((item) => item.title)
          : ["(none)"],
      ),
    ],
    findings: merged.security_findings.filter((item) => item.severity === "blocker"),
    recommendation: merged.recommendation === "hold" ? "Hold. Do not send to Action." : "Quality gate next.",
  };
}

function prArtifact(ctx: Ctx): Artifact {
  const title = authBug(ctx)
    ? "fix(auth): migrate refresh tokens across app upgrade"
    : `${ctx.run.analysis.taskType}: ${ctx.run.analysis.area.toLowerCase()} change`;
  return {
    agent: "pr",
    title,
    summary: "Action is drafted after the quality gate. It is not merged.",
    sections: [
      section("Body", [
        ctx.ticket.trim(),
        `Risk: ${ctx.run.analysis.risk}. Area: ${ctx.run.analysis.area}.`,
        ctx.run.plan.humanApprovalRequired
          ? "Do not merge without human approval."
          : "LOW/MEDIUM: Action is automatic after a passing quality gate.",
      ]),
    ],
    findings: [],
    recommendation: "Done. The orchestrator does not merge.",
  };
}

function reviewArtifact(ctx: Ctx): Artifact {
  const shared = stateOf(ctx);
  const fromState = [
    ...shared.files_changed.map((file) => `Diff includes ${file}`),
    ...shared.tests.slice(0, 3).map((item) => `Test: ${item}`),
    ...shared.security_findings.map((item) => `Open security item: ${item.title}`),
  ];
  const recovered = reviewRecovered(ctx.run);
  const findings = reviewLoopIssues(ctx.run.analysis, recovered);

  return {
    agent: "pr_review",
    title: "Review of the proposed change",
    summary: "Reviewer looks at the diff and tests before Result Merger. Not a rubber stamp.",
    sections: [
      ...(fromState.length ? [section("From shared state", fromState)] : []),
      section("Lenses", [
        ctx.run.analysis.area === "Authentication" || hasArea(ctx.run.analysis, "authentication")
          ? "Auth session and token handling."
          : `Focus on ${ctx.run.analysis.area}.`,
        "Tests cover the reported failure.",
        "No secrets in the diff.",
      ]),
    ],
    findings,
    recommendation: recovered
      ? "Review passed after the fix. Evals next."
      : findings.length > 0
        ? "Orchestrator must fix these before evals."
        : "Evals next.",
  };
}

function approvalArtifact(ctx: Ctx): Artifact {
  const gate = ctx.step.gate;
  return {
    agent: "approval",
    title: gate === "plan" ? "Plan approval" : gate === "ship" ? "Ship approval" : "Waiting for a human",
    summary:
      ctx.run.plan.control?.gates.find((item) => item.id === gate)?.reason ??
      ctx.run.plan.approvalReason,
    sections: [
      section("What to check", [
        ctx.run.analysis.vague
          ? "Is this even a change request?"
          : gate === "plan"
            ? "Is this the right change, and may Developer start?"
            : "Did tests, review, and Security land in the merged result, and may Action run?",
        "Did Security Review run before the Developer Agent?",
        "The orchestrator will not merge.",
      ]),
      section("Especially gated", [
        "Production deployments",
        "Database migrations",
        "Destructive operations",
        "Security-sensitive changes",
        "Dependency upgrades",
        "Infrastructure changes",
      ]),
      section("Orchestrator will not", ["Merge.", "Deploy.", "Bypass this gate because a model is confident."]),
    ],
    findings: [],
    recommendation:
      gate === "plan"
        ? "Approve to let Implementation start, or reject the plan."
        : "Approve to take Action, or reject. Nothing merges itself.",
  };
}

function consensusArtifact(ctx: Ctx): Artifact {
  const result = buildConsensus({
    ticket: ctx.ticket,
    analysis: ctx.run.analysis,
    plan: ctx.run.plan,
    artifacts: ctx.run.artifacts,
  });
  return {
    agent: "consensus",
    title: `Decision: ${result.decision}`,
    summary: `Confidence: ${result.confidence}%`,
    sections: [
      section(
        "Voices",
        result.voices.map((item) => `${item.label}: ${item.summary}`),
      ),
      section("Rationale", result.rationale.length ? result.rationale : [result.decision]),
    ],
    findings: [],
    recommendation:
      result.decision === "DO NOT MIGRATE"
        ? "Do not migrate. Keep REST. A person still accepts this recommendation."
        : result.recommendation === "migrate"
          ? "Migrate only after a person accepts. No PR from this debate."
          : "Hold until the specialists finish speaking.",
  };
}

const BUILDERS: Record<AgentId, (ctx: Ctx) => Artifact> = {
  requirements: requirementsArtifact,
  bug: bugArtifact,
  research: researchArtifact,
  rca: rcaArtifact,
  architect: architectArtifact,
  tech_debt: debtArtifact,
  security: securityArtifact,
  database: databaseArtifact,
  performance: performanceArtifact,
  implement: implementArtifact,
  tests: testsArtifact,
  pr_review: reviewArtifact,
  merge: mergeArtifact,
  evals: evalsArtifact,
  consensus: consensusArtifact,
  approval: approvalArtifact,
  pr: prArtifact,
};

export function runSpecialist(ctx: Ctx): Artifact {
  const builder = BUILDERS[ctx.step.agent];
  const artifact = builder(ctx);
  if (!artifact.title) artifact.title = AGENTS[ctx.step.agent].label;
  artifact.stepId = ctx.step.id;
  artifact.track = ctx.step.track;
  const last = ctx.run.recovery?.events.at(-1)?.decision;
  const issues = last?.evidence ?? ctx.run.verification?.cycles.at(-1)?.issues ?? [];
  const reviewFixed = reviewRecovered(ctx.run);

  if (ctx.step.agent === "tests" && compilationLoopIssues(ctx.run.analysis, testRecovered(ctx.run.recovery)).length > 0) {
    const compile = compilationLoopIssues(ctx.run.analysis, false)[0];
    artifact.title = "Tests failed: compilation";
    artifact.summary = "The suite never reached assertions. Failure Classifier next — not the same test prompt.";
    artifact.findings = [compile, ...artifact.findings];
    artifact.sections = [
      section("Failure", [compile.detail, "Compilation? → Developer. Test logic? → Developer. Environment? → Infrastructure. Dependency? → Dependency Agent. Unknown? → Investigation Agent."]),
      ...artifact.sections,
    ];
    artifact.recommendation = "Failure Classifier: compilation → Developer Agent.";
  }

  if ((ctx.run.retries ?? 0) > 0 && ctx.step.agent === "implement" && issues.length > 0) {
    artifact.title = artifact.title.startsWith("Fix:") ? artifact.title : `Fix: ${artifact.title}`;
    artifact.sections = [
      {
        heading: last ? `Fix from ${last.kind.replaceAll("_", " ")}` : "Fix from review",
        bullets: [
          last ? `${last.cause} → ${last.target}` : "Address open review issues.",
          ...issues.map((issue) => `Address: ${issue}`),
        ],
      },
      ...artifact.sections,
    ];
  }
  if ((ctx.run.retries ?? 0) > 0 && ctx.step.agent === "tests" && issues.length > 0) {
    const heading = last?.kind === "test_failure" ? "Compilation regressions" : "Review regressions";
    artifact.sections = [
      ...artifact.sections,
      { heading, bullets: issues.map((issue) => `Must stay green: ${issue}`) },
    ];
  }
  if (ctx.step.agent === "pr_review" && reviewFixed) {
    artifact.title = "Review passed after fix";
    artifact.summary = "PR Reviewer re-read the diff after Developer addressed the open issues.";
  }
  return fulfillContract(ctx, artifact);
}
