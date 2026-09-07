import { compactContract } from "@/lib/contract";
import { AGENTS } from "@/lib/roster";
import type { Artifact } from "@/lib/types";

const SEV: Record<string, string> = {
  blocker: "text-stamp",
  should_fix: "text-copper",
  nit: "text-ink-soft",
};

const STATUS: Record<string, string> = {
  completed: "border-navy bg-navy text-paper",
  failed: "border-stamp bg-stamp/15 text-stamp",
  blocked: "border-copper bg-copper/10 text-copper",
  needs_human: "border-copper bg-copper/10 text-copper",
};

export function ArtifactList({ artifacts }: { artifacts: Artifact[] }) {
  if (artifacts.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-rule px-4 py-8 text-center text-sm text-ink-soft">
        Artifacts appear as each specialist finishes. Each one carries a contract — not “Done.”
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {artifacts.map((artifact, index) => {
        const output = artifact.contract?.output;
        return (
          <article
            key={artifact.stepId ?? `${artifact.agent}-${index}`}
            className="rounded-2xl border border-rule bg-white/70 p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
                {AGENTS[artifact.agent].label}
                {artifact.track ? ` · ${artifact.track}` : ""}
              </p>
              {output ? (
                <span
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${
                    STATUS[output.status] ?? "border-rule text-ink-soft"
                  }`}
                >
                  {output.status.replace("_", " ")} · {output.confidence}
                </span>
              ) : null}
            </div>
            <h2 className="mt-1 font-serif text-2xl text-navy">{artifact.title}</h2>
            <p className="mt-2 text-sm text-ink-soft">{artifact.summary}</p>

            {artifact.contract ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-rule bg-paper/70 px-3 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                    Input
                  </p>
                  <p className="mt-2 text-sm text-navy">{artifact.contract.input.task}</p>
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-[12px] text-ink-soft">
                    {artifact.contract.input.constraints.slice(0, 3).map((item, itemIndex) => (
                      <li key={`${itemIndex}-${item}`}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-xl border border-rule bg-paper/70 px-3 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                    Output
                  </p>
                  <p className="mt-2 text-sm text-navy">{output?.result}</p>
                  <p className="mt-2 font-mono text-[11px] text-ink-soft">
                    Next: {output?.next.join(" ") ?? "—"}
                  </p>
                </div>
              </div>
            ) : null}

            {artifact.evidence ? (
              <ul className="mt-3 space-y-1 text-[12px]">
                <li className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">
                  Evidence · {artifact.evidence.verdict}
                </li>
                {artifact.evidence.items.map((row) => (
                  <li key={row.id} className={row.held ? "text-navy" : "text-ink-soft"}>
                    {row.held ? "✓" : "○"} {row.label}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-4 grid gap-4">
              {artifact.sections.map((section) => (
                <div key={section.heading}>
                  <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                    {section.heading}
                  </h3>
                  <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
                    {section.bullets.map((bullet, bulletIndex) => (
                      <li key={`${section.heading}-${bulletIndex}`}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            {artifact.findings.length > 0 && (
              <ul className="mt-4 space-y-2 border-t border-rule pt-4">
                {artifact.findings.map((finding, findingIndex) => (
                  <li key={`${findingIndex}-${finding.title}`} className="text-sm">
                    <span className={`font-mono text-[10px] uppercase ${SEV[finding.severity]}`}>
                      {finding.severity}
                    </span>{" "}
                    <strong className="font-medium">{finding.title}.</strong> {finding.detail}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-sm text-navy">{artifact.recommendation}</p>
            {artifact.contract ? (
              <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
                {JSON.stringify(compactContract(artifact.contract), null, 2)}
              </pre>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
