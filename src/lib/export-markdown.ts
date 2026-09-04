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
- Affected area: ${run.analysis.area}
- Required agents: ${run.analysis.requiredAgents.map((id) => AGENTS[id].label).join(", ")}

${run.analysis.summary}

## Execution plan

${run.plan.principle}

${steps}

Human approval: ${run.plan.humanApprovalRequired ? run.plan.approvalReason : "not required"}

## Quality gate

Score ${run.quality.score}. ${run.quality.ready ? "Ready." : "Not ready."} ${run.quality.errorCount} errors.

## Artifacts

${artifacts || "_No artifacts yet._"}

## Status

${run.status}${run.approval ? ` — ${run.approval.decision}${run.approval.note ? `: ${run.approval.note}` : ""}` : ""}
`;
}
