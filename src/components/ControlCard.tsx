import type { ControlPolicy } from "@/lib/types";

export function ControlCard({ control }: { control: ControlPolicy }) {
  const human = control.gates.length > 0;

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        9. Human approval / action
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">
        {control.autonomous ? "Action is automatic after the gate" : "Human, then Action"}
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Quality gate first. Then a human only when the Risk Engine says HIGH or CRITICAL. Action is
        opening a PR — never a merge.
      </p>

      {control.kinds.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {control.kinds.map((kind) => (
            <span
              key={kind}
              className="rounded-full border border-copper/40 bg-copper/10 px-2.5 py-0.5 font-mono text-[11px] text-copper"
            >
              {kind}
            </span>
          ))}
        </div>
      ) : null}

      <ol className="mt-4 space-y-0">
        {["Result Merger", "Quality Gate", "Human Approval", "Action"].map((phase, index) => {
          const isHuman = phase === "Human Approval";
          const lit = isHuman ? human : true;
          return (
            <li key={phase} className="flex flex-col">
              {index > 0 ? (
                <span className={`ml-3 h-3 w-px ${lit ? "bg-copper/40" : "bg-rule"}`} aria-hidden />
              ) : null}
              <span
                className={`w-fit rounded-full border px-3 py-1 font-mono text-[12px] ${
                  isHuman && lit
                    ? "border-copper bg-copper/15 text-copper"
                    : isHuman
                      ? "border-dashed border-rule text-ink-soft line-through decoration-ink-soft/50"
                      : phase === "Action"
                        ? "border-navy bg-navy text-paper"
                        : "border-rule bg-paper text-navy"
                }`}
              >
                {isHuman ? `[${phase}]` : phase}
              </span>
            </li>
          );
        })}
      </ol>

      {control.gates.length > 0 ? (
        <ul className="mt-4 space-y-1.5 border-t border-rule pt-4">
          {control.gates.map((item) => (
            <li key={item.id} className="text-sm text-ink-soft">
              <span className="font-medium text-navy">{item.label}</span>
              {" — "}
              {item.reason}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-sage">No human gate. LOW/MEDIUM Action proceeds if evals PASS.</p>
      )}

      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(
          {
            autonomous: control.autonomous,
            risk: control.risk,
            action: control.action,
            kinds: control.kinds,
            gates: control.gates.map((item) => ({ id: item.id, before: item.before })),
          },
          null,
          2,
        )}
      </pre>
    </section>
  );
}
