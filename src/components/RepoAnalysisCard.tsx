import type { RepoAnalysis } from "@/lib/types";

const BLAST: Record<RepoAnalysis["blastRadius"], string> = {
  local: "Local files only",
  service: "One service or module",
  "cross-cutting": "Cross-cutting — auth, payments, or production",
};

export function RepoAnalysisCard({ repo }: { repo: RepoAnalysis }) {
  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        3. Repository analysis
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">{BLAST[repo.blastRadius]}</p>
      <p className="mt-2 text-sm text-ink-soft">
        {repo.repository} · {repo.branch}. Inferred from the ticket and areas — no clone, no
        internet.
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {repo.areas.map((area) => (
          <span
            key={area}
            className="rounded-full border border-rule bg-paper px-2.5 py-0.5 font-mono text-[11px] text-navy"
          >
            {area}
          </span>
        ))}
        <span className="rounded-full border border-navy bg-navy px-2.5 py-0.5 font-mono text-[11px] text-paper">
          {repo.blastRadius}
        </span>
      </div>
      <ul className="mt-4 space-y-1.5 text-sm text-ink-soft">
        {repo.files.map((file) => (
          <li key={file} className="font-mono text-[12px] text-navy">
            {file}
          </li>
        ))}
      </ul>
      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(
          { repository: repo.repository, branch: repo.branch, files: repo.files, blastRadius: repo.blastRadius },
          null,
          2,
        )}
      </pre>
    </section>
  );
}
