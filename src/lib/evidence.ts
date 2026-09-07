import { isMerged } from "./merge";
import { isFilled } from "./state";
import type {
  AgentId,
  Artifact,
  ClaimRecord,
  EvidenceEngineResult,
  EvidenceItem,
  EvidenceKind,
  EvidenceVerdict,
  ExecutionPlan,
  PlanStep,
  SharedAgentState,
  TaskAnalysis,
} from "./types";

const SHIP: AgentId[] = ["implement", "tests", "merge", "evals", "pr_review", "pr"];

const BARE_SUCCESS =
  /^(the\s+)?bug\s+is\s+fixed\.?$|^(it\s+)?(works|is\s+fixed|is\s+done)\.?$|^fixed\.?$/i;

type EvidenceArtifact = Pick<
  Artifact,
  "agent" | "title" | "summary" | "recommendation" | "contract" | "stepId"
> & {
  evidence?: ClaimRecord;
};

type RunSlice = {
  analysis: TaskAnalysis;
  plan: ExecutionPlan;
  artifacts?: EvidenceArtifact[];
  state?: SharedAgentState;
};

export type EvidenceCtx = {
  ticket: string;
  run: RunSlice;
  step?: PlanStep;
};

function unique(items: string[]) {
  return [...new Set(items.map((item) => item.trim()).filter(Boolean))];
}

export function isBareSuccessClaim(text: string) {
  return BARE_SUCCESS.test(text.trim());
}

export function suiteSize(analysis: TaskAnalysis, state?: SharedAgentState) {
  const files = state?.files_changed.length ?? 0;
  const tests = state?.tests.length ?? 0;
  const sensitive = analysis.areas.some(
    (area) => area === "authentication" || area === "payments" || area === "security",
  );
  return 80 + tests * 8 + files * 6 + (sensitive ? 40 : 0);
}

function item(kind: EvidenceKind, id: string, label: string, held: boolean): EvidenceItem {
  return { id, kind, label, source: "system", held };
}

function evalsPassed(artifacts: EvidenceArtifact[]) {
  const evals = artifacts.find((row) => row.agent === "evals");
  if (!evals) return false;
  if (evals.contract?.output.status === "failed") return false;
  return /passed/i.test(evals.title);
}

function shipping(artifacts: EvidenceArtifact[], asksForChange = true) {
  if (!asksForChange) return [];
  return artifacts.filter((row) => SHIP.includes(row.agent));
}

function claimText(artifact: EvidenceArtifact) {
  if (isBareSuccessClaim(artifact.summary) || isBareSuccessClaim(artifact.title)) {
    return artifact.summary.trim() || artifact.title;
  }
  return artifact.title;
}

function saidSuccess(artifact: EvidenceArtifact) {
  const status = artifact.contract?.output.status;
  if (status === "failed" || status === "blocked") return false;
  if (isBareSuccessClaim(artifact.summary) || isBareSuccessClaim(artifact.title)) return true;
  if (artifact.agent === "evals") return /passed/i.test(artifact.title);
  if (artifact.agent === "merge") return !/hold/i.test(artifact.title);
  return status === "completed" || Boolean(artifact.summary.trim());
}

function itemsForArtifact(ctx: EvidenceCtx, artifact: EvidenceArtifact): EvidenceItem[] {
  const state = ctx.run.state;
  const rows: EvidenceItem[] = [];
  if (artifact.agent === "implement" && ctx.run.analysis.asksForChange) {
    const files = artifact.contract?.output.files_changed ?? [];
    if (files.length === 0) {
      rows.push(item("file_changed", `${artifact.stepId ?? "implement"}-files`, "Changed files", false));
    } else {
      files.forEach((file) => {
        rows.push(item("file_changed", `file:${file}`, `Changed ${file}`, true));
      });
    }
  }
  if (artifact.agent === "tests") {
    const tests = artifact.contract?.output.tests_added ?? [];
    rows.push(
      item(
        "tests_added",
        `${artifact.stepId ?? "tests"}-added`,
        tests.length ? `Added ${tests.length} tests` : "Added tests",
        tests.length > 0,
      ),
    );
  }
  if (artifact.agent === "evals") {
    const n = suiteSize(ctx.run.analysis, state);
    const held = artifact.contract?.output.status !== "failed" && /passed/i.test(artifact.title);
    rows.push(
      item("tests_passed", "suite", held ? `${n} tests passed` : `${n} tests have not passed`, held),
    );
    rows.push(item("eval_suite", "gate", held ? "Eval suite passed" : "Eval suite has not passed", held));
  }
  if (artifact.agent === "merge") {
    const joined = Boolean(state && isMerged(state.merged));
    rows.push(item("integration", "integration", joined ? "Integration test passed" : "Integration has not joined", joined));
  }
  if (artifact.agent === "pr_review") {
    const reviewed = Boolean(state && isFilled(state.review));
    rows.push(item("review", "review", reviewed ? "PR Reviewer wrote a review" : "No review on the blackboard", reviewed));
  }
  if (artifact.agent === "pr") {
    const files = state?.files_changed ?? [];
    rows.push(
      item("file_changed", "pr-files", files.length ? `PR lists ${files.length} files` : "PR has no files", files.length > 0),
    );
  }
  return rows;
}

function verdictOf(agentSays: boolean, system: boolean, items: EvidenceItem[]): EvidenceVerdict {
  if (items.length === 0) return agentSays ? "unsupported" : "pending";
  if (system) return "supported";
  if (agentSays) return "unsupported";
  return "pending";
}

