export type TaskType =
  | "bug"
  | "incident"
  | "security"
  | "feature"
  | "architecture"
  | "tech_debt"
  | "research"
  | "refactor";

export type Risk = "low" | "medium" | "high" | "critical";

export type AreaId =
  | "authentication"
  | "backend"
  | "mobile"
  | "frontend"
  | "security"
  | "payments"
  | "privacy"
  | "booking"
  | "ui"
  | "documentation"
  | "platform"
  | "application";

export type TaskInput = {
  task: string;
  repository?: string;
  branch?: string;
};

/** Compact Task Understanding output. */
export type TaskUnderstanding = {
  type: TaskType;
  risk: Risk;
  areas: AreaId[];
};

export type AgentId =
  | "requirements"
  | "bug"
  | "research"
  | "rca"
  | "architect"
  | "tech_debt"
  | "security"
  | "implement"
  | "tests"
  | "evals"
  | "pr"
  | "pr_review"
  | "approval";

/** Specialist names the Agent Router returns. Control-plane steps (evals, create PR, human) are added later. */
export type PublicAgentName =
  | "requirements"
  | "architect"
  | "security"
  | "developer"
  | "testing"
  | "pr_reviewer"
  | "bug"
  | "research"
  | "rca"
  | "tech_debt";

export type RoutePattern =
  | "feature"
  | "ui"
  | "bug"
  | "incident"
  | "security"
  | "research"
  | "debt"
  | "architecture"
  | "vague";

/** Compact Agent Router output. */
export type AgentRouting = {
  pattern: RoutePattern;
  agents: PublicAgentName[];
};

export type RouteSkip = {
  agent: PublicAgentName;
  reason: string;
};

export type AgentRoute = {
  pattern: RoutePattern;
  reason: string;
  agents: AgentId[];
  routing: AgentRouting;
  skipped: RouteSkip[];
};

export type FindingSeverity = "nit" | "should_fix" | "blocker";

export type RunStatus =
  | "planned"
  | "running"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "complete";

export type GateId = "plan" | "ship";

export type ControlKind =
  | "production_deploy"
  | "database_migration"
  | "destructive"
  | "security_sensitive"
  | "dependency_upgrade"
  | "infrastructure";

export type ControlGate = {
  id: GateId;
  label: string;
  before: "developer" | "pr" | "end";
  reason: string;
};

export type ControlPolicy = {
  autonomous: boolean;
  kinds: ControlKind[];
  gates: ControlGate[];
};

export type MissingQuestion = {
  question: string;
  whyItMatters: string;
};

export type TaskAnalysis = {
  input: TaskInput;
  taskType: TaskType;
  taskTypeLabel: string;
  risk: Risk;
  /** Canonical affected areas, e.g. authentication, backend, mobile, security. */
  areas: AreaId[];
  /** Primary area label for display. */
  area: string;
  understanding: TaskUnderstanding;
  route: AgentRoute;
  summary: string;
  requiredAgents: AgentId[];
  signals: string[];
  asksForChange: boolean;
  vague: boolean;
  missing: MissingQuestion[];
  controlKinds: ControlKind[];
};

export type PlanStep = {
  id: string;
  agent: AgentId;
  label: string;
  why: string;
  requiresApproval: boolean;
  dependsOn: string[];
  gate?: GateId;
};

export type ExecutionPlan = {
  steps: PlanStep[];
  humanApprovalRequired: boolean;
  approvalReason: string;
  principle: string;
  route: AgentRoute;
  control: ControlPolicy;
};

export type ArtifactSection = {
  heading: string;
  bullets: string[];
};

export type Finding = {
  severity: FindingSeverity;
  title: string;
  detail: string;
};

export type Artifact = {
  agent: AgentId;
  title: string;
  summary: string;
  sections: ArtifactSection[];
  findings: Finding[];
  recommendation: string;
};

export type QualityCheck = {
  id: string;
  label: string;
  pass: boolean;
  severity: "error" | "warning";
  detail: string;
};

export type QualityReport = {
  ready: boolean;
  score: number;
  errorCount: number;
  warningCount: number;
  checks: QualityCheck[];
};

export type ApprovalRecord = {
  gate: GateId;
  decision: "approved" | "rejected";
  note: string;
  at: string;
};

export type SharedRequirements = {
  summary: string;
  in_scope: string[];
  out_of_scope: string[];
  success: string[];
};

export type SharedArchitecture = {
  summary: string;
  boundaries: string[];
  data: string[];
};

export type SharedFinding = {
  severity: FindingSeverity;
  title: string;
  detail: string;
};

export type SharedReview = {
  summary: string;
  recommendation: string;
  findings: SharedFinding[];
};

/**
 * Compact shared blackboard. Agents read and write these keys.
 * Empty objects/arrays mean that specialist has not written yet.
 */
export type SharedAgentState = {
  task: string;
  requirements: SharedRequirements | Record<string, never>;
  architecture: SharedArchitecture | Record<string, never>;
  files_changed: string[];
  security_findings: SharedFinding[];
  tests: string[];
  review: SharedReview | Record<string, never>;
  status: RunStatus;
};

export type OrchestrationRun = {
  id: string;
  createdAt: string;
  ticket: string;
  input: TaskInput;
  analysis: TaskAnalysis;
  plan: ExecutionPlan;
  artifacts: Artifact[];
  state: SharedAgentState;
  currentStepId: string | null;
  quality: QualityReport;
  status: RunStatus;
  pendingGate: GateId | null;
  resumeFrom: number;
  approvals: ApprovalRecord[];
  approval?: ApprovalRecord;
};

export type AgentStepEvent = {
  id: string;
  agent: AgentId;
  label: string;
  detail?: string;
};
