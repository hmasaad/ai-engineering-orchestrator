import { assessArtifact } from "./evidence";
import { filesForTrack } from "./repo";
import { isFilled } from "./state";
import type {
  AgentContract,
  AgentContractInput,
  AgentContractOutput,
  AgentContractStatus,
  AgentId,
  Artifact,
  OrchestrationRun,
  PlanStep,
} from "./types";

const DONE = /^(done\.?|ok\.?|complete\.?)$/i;

const BASE_CONFIDENCE: Record<AgentId, number> = {
  requirements: 0.88,
  bug: 0.84,
  research: 0.9,
  rca: 0.87,
  architect: 0.9,
  tech_debt: 0.86,
  security: 0.93,
  database: 0.89,
  performance: 0.88,
  implement: 0.86,
  tests: 0.9,
  pr_review: 0.85,
  merge: 0.92,
  evals: 0.95,
  consensus: 0.93,
  approval: 0.99,
  pr: 0.97,
};

type Ctx = {
  ticket: string;
  run: Pick<OrchestrationRun, "analysis" | "plan" | "artifacts" | "state" | "status">;
  step: PlanStep;
};

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

export function isBareDone(text: string) {
  return DONE.test(text.trim());
}

export function buildContractInput(ctx: Ctx): AgentContractInput {
  const analysis = ctx.run.analysis;
  const state = ctx.run.state;
  const files = ctx.run.plan.engineering?.repository.files ?? [];
  const architecture = state?.architecture;
  const context = unique([
    `${analysis.taskTypeLabel} · ${analysis.risk} · ${analysis.areas.join(", ")}`,
    ctx.step.why,
    ctx.step.track ? `Track: ${ctx.step.track}` : "",
    architecture && isFilled(architecture) && "summary" in architecture
      ? `Architecture: ${architecture.summary}`
      : "",
    state?.security_findings?.length
      ? `Security findings: ${state.security_findings.map((item) => item.title).join("; ")}`
      : "",
    state?.files_changed?.length ? `Files already changed: ${state.files_changed.join(", ")}` : "",
  ]);
  const constraints = unique([
    ...(analysis.planner?.constraints ?? []),
    analysis.riskEngine?.policy.require_security ? "Security Review before Developer." : "",
    analysis.riskEngine?.policy.require_human ? "A person must sign after the quality gate." : "",
    analysis.riskEngine?.policy.require_rollback ? "Name a rollback path before Action." : "",
    "Action is opening a PR. Never merge.",
  ]);
  return {
    task: ctx.ticket.trim(),
    context,
    constraints,
    repository: { files, areas: [...analysis.areas] },
  };
}

function statusOf(ctx: Ctx, artifact: Artifact): AgentContractStatus {
  if (ctx.step.agent === "evals" && /fail/i.test(artifact.title + artifact.summary)) return "failed";
  if (ctx.step.agent === "tests" && /fail/i.test(artifact.title)) return "failed";
  if (ctx.step.agent === "merge" && /hold/i.test(artifact.title)) return "blocked";
  if (ctx.step.agent === "approval") return "needs_human";
  if (ctx.run.analysis.vague && ctx.step.agent === "research") return "blocked";
  return "completed";
}

function confidenceOf(ctx: Ctx, status: AgentContractStatus) {
  let score = BASE_CONFIDENCE[ctx.step.agent] ?? 0.8;
  if (ctx.run.analysis.risk === "critical") score -= 0.04;
  if (ctx.run.analysis.risk === "low") score += 0.02;
  if (status === "failed") score = Math.min(score, 0.42);
  if (status === "blocked") score = Math.min(score, 0.55);
  return Math.round(Math.min(0.99, Math.max(0.4, score)) * 100) / 100;
}

function evidenceOf(artifact: Artifact) {
  const bullets = artifact.sections.flatMap((section) => section.bullets);
  const fromFindings = artifact.findings.map((item) => `${item.title}: ${item.detail}`);
  const items = unique([...bullets, ...fromFindings, artifact.summary]);
  return items.slice(0, 8);
}

function nextActions(ctx: Ctx, artifact: Artifact) {
  if (ctx.step.agent === "pr") return ["Do not merge."];
  const steps = ctx.run.plan.steps;
  const index = steps.findIndex((step) => step.id === ctx.step.id);
  const later = index >= 0 ? steps.slice(index + 1) : [];
  const nextWave = later.find((step) => step.wave !== ctx.step.wave);
  const nxt = nextWave ?? later[0];
  if (nxt) return unique([`${nxt.label} next.`, artifact.recommendation]);
  return unique([artifact.recommendation, "Stop."]);
}

export function buildContractOutput(ctx: Ctx, artifact: Artifact): AgentContractOutput {
  const status = statusOf(ctx, artifact);
  const state = ctx.run.state;
  const files =
    ctx.step.agent === "implement" && ctx.run.analysis.asksForChange
      ? filesForTrack(ctx.run.analysis, ctx.step.track)
      : ctx.step.agent === "merge" || ctx.step.agent === "pr" || ctx.step.agent === "pr_review"
        ? [...(state?.files_changed ?? [])]
        : [];
  const tests =
    ctx.step.agent === "tests"
      ? unique(
          artifact.sections
            .filter((section) => /must pass|cases|must fail/i.test(section.heading))
            .flatMap((section) => section.bullets),
        )
      : ctx.step.agent === "merge"
        ? [...(state?.tests ?? [])]
        : [];
  const risks = unique([
    ...artifact.findings.map((item) => item.title),
    ...(ctx.step.agent === "security" ? (state?.security_findings ?? []).map((item) => item.title) : []),
  ]);
  return {
    status,
    confidence: confidenceOf(ctx, status),
    result: artifact.summary.trim() || artifact.title,
    evidence: evidenceOf(artifact),
    artifacts: unique([artifact.title, ...files]),
    risks,
    findings: artifact.findings.map((item) => ({ severity: item.severity, title: item.title })),
    files_changed: files,
    tests_added: tests,
    recommendations: unique([artifact.recommendation]),
    next: nextActions(ctx, artifact),
  };
}

export function fulfillContract(ctx: Ctx, artifact: Artifact): Artifact {
  const contract: AgentContract = {
    agent: artifact.agent,
    input: buildContractInput(ctx),
    output: buildContractOutput(ctx, artifact),
  };
  const next = { ...artifact, contract };
  return { ...next, evidence: assessArtifact(ctx, next) };
}

export function compactContract(contract: AgentContract) {
  return {
    status: contract.output.status,
    confidence: contract.output.confidence,
    findings: contract.output.findings,
    files_changed: contract.output.files_changed,
    tests_added: contract.output.tests_added,
    risks: contract.output.risks,
    recommendations: contract.output.recommendations,
    evidence: contract.output.evidence,
    next: contract.output.next,
  };
}

export function contractHeld(artifact: Pick<Artifact, "summary" | "title" | "recommendation" | "contract">) {
  const output = artifact.contract?.output;
  if (!output) return false;
  if (isBareDone(output.result) || isBareDone(artifact.summary) || isBareDone(artifact.title)) return false;
  if (output.confidence <= 0 || output.confidence > 1) return false;
  if (!output.status) return false;
  if (output.evidence.length === 0) return false;
  if (output.next.length === 0) return false;
  return true;
}

export const CONTRACT_SCHEMA = {
  input: ["task", "context", "constraints", "repository"],
  output: [
    "status",
    "confidence",
    "findings",
    "files_changed",
    "tests_added",
    "risks",
    "recommendations",
    "evidence",
    "next",
  ],
} as const;