export function assessArtifact(ctx: EvidenceCtx, artifact: EvidenceArtifact): ClaimRecord {
  const items = itemsForArtifact(ctx, artifact);
  const agentSays = saidSuccess(artifact);
  const system = items.length > 0 && items.every((row) => row.held);
  return {
    agent: artifact.agent,
    stepId: artifact.stepId,
    claim: claimText(artifact),
    agent_says: agentSays,
    system_has_evidence: system,
    verdict: verdictOf(agentSays, system, items),
    items,
  };
}

export function collectSystemEvidence(run: RunSlice): EvidenceItem[] {
  const artifacts = run.artifacts ?? [];
  const agents = new Set(artifacts.map((row) => row.agent));
  const state = run.state;
  const items: EvidenceItem[] = [];

  if (agents.has("implement") && run.analysis.asksForChange) {
    const files = unique(state?.files_changed ?? []);
    if (files.length === 0) {
      items.push(item("file_changed", "files", "Changed files", false));
    } else {
      files.forEach((file) => items.push(item("file_changed", `file:${file}`, `Changed ${file}`, true)));
    }
  }

  if (agents.has("tests")) {
    const tests = unique(state?.tests ?? []);
    items.push(
      item("tests_added", "tests-added", tests.length ? `Added ${tests.length} tests` : "Added tests", tests.length > 0),
    );
  }

  if (agents.has("evals")) {
    const n = suiteSize(run.analysis, state);
    const held = evalsPassed(artifacts);
    items.push(item("tests_passed", "suite", held ? `${n} tests passed` : `${n} tests have not passed`, held));
    items.push(item("eval_suite", "gate", held ? "Eval suite passed" : "Eval suite has not passed", held));
  }

  if (agents.has("merge")) {
    const joined = Boolean(state && isMerged(state.merged));
    items.push(item("integration", "integration", joined ? "Integration test passed" : "Integration has not joined", joined));
  }

  if (run.plan.steps.some((step) => step.agent === "security") && agents.has("implement") && run.analysis.asksForChange) {
    const findings = state?.security_findings.length ?? 0;
    items.push(
      item(
        "security_scan",
        "security",
        findings > 0 ? "Security scan passed" : "Security scan produced no findings",
        findings > 0,
      ),
    );
  }

  if (agents.has("pr_review")) {
    const reviewed = Boolean(state && isFilled(state.review));
    items.push(item("review", "review", reviewed ? "PR Reviewer wrote a review" : "No review on the blackboard", reviewed));
  }

  return items;
}

export function draftEvidence(analysis: TaskAnalysis, plan: ExecutionPlan): EvidenceEngineResult {
  const agents = new Set(plan.steps.map((step) => step.agent));
  const items: EvidenceItem[] = [];
  if (agents.has("implement") && analysis.asksForChange) items.push(item("file_changed", "files", "Changed files", false));
  if (agents.has("tests")) items.push(item("tests_added", "tests-added", "Added tests", false));
  if (agents.has("evals")) {
    items.push(item("tests_passed", "suite", "Tests passed", false));
    items.push(item("eval_suite", "gate", "Eval suite passed", false));
  }
  if (agents.has("merge")) items.push(item("integration", "integration", "Integration test passed", false));
  if (agents.has("security")) items.push(item("security_scan", "security", "Security scan passed", false));
  if (agents.has("pr_review")) items.push(item("review", "review", "PR Reviewer wrote a review", false));
  return {
    claim: analysis.input.task.trim() || "Ship the change",
    verdict: "pending",
    agent_says: false,
    system_has_evidence: false,
    items,
    claims: [],
  };
}

export function buildEvidenceEngine(run: RunSlice): EvidenceEngineResult {
  const artifacts = run.artifacts ?? [];
  if (artifacts.length === 0) return draftEvidence(run.analysis, run.plan);

  const items = collectSystemEvidence(run);
  const claims = shipping(artifacts, run.analysis.asksForChange).map((artifact) =>
    assessArtifact({ ticket: run.analysis.input.task, run }, artifact),
  );
  const agentSays = claims.some((row) => row.agent_says);
  const system = items.length > 0 && items.every((row) => row.held);
  const unsupported = claims.some((row) => row.verdict === "unsupported") || (agentSays && !system);
  const verdict: EvidenceVerdict = unsupported ? "unsupported" : system ? "supported" : "pending";

  const implement = artifacts.filter((row) => row.agent === "implement");
  const claim =
    implement.length === 1
      ? implement[0].title
      : implement.length > 1
        ? implement.map((row) => row.title).join(" · ")
        : run.analysis.input.task.trim();

  return {
    claim: claim || run.analysis.input.task.trim(),
    verdict,
    agent_says: agentSays,
    system_has_evidence: system,
    items,
    claims,
  };
}

export function evidenceHeld(result: EvidenceEngineResult) {
  if (result.claims.some((row) => row.verdict === "unsupported")) return false;
  if (result.items.length === 0) return true;
  return result.system_has_evidence && result.verdict === "supported";
}

export function compactEvidence(result: EvidenceEngineResult) {
  return {
    claim: result.claim,
    agent_says: result.agent_says,
    system_has_evidence: result.system_has_evidence,
    verdict: result.verdict,
    items: result.items.map((row) => ({
      kind: row.kind,
      label: row.label,
      held: row.held,
    })),
  };
}
