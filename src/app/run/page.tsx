"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AgentGraph } from "@/components/AgentGraph";
import { AgentRouterCard } from "@/components/AgentRouterCard";
import { AppHeader } from "@/components/AppHeader";
import { ApprovalGate } from "@/components/ApprovalGate";
import { ArtifactList } from "@/components/ArtifactList";
import { ControlCard } from "@/components/ControlCard";
import { PlanView } from "@/components/PlanView";
import { QualityReport } from "@/components/QualityReport";
import { SharedStateCard } from "@/components/SharedStateCard";
import { TaskAnalysisCard } from "@/components/TaskAnalysisCard";
import { applyApproval } from "@/lib/orchestrate";
import { fetchLatest, loadRun, saveRun } from "@/lib/storage";
import type { OrchestrationRun } from "@/lib/types";

export default function RunPage() {
  const [run, setRun] = useState<OrchestrationRun | null>(null);

  useEffect(() => {
    const local = loadRun();
    if (local) setRun(local);
    void fetchLatest().then((latest) => {
      if (latest) {
        setRun(latest);
        saveRun(latest);
      }
    });
  }, []);

  function onDecide(decision: "approved" | "rejected", note: string) {
    if (!run) return;
    const next = applyApproval(run, decision, note);
    setRun(next);
    saveRun(next);
    void fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run: next }),
    });
  }

  async function exportMarkdown() {
    if (!run) return;
    const response = await fetch("/api/export/markdown", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run }),
    });
    const text = await response.text();
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${run.id}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        {!run ? (
          <p className="text-ink-soft">
            No run yet. Start from a ticket on the{" "}
            <Link className="text-blueprint underline" href="/">
              new ticket
            </Link>{" "}
            page.
          </p>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="grid gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
                    {run.status.replace("_", " ")}
                  </p>
                  <h1 className="font-serif text-4xl text-navy">Run briefing</h1>
                  <p className="mt-2 max-w-2xl text-ink-soft">{run.ticket}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void exportMarkdown()}
                  className="rounded-full border border-rule px-4 py-2 text-sm text-ink-soft"
                >
                  Export markdown
                </button>
              </div>
              <TaskAnalysisCard analysis={run.analysis} />
              {run.analysis.route ? <AgentRouterCard route={run.analysis.route} /> : null}
              {run.state ? <SharedStateCard state={run.state} live /> : null}
              {run.plan.control ? <ControlCard control={run.plan.control} /> : null}
              <PlanView plan={run.plan} />
              <QualityReport report={run.quality} />
              <ApprovalGate run={run} onDecide={onDecide} />
              <ArtifactList artifacts={run.artifacts} />
            </div>
            <aside className="h-fit rounded-2xl border border-rule bg-white/60 p-5 lg:sticky lg:top-6">
              <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
                Plan graph
              </p>
              <div className="mt-4">
                <AgentGraph
                  plan={run.plan}
                  current={null}
                  completed={run.artifacts.map((item) => item.agent)}
                  running={false}
                />
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
