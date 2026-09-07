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
  | "database"
  | "performance"
  | "implement"
  | "tests"
  | "pr_review"
  | "merge"
  | "evals"
  | "approval"
  | "pr";

/** Specialist names the Agent Router returns. Control-plane steps (evals, create PR, human) are added later. */
export type PublicAgentName =
  | "requirements"
  | "architect"
  | "security"
  | "database"
  | "performance"
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
  | "schema"
  | "deploy"
  | "bug"
  | "incident"
  | "security"
  | "research"
  | "debt"
  | "architecture"
  | "vague"
  | "performance";

/** A fired IF-rule from dynamic routing. */
export type FiredRouteRule = {
  if: "security-sensitive" | "database-change" | "performance-issue";
  then: "security" | "database" | "performance";
};

/** Compact Agent Router output. */
export type AgentRouting = {
  pattern: RoutePattern;
  agents: PublicAgentName[];
  rules: FiredRouteRule[];
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
  | "schema_change"
  | "destructive"
  | "security_sensitive"
  | "dependency_upgrade"
  | "infrastructure";

export type PlannerShape =
  | "clarify"
  | "research"
  | "ui-patch"
  | "schema"
  | "feature"
  | "fix"
  | "incident"
  | "security"
  | "deploy"
  | "debt"
  | "performance";

export type PlannerResult = {
  intent: "clarify" | "research" | "change" | "respond";
  change: string;
  shape: PlannerShape;
  constraints: string[];
};

export type RiskAction = "automatic" | "tests_review" | "security_human" | "mandatory_human";

export type RiskPolicy = {
  autonomous: boolean;
  require_tests: boolean;
  require_review: boolean;
  require_security: boolean;
  require_human: boolean;
  action: RiskAction;
};

export type RiskFactor = {
  id: string;
  label: string;
};

export type RiskEngineResult = {
  level: Risk;
  score: number;
  factors: RiskFactor[];
  policy: RiskPolicy;
};

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
  risk: Risk;
  action: RiskAction;
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
  planner: PlannerResult;
  riskEngine: RiskEngineResult;
};

export type PlanStep = {
  id: string;
  agent: AgentId;
  label: string;
  why: string;
  requiresApproval: boolean;
  dependsOn: string[];
  gate?: GateId;
  /** Specialists in the same wave may run in parallel. */
  wave: number;
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

export type EvalDimensionId =
  | "correctness"
  | "security"
  | "tests"
  | "architecture"
  | "regression"
  | "code_quality";

export type DimensionVerdict = {
  pass: boolean;
  score: number;
};

export type GuardrailVerdict = "pass" | "fail";

/** Compact Evaluation / Quality Gate output. */
export type QualityGate = {
  verdict: "PASS" | "FAIL";
  score: number;
  dimensions: Record<EvalDimensionId, DimensionVerdict>;
  guardrails: {
    prompt_injection: GuardrailVerdict;
    rag_poisoning: GuardrailVerdict;
    agent_hijacking: GuardrailVerdict;
    tool_abuse: GuardrailVerdict;
    unauthorized_actions: GuardrailVerdict;
    data_exfiltration: GuardrailVerdict;
    malicious_repo: GuardrailVerdict;
    malicious_mcp: GuardrailVerdict;
  };
};

export type QualityCheck = {
  id: string;
  dimension: EvalDimensionId;
  label: string;
  pass: boolean;
  severity: "error" | "warning";
  detail: string;
};

export type QualityReport = {
  ready: boolean;
  verdict: "PASS" | "FAIL";
  score: number;
  errorCount: number;
  warningCount: number;
  checks: QualityCheck[];
  dimensions: Record<EvalDimensionId, DimensionVerdict>;
  guardrails: QualityGate["guardrails"];
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

export type MergedResult = {
  files_changed: string[];
  tests: string[];
  security_findings: SharedFinding[];
  review: SharedReview | Record<string, never>;
  recommendation: "quality_gate" | "hold" | "action";
};

export type SharedLearningHit = {
  ticket: string;
  pattern: string;
  risk: Risk;
  score: number;
  summary: string;
  lessons: string[];
};

export type SharedLearnings = {
  mode: "offline";
  hits: SharedLearningHit[];
};

export type Learning = {
  id: string;
  at: string;
  ticket: string;
  type: TaskType;
  risk: Risk;
  areas: AreaId[];
  pattern: RoutePattern;
  agents: PublicAgentName[];
  summary: string;
  lessons: string[];
  quality: "PASS" | "FAIL";
  source: "seed" | "live";
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
  database: { summary: string; notes: string[] } | Record<string, never>;
  performance: { summary: string; notes: string[] } | Record<string, never>;
  learnings: SharedLearnings | Record<string, never>;
  merged: MergedResult | Record<string, never>;
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
