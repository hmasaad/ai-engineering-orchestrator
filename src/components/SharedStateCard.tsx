import { compactState, isFilled } from "@/lib/state";
import type { SharedAgentState } from "@/lib/types";

function sliceTone(filled: boolean) {
  return filled
    ? "border-navy bg-navy text-paper"
    : "border-dashed border-rule text-ink-soft";
}

export function SharedStateCard({
  state,
  live = false,
}: {
  state: SharedAgentState;
  live?: boolean;
}) {
  const compact = compactState(state);
  const slices: { key: string; filled: boolean; label: string }[] = [
    { key: "requirements", filled: isFilled(compact.requirements), label: "requirements" },
    { key: "architecture", filled: isFilled(compact.architecture), label: "architecture" },
    { key: "files_changed", filled: compact.files_changed.length > 0, label: "files_changed" },
    {
      key: "security_findings",
      filled: compact.security_findings.length > 0,
      label: "security_findings",
    },
    { key: "tests", filled: compact.tests.length > 0, label: "tests" },
    { key: "review", filled: isFilled(compact.review), label: "review" },
    { key: "merged", filled: isFilled(compact.merged), label: "merged" },
  ];

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        5. Shared agent state
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">
        {live ? "Agents are writing to one blackboard" : "Empty until specialists run"}
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Later agents read this object. They do not start from a blank prompt.
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {slices.map((item) => (
          <span
            key={item.key}
            className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${sliceTone(item.filled)}`}
          >
            {item.label}
          </span>
        ))}
        <span className="rounded-full border border-rule bg-paper px-2.5 py-0.5 font-mono text-[11px] text-navy">
          {compact.status}
        </span>
      </div>
      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(compact, null, 2)}
      </pre>
    </section>
  );
}
