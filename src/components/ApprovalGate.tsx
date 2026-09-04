"use client";

import { useState } from "react";
import type { OrchestrationRun } from "@/lib/types";

export function ApprovalGate({
  run,
  onDecide,
}: {
  run: OrchestrationRun;
  onDecide: (decision: "approved" | "rejected", note: string) => void;
}) {
  const [note, setNote] = useState("");
  const locked = run.status === "approved" || run.status === "rejected" || run.status === "complete";
  const pending = run.pendingGate;
  const label =
    pending === "plan" ? "Plan approval" : pending === "ship" ? "Ship approval" : "Human approval";

  if (!run.plan.humanApprovalRequired && run.status !== "awaiting_approval") {
    return null;
  }

  const reason =
    run.plan.control?.gates.find((item) => item.id === pending)?.reason ?? run.plan.approvalReason;

  return (
    <section className="rounded-2xl border border-copper/40 bg-white/80 p-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-copper">
        4. Human approval / control
      </p>
      <h2 className="mt-1 font-serif text-2xl text-navy">
        {run.status === "rejected"
          ? "Rejected"
          : run.status === "complete" && (run.approvals?.length ?? 0) > 0
            ? "Gates cleared"
            : run.status === "awaiting_approval"
              ? `Stop — ${label}`
              : "A person has to sign this"}
      </h2>
      <p className="mt-2 text-sm text-ink-soft">{reason}</p>
      {(run.approvals ?? []).length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm text-ink-soft">
          {run.approvals.map((item, index) => (
            <li key={`${item.gate}-${index}`}>
              {item.gate} — {item.decision}
              {item.note ? ` (${item.note})` : ""}
            </li>
          ))}
        </ul>
      ) : null}
      {locked || run.status !== "awaiting_approval" ? (
        run.status === "awaiting_approval" ? null : (
          <p className="mt-4 text-sm">
            {run.approval?.decision}
            {run.approval?.note ? ` — ${run.approval.note}` : ""}
          </p>
        )
      ) : (
        <>
          <label className="mt-4 block">
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft">
              Note
            </span>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-rule bg-paper px-3 py-2 text-sm outline-none focus:border-navy"
              placeholder="Optional: why you are approving or sending it back."
            />
          </label>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onDecide("approved", note);
                setNote("");
              }}
              className="rounded-full bg-navy px-4 py-2 text-sm text-paper"
            >
              {pending === "plan" ? "Approve plan" : pending === "ship" ? "Approve ship" : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => onDecide("rejected", note)}
              className="rounded-full border border-stamp px-4 py-2 text-sm text-stamp"
            >
              Reject
            </button>
          </div>
        </>
      )}
    </section>
  );
}
