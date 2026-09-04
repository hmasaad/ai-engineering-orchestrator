import { isSimpleUi } from "./router";
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
    "add column",
    "drop column",
    "migrate the database",
    "migration that",
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
  analysis: Pick<TaskAnalysis, "taskType" | "risk" | "areas" | "vague">,
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
    analysis.risk === "high" ||
    analysis.risk === "critical" ||
    analysis.areas.some((id) => (HIGH_RISK_AREAS as readonly string[]).includes(id))
  ) {
    kinds.add("security_sensitive");
  }
  return [...kinds];
}

export function bumpRiskForControl(
  risk: TaskAnalysis["risk"],
  kinds: ControlKind[],
): TaskAnalysis["risk"] {
  if (
    kinds.includes("destructive") ||
    kinds.includes("production_deploy") ||
    kinds.includes("database_migration")
  ) {
    if (risk === "critical") return "critical";
    return "high";
  }
  return risk;
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
  const shipping = agents.includes("implement") || agents.includes("pr");
  const especially =
    kinds.includes("production_deploy") ||
    kinds.includes("database_migration") ||
    kinds.includes("destructive") ||
    kinds.includes("dependency_upgrade") ||
    kinds.includes("infrastructure") ||
    kinds.includes("security_sensitive");
  const gates: ControlGate[] = [];

  if (analysis.vague) {
    gates.push(
      gate(
        "plan",
        "end",
        "The ticket is incomplete. A human must clarify before any change is generated.",
      ),
    );
    return { autonomous: false, kinds, gates };
  }

  if (analysis.taskType === "research" && !shipping) {
    return { autonomous: true, kinds, gates };
  }

  const needsPlan =
    shipping &&
    agents.includes("implement") &&
    (especially ||
      analysis.taskType === "bug" ||
      analysis.taskType === "incident" ||
      analysis.taskType === "feature" ||
      analysis.taskType === "architecture" ||
      analysis.taskType === "security" ||
      analysis.taskType === "tech_debt") &&
    !(isSimpleUi(analysis) && !especially);

  if (needsPlan) {
    const why = kinds.includes("production_deploy")
      ? "Production deployments are not autonomous. Approve the plan before Implementation."
      : kinds.includes("destructive") || kinds.includes("database_migration")
        ? "Destructive or migration work needs a human on the plan before anyone writes code."
        : kinds.includes("infrastructure")
          ? "Infrastructure changes need a human on the plan before Implementation."
          : kinds.includes("dependency_upgrade")
            ? "Dependency upgrades can break production. Approve the plan first."
            : kinds.includes("security_sensitive")
              ? "Security-sensitive change. Approve the plan before Implementation."
              : "A person must approve the plan before Developer writes code.";
    gates.push(gate("plan", "developer", why));
  }

  if (shipping && agents.includes("pr")) {
    const why = especially
      ? "A person must approve after Testing (and Security) before a PR is opened."
      : "Agents do not open PRs on their own. Approve before Create PR.";
    gates.push(gate("ship", "pr", why));
  }

  if (!shipping && analysis.taskType === "incident") {
    gates.push(gate("plan", "end", "Incidents always stop for a human."));
  }

  return {
    autonomous: gates.length === 0,
    kinds,
    gates,
  };
}

export function compactControl(policy: ControlPolicy) {
  return {
    autonomous: policy.autonomous,
    kinds: policy.kinds,
    gates: policy.gates.map((item) => ({
      id: item.id,
      before: item.before,
    })),
  };
}

export const CONTROL_PHASES = [
  "Planning",
  "Human Approval",
  "Implementation",
  "Testing",
  "Security",
  "Human Approval",
  "PR",
] as const;
