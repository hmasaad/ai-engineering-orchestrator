import type {
  AreaId,
  ControlKind,
  Risk,
  RiskEngineResult,
  RiskFactor,
  RiskPolicy,
  TaskAnalysis,
  TaskType,
} from "./types";

const LEVEL_SCORE: Record<Risk, number> = {
  low: 18,
  medium: 46,
  high: 74,
  critical: 96,
};

const SENSITIVE: AreaId[] = ["authentication", "payments", "privacy", "security"];

const UI_ONLY: AreaId[] = ["ui", "frontend", "documentation"];

const CRITICAL_HINTS = [
  "p0",
  "sev1",
  "outage",
  "data loss",
  "rce",
  "auth bypass",
  "production is down",
];

const SCHEMA_ADD_HINTS = [
  "add a field",
  "add a database field",
  "add database field",
  "add a column",
  "add column",
  "add an index",
  "add a db field",
  "new column",
  "new database field",
];

export const PERFORMANCE_HINTS = [
  "slow",
  "latency",
  "p95",
  "p99",
  "timeout",
  "too many queries",
  "n+1",
  "n + 1",
  "memory leak",
  "cpu bound",
  "performance",
  "under load",
  "takes 8 seconds",
  "takes four seconds",
  "four seconds",
  "10,000 rows",
];

export const EXFIL_HINTS = [
  "email the production",
  "exfiltrate",
  "paste the secrets",
  "paste production secrets",
  "upload the database dump",
  "send customer email",
  "attacker@",
  "cat ~/.ssh",
  "webhook.site",
  "production .env",
];

function hay(text: string) {
  return ` ${text.toLowerCase().replace(/\s+/g, " ").trim()} `;
}

function any(text: string, needles: string[]) {
  const h = hay(text);
  return needles.some((needle) => h.includes(needle.toLowerCase()));
}

export function hasPerformanceIssue(ticket: string) {
  return any(ticket, PERFORMANCE_HINTS);
}

export function hasDataExfiltration(ticket: string) {
  return any(ticket, EXFIL_HINTS);
}

export const RISK_LADDER: {
  level: Risk;
  example: string;
  action: RiskPolicy["action"];
  detail: string;
}[] = [
  {
    level: "low",
    example: "Update button text",
    action: "automatic",
    detail: "No human gate. Quality gate, then Action.",
  },
  {
    level: "medium",
    example: "Add database field",
    action: "tests_review",
    detail: "Testing Agent and PR Reviewer must run.",
  },
  {
    level: "high",
    example: "Modify authentication",
    action: "security_human",
    detail: "Security Review before the patch, then a human after the quality gate.",
  },
  {
    level: "critical",
    example: "Production deployment",
    action: "mandatory_human",
    detail: "A person must approve. The orchestrator never deploys on its own.",
  },
];

export function policyFor(level: Risk, vague = false): RiskPolicy {
  if (vague) {
    return {
      autonomous: false,
      require_tests: false,
      require_review: false,
      require_security: false,
      require_human: true,
      action: "mandatory_human",
    };
  }
  switch (level) {
    case "low":
      return {
        autonomous: true,
        require_tests: false,
        require_review: false,
        require_security: false,
        require_human: false,
        action: "automatic",
      };
    case "medium":
      return {
        autonomous: true,
        require_tests: true,
        require_review: true,
        require_security: false,
        require_human: false,
        action: "tests_review",
      };
    case "high":
      return {
        autonomous: false,
        require_tests: true,
        require_review: true,
        require_security: true,
        require_human: true,
        action: "security_human",
      };
    case "critical":
      return {
        autonomous: false,
        require_tests: true,
        require_review: true,
        require_security: true,
        require_human: true,
        action: "mandatory_human",
      };
  }
}

function push(factors: RiskFactor[], id: string, label: string) {
  if (!factors.some((item) => item.id === id)) factors.push({ id, label });
}

