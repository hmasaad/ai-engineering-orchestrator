"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AgentGraph } from "@/components/AgentGraph";
import { AgentProgress } from "@/components/AgentProgress";
import { AgentRouterCard } from "@/components/AgentRouterCard";
import { AppHeader } from "@/components/AppHeader";
import { ControlCard } from "@/components/ControlCard";
import { EvalGateCard } from "@/components/EvalGateCard";
import { GuardrailsCard } from "@/components/GuardrailsCard";
import { LearningsCard } from "@/components/LearningsCard";
import { PlanView } from "@/components/PlanView";
import { PlannerCard } from "@/components/PlannerCard";
import { ResultMergerCard } from "@/components/ResultMergerCard";
import { RiskEngineCard } from "@/components/RiskEngineCard";
import { SharedStateCard } from "@/components/SharedStateCard";
import { TaskAnalysisCard } from "@/components/TaskAnalysisCard";
import { describeStep, readSse } from "@/lib/client";
import { understandTask } from "@/lib/classify";
import { buildPlan } from "@/lib/plan";
import { compactGate, evaluatePlan } from "@/lib/quality";
import { SAMPLE_TICKETS, sampleToInput } from "@/lib/samples";
import { draftState } from "@/lib/state";
import { saveRun } from "@/lib/storage";
import type { AgentId, AgentStepEvent, OrchestrationRun, SharedAgentState } from "@/lib/types";

export default function HomePage() {
  const router = useRouter();
  const [ticket, setTicket] = useState("Add social login with Google");
  const [repository, setRepository] = useState("my-app");
  const [branch, setBranch] = useState("feature/google-login");
  const [running, setRunning] = useState(false);
  const [current, setCurrent] = useState<AgentStepEvent | null>(null);
  const [completed, setCompleted] = useState<AgentId[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<SharedAgentState | null>(null);

  const analysis = useMemo(
    () => understandTask({ task: ticket, repository, branch }),
    [ticket, repository, branch],
  );
  const plan = useMemo(() => buildPlan(analysis), [analysis]);
  const emptyState = useMemo(() => draftState(ticket), [ticket]);
  const draftGate = useMemo(
    () => compactGate(evaluatePlan(analysis, plan, ticket)),
    [analysis, plan, ticket],
  );

  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("sample");
    const sample = SAMPLE_TICKETS.find((item) => item.id === id);
    if (sample) {
      setTicket(sample.ticket);
      setRepository(sample.repository ?? "");
      setBranch(sample.branch ?? "");
    }
  }, []);

  useEffect(() => {
    setLiveState(null);
  }, [ticket, repository, branch]);

  async function run() {
    setError(null);
    setRunning(true);
    setCompleted([]);
    setCurrent(null);
    setLiveState(null);
    setMessage("Orchestrator understanding the ticket…");

    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task: ticket, repository, branch }),
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
        if (event === "artifact" || event === "state") {
          const runData = data as OrchestrationRun;
          last = runData;
          setCompleted(runData.artifacts.map((item) => item.agent));
          if (runData.state) setLiveState(runData.state);
        }
        if (event === "run") {
          last = data as OrchestrationRun;
          if (last.state) setLiveState(last.state);
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
            The orchestrator starts with Task Understanding, then the Agent Router picks specialists.
            The orchestrator starts with Task Understanding, then a Planner and Risk Engine run side
            by side. The router picks specialists from that risk. Results merge, evals fail closed,
            and a human is required only when risk is HIGH or CRITICAL.
          </p>

          <label className="mt-8 block">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
              Task
            </span>
            <textarea
              value={ticket}
              onChange={(event) => setTicket(event.target.value)}
              rows={5}
              className="mt-1 w-full rounded-2xl border border-rule bg-white/80 px-4 py-3 text-sm outline-none focus:border-navy"
              placeholder='Example: "Add social login with Google"'
            />
          </label>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
                Repository
              </span>
              <input
                value={repository}
                onChange={(event) => setRepository(event.target.value)}
                className="mt-1 w-full rounded-xl border border-rule bg-white/80 px-3 py-2 text-sm outline-none focus:border-navy"
                placeholder="my-app"
              />
            </label>
            <label>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
                Branch
              </span>
              <input
                value={branch}
                onChange={(event) => setBranch(event.target.value)}
                className="mt-1 w-full rounded-xl border border-rule bg-white/80 px-3 py-2 font-mono text-sm outline-none focus:border-navy"
                placeholder="feature/google-login"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {SAMPLE_TICKETS.map((sample) => (
              <button
                key={sample.id}
                type="button"
                onClick={() => {
                  const input = sampleToInput(sample);
                  setTicket(input.task);
                  setRepository(input.repository ?? "");
                  setBranch(input.branch ?? "");
                }}
                className={`rounded-full border px-3 py-1 text-xs ${
                  ticket === sample.ticket &&
                  repository === (sample.repository ?? "") &&
                  branch === (sample.branch ?? "")
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
              onClick={() => {
                setTicket("Add social login with Google");
                setRepository("my-app");
                setBranch("feature/google-login");
              }}
              className="rounded-full border border-rule px-5 py-2.5 text-sm text-ink-soft"
            >
              Load Google login
            </button>
          </div>

          {error && <p className="mt-4 text-sm text-stamp">{error}</p>}
          <div className="mt-4">
            <AgentProgress current={current} message={message} running={running} />
          </div>

          <div className="mt-8 grid gap-4">
            <TaskAnalysisCard analysis={analysis} />
            {analysis.planner ? <PlannerCard planner={analysis.planner} /> : null}
            {analysis.riskEngine ? <RiskEngineCard engine={analysis.riskEngine} /> : null}
            {analysis.route ? <AgentRouterCard route={analysis.route} /> : null}
            <SharedStateCard state={liveState ?? emptyState} live={Boolean(liveState)} />
            <LearningsCard ticket={ticket} analysis={analysis} />
            <ResultMergerCard state={liveState ?? emptyState} live={Boolean(liveState)} />
            <GuardrailsCard ticket={ticket} analysis={analysis} plan={plan} />
            <EvalGateCard gate={draftGate} />
            <ControlCard control={plan.control} />
            <PlanView plan={plan} />
          </div>
        </div>

        <aside className="rounded-2xl border border-rule bg-white/60 p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
            Dispatch graph
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            The graph is Planner + Risk Engine → specialists → merger → gate.
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
