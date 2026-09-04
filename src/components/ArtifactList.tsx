import { AGENTS } from "@/lib/roster";
import type { Artifact } from "@/lib/types";

const SEV: Record<string, string> = {
  blocker: "text-stamp",
  should_fix: "text-copper",
  nit: "text-ink-soft",
};

export function ArtifactList({ artifacts }: { artifacts: Artifact[] }) {
  if (artifacts.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-rule px-4 py-8 text-center text-sm text-ink-soft">
        Artifacts appear as each specialist finishes.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {artifacts.map((artifact) => (
        <article key={artifact.agent} className="rounded-2xl border border-rule bg-white/70 p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
            {AGENTS[artifact.agent].label}
          </p>
          <h2 className="mt-1 font-serif text-2xl text-navy">{artifact.title}</h2>
          <p className="mt-2 text-sm text-ink-soft">{artifact.summary}</p>
          <div className="mt-4 grid gap-4">
            {artifact.sections.map((section) => (
              <div key={section.heading}>
                <h3 className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                  {section.heading}
                </h3>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {artifact.findings.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-rule pt-4">
              {artifact.findings.map((finding) => (
                <li key={finding.title} className="text-sm">
                  <span className={`font-mono text-[10px] uppercase ${SEV[finding.severity]}`}>
                    {finding.severity}
                  </span>{" "}
                  <strong className="font-medium">{finding.title}.</strong> {finding.detail}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm text-navy">{artifact.recommendation}</p>
        </article>
      ))}
    </div>
  );
}
