import { compactContract } from "./contract";
import { compactEvidence } from "./evidence";
import { formatTaskPlanTree } from "./planner";
import { AGENTS } from "./roster";
import { compactVerification } from "./verification";
import { compactRecovery } from "./recovery";
import { compactConsensus } from "./consensus";
import type { OrchestrationRun } from "./types";

export function runToMarkdown(run: OrchestrationRun) {
  const steps = run.plan.steps
    .map((step, index) => `${index + 1}. **${step.label}** — ${step.why}`)
    .join("\n");
  const artifacts = run.artifacts
    .map((artifact) => {
      const sections = artifact.sections
        .map(
          (section) =>
            `### ${section.heading}\n\n${section.bullets.map((item) => `- ${item}`).join("\n")}`,
        )
        .join("\n\n");
      const contract = artifact.contract
        ? `\n\n### Contract\n\n\`\`\`json\n${JSON.stringify(compactContract(artifact.contract), null, 2)}\n\`\`\``
        : "";
      return `## ${AGENTS[artifact.agent].label}: ${artifact.title}\n\n${artifact.summary}\n\n${sections}\n\n*${artifact.recommendation}*${contract}`;
    })
    .join("\n\n");

  const taskPlan = run.analysis.taskPlan
    ? `## Task plan\n\n\`\`\`\n${formatTaskPlanTree(run.analysis.taskPlan)}\n\`\`\`\n\n`
    : "";

  return `# Engineering Orchestrator

**Ticket:** ${run.ticket}

## Understand

- Task type: ${run.analysis.taskTypeLabel}
- Risk: ${run.analysis.risk}
- Affected areas: ${run.analysis.areas.join(", ")}
- Repository: ${run.input.repository ?? "—"}
- Branch: ${run.input.branch ?? "—"}

${run.analysis.summary}

${taskPlan}## Route

- Pattern: ${run.analysis.route?.pattern ?? "—"}
- Agents: ${run.analysis.route?.routing.agents.join(" → ") ?? run.analysis.requiredAgents.map((id) => AGENTS[id].label).join(" → ")}
- Files: ${run.plan.engineering?.repository.files.join(", ") ?? "—"}
- Tools: ${run.plan.engineering?.tools.join(", ") ?? "—"}
- Human: ${run.plan.engineering?.humanApproval.required ? "yes" : "no"}
- Success: ${run.plan.engineering?.success.map((item) => item.label).join("; ") ?? "—"}
- Decision: ${run.decision ? `${run.decision.outcome} — ${run.decision.reason}` : "pending"}

The task planner is the work breakdown. Agent selection is one step in that plan, not the whole product.

## Shared state

${"```json\n" + JSON.stringify(run.state ?? {}, null, 2) + "\n```"}

Agents read and write this blackboard. Empty slices mean that specialist has not written yet.

## Evidence engine

${run.evidence
  ? "```json\n" + JSON.stringify(compactEvidence(run.evidence), null, 2) + "\n```"
  : "_No evidence report yet._"}

A specialist claim is not proof. The Evidence Engine only treats files, tests, evals, integration, and security on the blackboard as system evidence.

## Verification loop

${run.verification
  ? "```json\n" + JSON.stringify(compactVerification(run.verification), null, 2) + "\n```"
  : "_No verification loop yet._"}

Developer is not done when code is written. Tests → Code Review → Evals, then PASS or Fix and re-run. Security stays before Developer.

## Failure recovery

${run.recovery
  ? "```json\n" + JSON.stringify(compactRecovery(run.recovery), null, 2) + "\n```"
  : "_No failure recovery yet._"}

Agents fail. The classifier names the kind and cause, then routes — compilation → Developer, environment → Infrastructure, unknown → Investigation. It does not retry the same prompt.

## Agent debate / consensus

${run.consensus
  ? "```json\n" + JSON.stringify(compactConsensus(run.consensus), null, 2) + "\n```"
  : "_No consensus yet._"}

High-risk decisions do not trust one agent. Architect, Performance, Security, and Developer debate. Consensus Engine recommends. No PR.

## Execution plan

${run.plan.principle}

${steps}

Human approval: ${run.plan.humanApprovalRequired ? run.plan.approvalReason : "not required"}

## Quality gate

Score ${run.quality.score}. ${run.quality.verdict ?? (run.quality.ready ? "PASS" : "FAIL")}. ${run.quality.errorCount} errors.

${"```json\n" + JSON.stringify(run.quality.dimensions ? {
  verdict: run.quality.verdict ?? (run.quality.ready ? "PASS" : "FAIL"),
  score: run.quality.score,
  dimensions: run.quality.dimensions,
  guardrails: run.quality.guardrails,
} : { score: run.quality.score, ready: run.quality.ready }, null, 2) + "\n```"}

## Artifacts

${artifacts || "_No artifacts yet._"}

## Status

${run.status}${run.approval ? ` — ${run.approval.decision}${run.approval.note ? `: ${run.approval.note}` : ""}` : ""}
`;
}
