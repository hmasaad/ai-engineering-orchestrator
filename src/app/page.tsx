"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AgentGraph } from "@/components/AgentGraph";
import { AgentProgress } from "@/components/AgentProgress";
import { AppHeader } from "@/components/AppHeader";
import { PlanView } from "@/components/PlanView";
import { TaskAnalysisCard } from "@/components/TaskAnalysisCard";
import { describeStep, readSse } from "@/lib/client";
import { classifyTicket } from "@/lib/classify";
import { buildPlan } from "@/lib/plan";
import { LOGOUT_TICKET, SAMPLE_TICKETS } from "@/lib/samples";
import { saveRun } from "@/lib/storage";
import type { AgentId, AgentStepEvent, OrchestrationRun } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [ticket, setTicket] = useState(LOGOUT_TICKET);
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<AgentStepEvent | null>(null);
  const [completed, setCompleted] = useState<AgentId[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const analysis = useMemo(() => classifyTicket(ticket), [ticket]);
  const plan = useMemo(() => buildPlan(analysis), [analysis]);

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("sample");
    const sample = SAMPLE_TICKETS.find((item) => item.id === id);
    if (sample) setTicket(sample.ticket);
  }, []);

  async function run() {
    setError(null);
    setRunning(true);
    setCompleted([]);
    setCurrent(null);
    setMessage("Orchestrator understanding the ticket…");

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticket }),
      });
      if (!response.ok && response.headers.get("content-type")?.includes("application/json")) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error || "Run failed.");
      }

      let last: OrchestrationRun | null = null;
      await readSse(response, (event, data) => {
        if (event === "step") {
          const step = data as AgentStepEvent;
          setCurrent(step);
          setMessage(describeStep(step));
        }
        if (event === "artifact") {
          const runData = data as OrchestrationRun;
          last = runData;
          setCompleted(runData.artifacts.map((item) => item.agent));
        }
        if (event === "run") {
          last = data as OrchestrationRun;
        }
        if (event === "error") {
          const payload = data as { message?: string };
          setError(payload.message || "Run failed.");
        }
      });

      if (last) {
        saveRun(last);
        router.push("/run");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto grid max-w-6xl gap-10 px-6 py-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-blueprint">
            Multi-agent engineering workflow
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight text-navy">
            Don&apos;t ask one model to solve the ticket.
          </h1>
          <p className="mt-4 max-w-xl text-ink-soft">
            The orchestrator reads the work, names the task type and risk, then builds an execution
            plan across Bug Investigation, Research, Architect, Security, Tests, Evals, and PR
            Review. High-risk work stops for a human.
          </p>

          <label className="mt-8 block">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
              Ticket
            </span>
            <textarea
              value={ticket}
              onChange={(event) => setTicket(event.target.value)}
              rows={8}
              className="mt-1 w-full rounded-2xl border border-rule bg-white/80 px-4 py-3 text-sm outline-none focus:border-navy"
              placeholder='Example: "Users are getting logged out randomly after upgrading the app."'
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            {SAMPLE_TICKETS.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => setTicket(sample.ticket)}
                className={`rounded-full border px-3 py-1 text-xs ${
                  ticket === sample.ticket
                    ? "border-navy bg-navy text-paper"
                    : "border-rule text-ink-soft hover:border-navy hover:text-navy"
                }`}
              >
                {sample.label}
              </button>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void run()}
              disabled={running || !ticket.trim()}
              className="rounded-full bg-navy px-5 py-2.5 text-sm text-paper disabled:opacity-50"
            >
              {running ? "Running plan…" : "Run plan"}
            </button>
            <button
              type="button"
              onClick={() => setTicket(LOGOUT_TICKET)}
              className="rounded-full border border-rule px-5 py-2.5 text-sm text-ink-soft"
            >
              Load logout bug
            </button>
          </div>

          {error && <p className="mt-4 text-sm text-stamp">{error}</p>}
          <div className="mt-4">
            <AgentProgress current={current} message={message} running={running} />
          </div>

          <div className="mt-8 grid gap-4">
            <TaskAnalysisCard analysis={analysis} />
            <PlanView plan={plan} />
          </div>
        </div>

        <aside className="rounded-2xl border border-rule bg-white/60 p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
            Dispatch graph
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            The graph is the plan for this ticket, not a fixed pipeline.
          </p>
          <div className="mt-6">
            <AgentGraph
              plan={plan}
              current={current?.agent ?? null}
              completed={completed}
              running={running}
            />
          </div>
        </aside>
      </main>
    </div>
  );
}
