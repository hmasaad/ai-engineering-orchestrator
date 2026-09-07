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
  | "consensus"
  | "approval"
  | "pr";

/** Specialist names the engineering plan returns. Control-plane steps (evals, create PR, human) are added later. */
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

/** Compact agent-selection output. The engineering plan wraps this. */
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

export type EngineeringTool =
  | "read_repo"
  | "search_code"
  | "edit_files"
  | "run_tests"
  | "security_review"
  | "schema_review"
  | "perf_profile"
  | "open_pr"
  | "eval_suite"
  | "human_gate";

export type RepoModule = {
  path: string;
  reason: string;
};

export type RepoAnalysis = {
  repository: string;
  branch: string;
  areas: AreaId[];
  modules: RepoModule[];
  files: string[];
  blastRadius: "local" | "service" | "cross-cutting";
};

export type PlanDependency = {
  from: string;
  to: string;
  why: string;
};

export type RetryPolicy = {
  allowed: boolean;
  maxAttempts: number;
  onFail: "retry_implement" | "hold";
  reason: string;
};

export type VerificationTrigger = "review" | "evals" | "evidence";

export type VerificationCycle = {
  attempt: number;
  trigger: VerificationTrigger;
  reason: string;
  issues: string[];
  result: "fix" | "pass" | "hold";
};

export type VerificationOutcome = "idle" | "pending" | "fixing" | "passed" | "exhausted";

export type VerificationLoop = {
  stages: string[];
  pass: boolean | null;
  outcome: VerificationOutcome;
  attempts: number;
  cycles: VerificationCycle[];
};

export type FailureKind =
  | "tool_failure"
  | "agent_failure"
  | "timeout"
  | "invalid_output"
  | "test_failure"
  | "security_failure"
  | "conflicting_opinions"
  | "token_limit"
  | "dependency_failure";

export type FailureCause =
  | "compilation"
  | "test_logic"
  | "environment"
  | "dependency"
  | "unknown"
  | "contract"
  | "timeout"
  | "token_limit"
  | "tool"
  | "security_finding"
  | "merge_conflict"
  | "agent_crash";

export type RecoveryTarget =
  | "developer"
  | "infrastructure"
  | "dependency"
  | "investigation"
  | "security"
  | "human"
  | "hold";

export type RecoveryStage = "tests" | "review" | "evals";

export type RecoveryDecision = {
  kind: FailureKind;
  cause: FailureCause;
  target: RecoveryTarget;
  reason: string;
  fromAgent: AgentId | "orchestrator";
  evidence: string[];
};

export type RecoveryEvent = {
  attempt: number;
  stage: RecoveryStage;
  decision: RecoveryDecision;
  result: "reroute" | "hold" | "recovered";
};

export type RecoveryOutcome = "idle" | "pending" | "rerouting" | "recovered" | "held";

export type FailureRecovery = {
  kinds: FailureKind[];
  routes: { cause: FailureCause; target: RecoveryTarget; label: string }[];
  outcome: RecoveryOutcome;
  events: RecoveryEvent[];
  last: RecoveryDecision | null;
};

export type DebateStance = "for" | "against" | "mixed";

export type DebateVoice = {
  agent: AgentId;
  label: string;
  stance: DebateStance;
  summary: string;
  confidence: number;
};

export type ConsensusRecommendation = "do_not_migrate" | "migrate" | "hold" | "no_debate";

export type ConsensusResult = {
  question: string;
  decision: string;
  recommendation: ConsensusRecommendation;
  confidence: number;
  voices: DebateVoice[];
  rationale: string[];
};

export type SuccessCriterion = {
  id: string;
  label: string;
};

export type EngineeringSelection = {
  pattern: RoutePattern;
  reason: string;
  rules: FiredRouteRule[];
};

export type EngineeringPlan = {
  taskType: TaskType;
  risk: Risk;
  shape: PlannerShape;
  intent: PlannerResult["intent"];
  pipeline: string[];
  repository: RepoAnalysis;
  agents: PublicAgentName[];
  tools: EngineeringTool[];
  dependencies: PlanDependency[];
  parallel: string[][];
  humanApproval: { required: boolean; gates: GateId[]; reason: string };
  success: SuccessCriterion[];
  retry: RetryPolicy;
  selection: EngineeringSelection;
};