export function scoreRisk(input: {
  ticket: string;
  taskType: TaskType;
  areas: AreaId[];
  vague: boolean;
  kinds: ControlKind[];
}): RiskEngineResult {
  const ticket = input.ticket;
  const factors: RiskFactor[] = [];
  let level: Risk = "medium";

  const sensitive = input.areas.some((id) => SENSITIVE.includes(id));
  const uiOnly =
    input.areas.length > 0 && input.areas.every((id) => UI_ONLY.includes(id));
  const additive = any(ticket, SCHEMA_ADD_HINTS) || input.kinds.includes("schema_change");

  if (input.vague) {
    level = "low";
    push(factors, "vague", "Ticket is too thin to score blast radius.");
  } else if (input.kinds.includes("production_deploy") || input.taskType === "incident" || any(ticket, CRITICAL_HINTS)) {
    level = "critical";
    if (input.kinds.includes("production_deploy")) push(factors, "prod", "Production deployment.");
    if (input.taskType === "incident") push(factors, "incident", "Incident / outage.");
    if (any(ticket, CRITICAL_HINTS)) push(factors, "critical-hint", "Critical language (P0, outage, data loss).");
  } else if (
    input.kinds.includes("destructive") ||
    (input.kinds.includes("database_migration") && !additive)
  ) {
    level = "high";
    push(factors, "destructive", "Destructive or dropping schema.");
  } else if (sensitive || input.taskType === "security") {
    if (input.taskType === "research") {
      level = "medium";
      push(factors, "research-sensitive", "Sensitive area, but this is a question.");
    } else {
      level = "high";
      if (sensitive) push(factors, "sensitive-area", "Authentication, payments, privacy, or security.");
      if (input.taskType === "security") push(factors, "security-type", "Classified as a security change.");
    }
  } else if (additive) {
    level = "medium";
    push(factors, "schema", "Additive schema change (new field/column).");
  } else if (hasDataExfiltration(ticket)) {
    level = "high";
    push(factors, "exfil", "Ticket asked to send secrets or customer data out.");
  } else if (uiOnly && input.taskType !== "bug" && !hasPerformanceIssue(ticket)) {
    level = "low";
    push(factors, "ui", "UI / copy / CSS only.");
  } else if (hasPerformanceIssue(ticket)) {
    level = "medium";
    push(factors, "performance", "Performance issue — not a LOW UI patch.");
  } else if (input.taskType === "bug") {
    level = "medium";
    push(factors, "bug", "Bug fix — tests and review, not a one-shot patch.");
  } else if (input.taskType === "architecture") {
    level = "medium";
    push(factors, "architecture", "Design work.");
  } else {
    level = "medium";
    push(factors, "default", "Default blast radius is medium.");
  }

  if (input.kinds.includes("infrastructure")) {
    push(factors, "infra", "Infrastructure change.");
    if (level === "low" || level === "medium") level = "high";
  }
  if (input.kinds.includes("dependency_upgrade") && (level === "low")) {
    level = "medium";
    push(factors, "deps", "Dependency upgrade.");
  }

  const policy = policyFor(level, input.vague);
  return {
    level,
    score: LEVEL_SCORE[level],
    factors,
    policy,
  };
}

export function compactRisk(engine: RiskEngineResult) {
  return {
    level: engine.level,
    score: engine.score,
    action: engine.policy.action,
    autonomous: engine.policy.autonomous,
    require_tests: engine.policy.require_tests,
    require_review: engine.policy.require_review,
    require_security: engine.policy.require_security,
    require_human: engine.policy.require_human,
    factors: engine.factors.map((item) => item.id),
  };
}

export function riskPolicyOf(analysis: Pick<TaskAnalysis, "risk" | "vague" | "riskEngine">): RiskPolicy {
  return analysis.riskEngine?.policy ?? policyFor(analysis.risk, analysis.vague);
}
