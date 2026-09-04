import { AGENTS } from "./roster";
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
      return `## ${AGENTS[artifact.agent].label}: ${artifact.title}\n\n${artifact.summary}\n\n${sections}\n\n*${artifact.recommendation}*`;
    })
    .join("\n\n");

  return `# Engineering Orchestrator

**Ticket:** ${run.ticket}

## Understand

- Task type: ${run.analysis.taskTypeLabel}
- Risk: ${run.analysis.risk}
- Affected areas: ${run.analysis.areas.join(", ")}
- Repository: ${run.input.repository ?? "—"}
- Branch: ${run.input.branch ?? "—"}

${run.analysis.summary}

## Route

- Pattern: ${run.analysis.route?.pattern ?? "—"}
- Agents: ${run.analysis.route?.routing.agents.join(" → ") ?? run.analysis.requiredAgents.map((id) => AGENTS[id].label).join(" → ")}

The router picks specialists for this ticket. It is not a fixed pipeline.

## Shared state

${"```json\n" + JSON.stringify(run.state ?? {}, null, 2) + "\n```"}

Agents read and write this blackboard. Empty objects mean that specialist has not run.

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
