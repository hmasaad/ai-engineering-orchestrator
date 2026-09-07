import { compactContract, CONTRACT_SCHEMA } from "@/lib/contract";
import type { AgentContract } from "@/lib/types";

const EXAMPLE: AgentContract = {
  agent: "implement",
  input: {
    task: "Add social login with Google",
    context: ["Feature · high · authentication, backend, mobile, security"],
    constraints: ["Security Review before Developer.", "Action is opening a PR. Never merge."],
    repository: {
      files: ["src/auth/google.ts", "ios/Auth/GoogleSignIn.swift"],
      areas: ["authentication", "backend", "mobile", "security"],
    },
  },
  output: {
    status: "completed",
    confidence: 0.86,
    result: "Verify aud/iss/expiry, link sub, and issue the app session.",
    evidence: ["Verify the Google ID token on the server.", "Do not trust the client."],
    artifacts: ["Backend Google token verify"],
    risks: [],
    findings: [],
    files_changed: ["src/auth/google.ts", "src/api/auth/google.ts"],
    tests_added: [],
    recommendations: ["Generate tests for token verify and a forged ID token."],
    next: ["Backend identity regressions next."],
  },
};

export function AgentContractCard({
  contracts = [],
  live = false,
}: {
  contracts?: AgentContract[];
  live?: boolean;
}) {
  const held = contracts.filter((item) => item.output.evidence.length > 0);
  const sample = held[0] ?? EXAMPLE;

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        Agent contract
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">
        {live
          ? `${held.length} specialist${held.length === 1 ? "" : "s"} reported structured output`
          : "No specialist returns “Done.”"}
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        Every agent takes a typed input and must return a typed output. Orchestration reads the
        contract, not a free-text sign-off.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="rounded-xl border border-rule bg-paper/80 px-3 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-soft">Input</p>
          <ul className="mt-2 space-y-1 text-sm text-navy">
            {CONTRACT_SCHEMA.input.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <p className="text-center font-mono text-[11px] text-ink-soft" aria-hidden>
          ↓
        </p>
        <div className="rounded-xl border border-navy bg-navy px-3 py-3 text-paper">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-paper/70">Output</p>
          <ul className="mt-2 space-y-1 text-sm">
            {["result", "evidence", "artifacts", "risks", "confidence", "next"].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      <pre className="mt-4 overflow-x-auto rounded-xl border border-rule bg-navy-2/5 p-3 font-mono text-[11px] leading-5 text-navy">
        {JSON.stringify(compactContract(sample), null, 2)}
      </pre>
    </section>
  );
}