export type CompactEngineering = {
  type: TaskType;
  areas: AreaId[];
  files: string[];
  agents: PublicAgentName[];
  tools: EngineeringTool[];
  parallel: string[][];
  human: boolean;
  success: string[];
  retry: RetryPolicy["onFail"];
};

export type FinalDecision = {
  outcome: "clarify" | "research" | "recommend" | "hold" | "awaiting_human" | "open_pr";
  reason: string;
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
  | "performance"
  | "decision";

export type PlannerResult = {
  intent: "clarify" | "research" | "change" | "respond";
  change: string;
  shape: PlannerShape;
  constraints: string[];
};

export type WorkTrack = "backend" | "mobile" | "shared";

export type GraphNodeKind =
  | "architecture"
  | "security"
  | "backend"
  | "mobile"
  | "tests"
  | "integration"
  | "review"
  | "other";

export type GraphNode = {
  id: string;
  label: string;
  kind: GraphNodeKind;
  track?: WorkTrack;
  stepIds: string[];
  wave: number;
};

export type GraphEdge = {
  from: string;
  to: string;
};

export type DependencyGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  parallel: boolean;
  ascii: string;
};

export type TaskPlanPhase = {
  id: "investigation" | "architecture" | "schema" | "performance" | "security" | "implementation" | "tests" | "review";
  label: string;
};

export type TaskPlan = {
  id: string;
  title: string;
  requirements: string[];
  affectedAreas: string[];
  agents: string[];
  dependencies: TaskPlanPhase[];
  graph: DependencyGraph;
};

export type RiskAction = "automatic" | "tests_review" | "security_human" | "mandatory_human";

export type RiskLane = "auto_execute" | "review" | "human_approval";

export type RiskPolicy = {
  autonomous: boolean;
  require_tests: boolean;
  require_review: boolean;
  require_security: boolean;
  require_human: boolean;
  require_rollback: boolean;
  action: RiskAction;
  lane: RiskLane;
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
  taskPlan: TaskPlan;
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
  /** Independent execution lane after Architecture / Security. */
  track?: WorkTrack;
};

export type ExecutionPlan = {
  steps: PlanStep[];
  humanApprovalRequired: boolean;
  approvalReason: string;
  principle: string;
  route: AgentRoute;
  control: ControlPolicy;
  engineering?: EngineeringPlan;
  graph?: DependencyGraph;
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
  stepId?: string;
  track?: WorkTrack;
  contract?: AgentContract;
  evidence?: ClaimRecord;
};

export type AgentContractStatus = "completed" | "blocked" | "needs_human" | "failed";

export type AgentContractInput = {
  task: string;
  context: string[];
  constraints: string[];
  repository: { files: string[]; areas: string[] };
};

export type AgentContractOutput = {
  status: AgentContractStatus;
  confidence: number;
  result: string;
  evidence: string[];
  artifacts: string[];
  risks: string[];
  findings: { severity: FindingSeverity; title: string }[];
  files_changed: string[];
  tests_added: string[];
  recommendations: string[];
  next: string[];
};

export type AgentContract = {
  agent: AgentId;
  input: AgentContractInput;
  output: AgentContractOutput;
};

export type EvidenceKind =
  | "file_changed"
  | "tests_added"
  | "tests_passed"
  | "integration"
  | "security_scan"
  | "review"
  | "eval_suite";

export type EvidenceVerdict = "supported" | "unsupported" | "pending";

export type EvidenceItem = {
  id: string;
  kind: EvidenceKind;
  label: string;
  source: "system";
  held: boolean;
};

export type ClaimRecord = {
  agent: AgentId;
  stepId?: string;
  claim: string;
  agent_says: boolean;
  system_has_evidence: boolean;
  verdict: EvidenceVerdict;
  items: EvidenceItem[];
};

export type EvidenceEngineResult = {
  claim: string;
  verdict: EvidenceVerdict;
  agent_says: boolean;
  system_has_evidence: boolean;
  items: EvidenceItem[];
  claims: ClaimRecord[];
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
  consensus: ConsensusResult | Record<string, never>;
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
  evidence?: EvidenceEngineResult;
  consensus?: ConsensusResult;
  status: RunStatus;
  pendingGate: GateId | null;
  resumeFrom: number;
  approvals: ApprovalRecord[];
  approval?: ApprovalRecord;
  retries: number;
  verification?: VerificationLoop;
  recovery?: FailureRecovery;
  decision?: FinalDecision;
};

export type AgentStepEvent = {
  id: string;
  agent: AgentId;
  label: string;
  detail?: string;
};
