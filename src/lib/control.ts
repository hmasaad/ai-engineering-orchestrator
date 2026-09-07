import { riskPolicyOf } from "./risk";
import type {
  AgentId,
  ControlGate,
  ControlKind,
  ControlPolicy,
  GateId,
  TaskAnalysis,
} from "./types";

const HIGH_RISK_AREAS = ["authentication", "payments", "privacy", "security"] as const;

const KIND_HINTS: Record<Exclude<ControlKind, "security_sensitive">, string[]> = {
  production_deploy: [
    "deploy to production",
    "production deploy",
    "prod deploy",
    "production rollout",
    "release to prod",
    "ship to production",
    "production release",
    "deploy to prod",
    "to production",
    "in production",
  ],
  database_migration: [
    "database migration",
    "schema migration",
    "alter table",
    "drop column",
    "migrate the database",
    "migration that",
  ],
  schema_change: [
    "add a field",
    "add a database field",
    "add database field",
    "add a column",
    "add column",
    "add an index",
    "add a db field",
    "new column",
    "new database field",
  ],
  destructive: [
    "drop table",
    "drop the unused",
    "drops the unused",
    "drops the",
    "truncate",
    "delete all",
    "destroy the",
    "wipe ",
    "remove all",
    "force push",
  ],
  dependency_upgrade: [
    "dependency upgrade",
    "upgrade the package",
    "bump the version",
    "npm update",
    "dependabot",
    "upgrade lodash",
    "upgrade a dependency",
  ],
  infrastructure: [
    "terraform",
    "kubernetes",
    "infrastructure",
    "iam policy",
    "vpc ",
    "helm chart",
    "cloudflare",
    "load balancer",
  ],
};

function hay(text: string) {
  return ` ${text.toLowerCase().replace(/\s+/g, " ").trim()} `;
}

function any(text: string, needles: string[]) {
  const h = hay(text);
  return needles.some((needle) => h.includes(needle.toLowerCase()));
}

export function detectControlKinds(
  ticket: string,
  analysis: Pick<TaskAnalysis, "taskType" | "areas" | "vague">,
): ControlKind[] {
  const kinds = new Set<ControlKind>();
  for (const [kind, hints] of Object.entries(KIND_HINTS) as [
    Exclude<ControlKind, "security_sensitive">,
    string[],
  ][]) {
    if (any(ticket, hints)) kinds.add(kind);
  }
  if (
    analysis.taskType === "security" ||
    analysis.areas.some((id) => (HIGH_RISK_AREAS as readonly string[]).includes(id))
  ) {
    kinds.add("security_sensitive");
  }
  if (kinds.has("schema_change") && (kinds.has("destructive") || any(ticket, ["drop table", "drop column"]))) {
    kinds.delete("schema_change");
  }
  return [...kinds];
}

function gate(
  id: GateId,
  before: ControlGate["before"],
  reason: string,
): ControlGate {
  return {
    id,
    label: id === "plan" ? "Plan approval" : "Ship approval",
    before,
    reason,
  };
}

export function buildControlPolicy(
  analysis: TaskAnalysis,
  agents: AgentId[],
): ControlPolicy {
  const kinds = analysis.controlKinds ?? [];
  const riskPolicy = riskPolicyOf(analysis);
  const shipping = agents.includes("implement") || agents.includes("pr");
  const gates: ControlGate[] = [];

  if (analysis.vague) {
    gates.push(
      gate(
        "plan",
        "end",
        "The ticket is incomplete. A human must clarify before any change is generated.",
      ),
    );
    return {
      autonomous: false,
      kinds,
      gates,
      risk: analysis.risk,
      action: riskPolicy.action,
    };
  }

  if (analysis.taskType === "research" && !shipping) {
    return {
      autonomous: true,
      kinds,
      gates,
      risk: analysis.risk,
      action: "automatic",
    };
  }

  if (riskPolicy.require_human) {
    const why =
      analysis.risk === "critical" || kinds.includes("production_deploy")
        ? "CRITICAL: mandatory human approval after the quality gate. The orchestrator will not take Action alone."
        : kinds.includes("destructive") || kinds.includes("database_migration")
          ? "Destructive or migration work needs a human after the quality gate."
          : analysis.asksForChange
            ? "HIGH: Security already ran. A person approves after the quality gate, before Action."
            : "HIGH-risk decision. A person accepts the consensus recommendation. No PR.";
    if (shipping && agents.includes("pr")) {
      gates.push(gate("ship", "pr", why));
    } else {
      gates.push(gate("plan", "end", why));
    }
  }

  return {
    autonomous: gates.length === 0,
    kinds,
    gates,
    risk: analysis.risk,
    action: riskPolicy.action,
  };
}

export function compactControl(policy: ControlPolicy) {
  return {
    autonomous: policy.autonomous,
    risk: policy.risk,
    action: policy.action,
    kinds: policy.kinds,
    gates: policy.gates.map((item) => ({
      id: item.id,
      before: item.before,
    })),
  };
}

export const CONTROL_PHASES = [
  "Task Understanding",
  "Repository Analysis",
  "Risk Assessment",
  "Engineering Plan",
  "Agent Selection",
  "Execution",
  "Validation",
  "Review",
  "Fix / Retry",
  "Final Decision",
] as const;
