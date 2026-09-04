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

export type AgentId =
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

export type FindingSeverity = "nit" | "should_fix" | "blocker";

export type RunStatus =
  | "planned"
  | "running"
  | "awaiting_approval"
  | "approved"
  | "rejected"
  | "complete";

export type MissingQuestion = {
  question: string;
  whyItMatters: string;
};

export type TaskAnalysis = {
  taskType: TaskType;
  taskTypeLabel: string;
  risk: Risk;
  area: string;
  summary: string;
  requiredAgents: AgentId[];
  signals: string[];
  asksForChange: boolean;
  vague: boolean;
  missing: MissingQuestion[];
};

export type PlanStep = {
  id: string;
  agent: AgentId;
  label: string;
  why: string;
  requiresApproval: boolean;
  dependsOn: string[];
};

export type ExecutionPlan = {
  steps: PlanStep[];
  humanApprovalRequired: boolean;
  approvalReason: string;
  principle: string;
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
  decision: "approved" | "rejected";
  note: string;
  at: string;
};

export type OrchestrationRun = {
  id: string;
  createdAt: string;
  ticket: string;
  analysis: TaskAnalysis;
  plan: ExecutionPlan;
  artifacts: Artifact[];
  currentStepId: string | null;
  quality: QualityReport;
  status: RunStatus;
  approval?: ApprovalRecord;
};

export type AgentStepEvent = {
  id: string;
  agent: AgentId;
  label: string;
  detail?: string;
};
