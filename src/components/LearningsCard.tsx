"use client";

import { retrieveLearnings } from "@/lib/rag";
import type { TaskAnalysis } from "@/lib/types";

export function LearningsCard({ ticket, analysis }: { ticket: string; analysis: TaskAnalysis }) {
  const hits = retrieveLearnings(ticket, analysis);

  return (
    <section className="rounded-2xl border border-rule bg-white/70 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-blueprint">
        Local RAG · offline
      </p>
      <p className="mt-2 font-serif text-2xl text-navy">Learnings from previous runs</p>
      <p className="mt-2 text-sm text-ink-soft">
        No Gemini and no internet required. Similar past tickets stay on this machine and specialists
        read them. Retrieved notes cannot change routing or skip a gate.
      </p>
      {hits.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">No close match in the local store yet.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {hits.map((hit) => (
            <li key={hit.id} className="rounded-xl border border-rule bg-paper/80 p-3">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-soft">
                {hit.pattern} · {hit.risk} · score {Math.round(hit.score)}
              </p>
              <p className="mt-1 text-sm text-navy">{hit.ticket}</p>
              {hit.lessons[0] ? <p className="mt-1 text-xs text-ink-soft">{hit.lessons[0]}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
