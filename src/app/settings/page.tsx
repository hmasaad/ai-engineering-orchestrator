"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";

type Status = {
  mode: string;
  model: string;
  offline: boolean;
  deterministic: boolean;
  gemini: { enabled: boolean; reason: string };
  learnings?: { seed: number; live: number; total: number };
};

export default function SettingsPage() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    void fetch("/api/status")
      .then((response) => response.json())
      .then((body: Status) => setStatus(body))
      .catch(() => setStatus(null));
  }, []);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">Studio</p>
        <h1 className="mt-2 font-serif text-4xl text-navy">Settings</h1>
        <p className="mt-4 text-ink-soft">
          Classification, planning, specialist artifacts, and evals are deterministic. A model key
          is not required. That is the point: the orchestrator does not immediately ask one LLM to
          solve the ticket.
        </p>
        <div className="mt-8 rounded-2xl border border-rule bg-white/70 p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
            Offline runtime
          </p>
          <p className="mt-2 font-serif text-2xl text-navy">
            {status?.offline ? "Works with no internet" : "Local control plane"}
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            Google Gemini is not wired and is not required. Task understanding, routing, specialists,
            and the quality gate all run on this machine. If there is no network, the same plan
            still runs.
          </p>
          <p className="mt-3 text-sm text-ink-soft">
            {status?.gemini.reason ??
              "No Gemini key. Task understanding, routing, specialists, and local RAG all run on this machine."}
          </p>
          {status?.learnings ? (
            <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-navy">
              Local RAG · {status.learnings.seed} seed · {status.learnings.live} live ·{" "}
              {status.learnings.total} total
            </p>
          ) : null}
        </div>
        <div className="mt-8 rounded-2xl border border-rule bg-white/70 p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
            Local learnings
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            After a live run, a short lesson is stored in <code>data/learnings.json</code> on this
            machine. The next similar ticket retrieves those notes (token overlap plus type/area
            boost). Retrieved notes cannot skip Security, evals, or a human gate. Eval suite runs
            stay seed-only and do not write the file.
          </p>
        </div>
        <div className="mt-8 rounded-2xl border border-rule bg-white/70 p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
            Specialist adapters
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            This control plane is built to sit in front of the agents you already have. Wire later:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            <li>Requirements Agent / Architect / Security / Database / Performance / Developer / Testing / PR Reviewer</li>
            <li>Bug Investigation → local bug investigator</li>
            <li>Security Agent → security reviewer</li>
            <li>PR Reviewer → PR reviewer</li>
            <li>Research / Tech Debt → their own reports</li>
          </ul>
          <p className="mt-4 text-sm text-ink-soft">
            Until those adapters are connected, each specialist writes into shared agent state so
            the next agent can read requirements, architecture, findings, files, tests, and review.
          </p>
        </div>
        <div className="mt-8 rounded-2xl border border-rule bg-white/70 p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
            Guardrails
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            Deterministic checks refuse prompt injection, agent hijacking, tool abuse, unauthorized
            merge/deploy, data exfiltration, malicious repository content, and untrusted MCP tools.
            The orchestrator never merges.
          </p>
        </div>
      </main>
    </div>
  );
}
