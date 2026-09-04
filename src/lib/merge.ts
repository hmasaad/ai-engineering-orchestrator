import type { MergedResult, SharedAgentState, SharedReview } from "./types";

function filled(value: object | unknown[] | undefined): boolean {
  if (value == null) return false;
  if (Array.isArray(value)) return value.length > 0;
  return Object.keys(value).length > 0;
}

export function compactMerge(state: SharedAgentState): MergedResult {
  const blockers = (state.security_findings ?? []).filter((item) => item.severity === "blocker");
  return {
    files_changed: [...(state.files_changed ?? [])],
    tests: [...(state.tests ?? [])],
    security_findings: [...(state.security_findings ?? [])],
    review: filled(state.review) ? (state.review as SharedReview) : {},
    recommendation: blockers.length > 0 ? "hold" : "quality_gate",
  };
}

export function isMerged(value: SharedAgentState["merged"]): value is MergedResult {
  return filled(value);
}
