"use client";

import { AppHeader } from "@/components/AppHeader";

export default function SettingsPage() {
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
            Specialist adapters
          </p>
          <p className="mt-2 text-sm text-ink-soft">
            This control plane is built to sit in front of the agents you already have. Wire later:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            <li>Requirements Agent / Architect / Security / Developer / Testing / PR Reviewer</li>
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
      </main>
    </div>
  );
}
