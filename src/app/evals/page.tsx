"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { RUBRIC_DIMENSIONS } from "@/lib/eval/rubric";

type Assertion = {
  id: string;
  dimension: string;
  label: string;
  pass: boolean;
  detail: string;
};

type Dimension = {
  id: string;
  label: string;
  weight: number;
  score: number;
  passed: number;
  total: number;
};

type CaseResult = {
  kind: "gold" | "attack";
  ok: boolean;
  label?: string;
  score: {
    scenarioId: string;
    score: number;
    dimensions: Dimension[];
    assertions: Assertion[];
  };
};

type ScenarioResult = {
  id: string;
  label: string;
  expected: string;
  ticket: string;
  gold: CaseResult;
  attacks: CaseResult[];
  ok: boolean;
};

type Suite = {
  passed: boolean;
  samples: { id: string; ok: boolean; score: number; ready: boolean; errors: string[] }[];
  scenarios: ScenarioResult[];
};

function Bar({ value, tone }: { value: number; tone: "gold" | "attack" | "neutral" }) {
  const color =
    tone === "gold" ? "bg-sage" : tone === "attack" ? "bg-stamp" : "bg-blueprint";
  return (
    <div className="h-2 overflow-hidden rounded-full bg-rule">
      <div className={`h-full ${color}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export default function EvalsPage() {
  const [suite, setSuite] = useState<Suite | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/evals")
      .then(async (response) => {
        if (!response.ok) throw new Error("Eval suite failed to load.");
        setSuite((await response.json()) as Suite);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Eval suite failed."));
  }, []);

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
          Quality gate
        </p>
        <h1 className="mt-2 font-serif text-4xl text-navy">Orchestrator evals</h1>
        <p className="mt-4 max-w-2xl text-ink-soft">
          This is not another prompt. Gold tickets must route to the right specialists in the right
          order. Attack plans — skip security, skip the human, one-shot a fix — must fail.
        </p>

        {error && <p className="mt-6 text-sm text-stamp">{error}</p>}
        {!suite && !error && <p className="mt-6 text-ink-soft">Scoring…</p>}

        {suite && (
          <>
            <p className={`mt-6 font-mono text-sm ${suite.passed ? "text-sage" : "text-stamp"}`}>
              {suite.passed ? "PASS" : "FAIL"} · {suite.scenarios.filter((item) => item.ok).length}/
              {suite.scenarios.length} scenarios · samples{" "}
              {suite.samples.filter((item) => item.ok).length}/{suite.samples.length}
            </p>

            <ul className="mt-6 flex flex-wrap gap-3 text-xs text-ink-soft">
              {RUBRIC_DIMENSIONS.map((dim) => (
                <li key={dim.id}>
                  {dim.label} · {dim.weight}%
                </li>
              ))}
            </ul>

            <div className="mt-8 grid gap-6">
              {suite.scenarios.map((scenario) => (
                <article key={scenario.id} className="rounded-2xl border border-rule bg-white/70 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="font-serif text-2xl text-navy">{scenario.label}</h2>
                      <p className="mt-1 text-sm text-ink-soft">{scenario.expected}</p>
                      <p className="mt-2 font-mono text-xs text-ink-soft">{scenario.ticket}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono text-xs uppercase ${scenario.ok ? "text-sage" : "text-stamp"}`}>
                        {scenario.ok ? "pass" : "fail"}
                      </span>
                      <Link
                        href={`/?sample=${scenario.id}`}
                        className="rounded-full border border-rule px-3 py-1 text-xs text-ink-soft"
                      >
                        Open ticket
                      </Link>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-rule bg-paper/70 p-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                        Gold
                      </p>
                      <p className="font-serif text-3xl text-navy">{scenario.gold.score.score}</p>
                      <Bar value={scenario.gold.score.score} tone="gold" />
                      <p className={`mt-2 font-mono text-[11px] uppercase ${scenario.gold.ok ? "text-sage" : "text-stamp"}`}>
                        {scenario.gold.ok ? "pass" : "fail"}
                      </p>
                      <ul className="mt-3 space-y-1">
                        {scenario.gold.score.assertions
                          .filter((item) => !item.pass)
                          .map((item) => (
                            <li key={item.id} className="text-xs text-stamp">
                              {item.detail}
                            </li>
                          ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-rule bg-paper/70 p-4">
                      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-soft">
                        Attacks
                      </p>
                      <ul className="mt-2 space-y-2">
                        {scenario.attacks.map((attack) => (
                          <li key={attack.score.scenarioId} className="text-sm">
                            <span className={attack.ok ? "text-sage" : "text-stamp"}>
                              {attack.ok ? "caught" : "missed"}
                            </span>{" "}
                            {attack.label} · score {attack.score.score}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
