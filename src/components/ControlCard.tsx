import { CONTROL_PHASES } from "@/lib/control";
import type { ControlPolicy, GateId } from "@/lib/types";

const PHASE_GATE: Record<string, GateId | null> = {
  Planning: null,
  "Human Approval": "plan",
  Implementation: null,
  Testing: null,
  Security: null,
  PR: null,
};

export function ControlCard({ control }: { control: ControlPolicy }) {
  const active = new Set(control.gates.map((item) => item.id));
  let humanIndex = 0;

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        4. Human approval / control
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">
        {control.autonomous ? "No ship work — no merge gate" : "Agents do not run autonomously"}
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Security Review still happens before Implementation. The second human stop is before a PR.
        Production deploys, migrations, destructive ops, dependency upgrades, and infra always gate.
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
        {CONTROL_PHASES.map((phase, index) => {
          const isHuman = phase === "Human Approval";
          const gateId = isHuman ? (humanIndex++ === 0 ? "plan" : "ship") : PHASE_GATE[phase];
          const lit = isHuman ? active.has(gateId as GateId) : true;
          return (
            <li key={`${phase}-${index}`} className="flex flex-col">
              {index > 0 ? (
                <span className={`ml-3 h-3 w-px ${lit ? "bg-copper/40" : "bg-rule"}`} aria-hidden />
              ) : null}
              <span
                className={`w-fit rounded-full border px-3 py-1 font-mono text-[12px] ${
                  isHuman && lit
                    ? "border-copper bg-copper/15 text-copper"
                    : isHuman
                      ? "border-dashed border-rule text-ink-soft line-through decoration-ink-soft/50"
                      : "border-navy bg-navy text-paper"
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
      ) : null}

      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(
          {
            autonomous: control.autonomous,
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
