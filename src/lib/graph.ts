import type {
  AgentId,
  AreaId,
  DependencyGraph,
  GraphNodeKind,
  PlanStep,
  PublicAgentName,
  TaskAnalysis,
  TaskType,
  WorkTrack,
} from "./types";
import { isEngineeringDecision } from "./consensus";

const DYNAMIC = new Set<AgentId>(["security", "database", "performance"]);

export function shouldForkTracks(
  analysis: Pick<TaskAnalysis, "areas" | "taskType" | "vague">,
) {
  if (analysis.vague) return false;
  if (analysis.taskType === "research" || analysis.taskType === "bug" || analysis.taskType === "incident") {
    return false;
  }
  if (!analysis.areas.includes("backend") || !analysis.areas.includes("mobile")) return false;
  return analysis.taskType === "feature" || analysis.taskType === "architecture";
}

export function mobileTrackLabel(ticket: string) {
  return /flutter/i.test(ticket) ? "Flutter" : "Mobile";
}

export function isMobilePath(file: string) {
  return /^(lib|ios|android)\//.test(file) || /\.(dart|swift|kt)$/.test(file);
}

export function filesForTrack(files: string[], track?: WorkTrack) {
  if (!track || track === "shared") return files;
  const mobile = files.filter(isMobilePath);
  const backend = files.filter((file) => !isMobilePath(file));
  if (track === "mobile") return mobile.length ? mobile : files;
  return backend.length ? backend : files;
}

export function canShareWave(prev: AgentId, next: AgentId) {
  if (DYNAMIC.has(prev) && DYNAMIC.has(next)) return true;
  if ((next === "tests" || next === "pr_review") && (prev === "tests" || prev === "pr_review")) {
    return true;
  }
  return false;
}

export function groupByWave(steps: PlanStep[]): PlanStep[][] {
  const groups: PlanStep[][] = [];
  for (const step of steps) {
    const last = groups.at(-1);
    if (last && last[0]?.wave === step.wave) last.push(step);
    else groups.push([step]);
  }
  return groups;
}

function kindOf(step: PlanStep): GraphNodeKind {
  if (step.agent === "architect" || step.agent === "requirements" || step.agent === "tech_debt") {
    return "architecture";
  }
  if (step.agent === "security") return "security";
  if (step.agent === "implement" && step.track === "backend") return "backend";
  if (step.agent === "implement" && step.track === "mobile") return "mobile";
  if (step.agent === "tests") return "tests";
  if (step.agent === "merge") return "integration";
  if (step.agent === "pr_review") return "review";
  return "other";
}

export function formatForkAscii(input: {
  mobileLabel: string;
  architecture: boolean;
  security: boolean;
  tests: boolean;
}) {
  const lines: string[] = [];
  if (input.architecture) {
    lines.push("Architecture");
  }
  if (input.security) {
    if (lines.length) {
      lines.push("     │");
      lines.push("     ↓");
    }
    lines.push("  Security");
  }
  const left = "Backend";
  const right = input.mobileLabel;
  lines.push("     │");
  lines.push(" ┌───┴────────┐");
  lines.push(" ↓            ↓");
  lines.push(`${left.padEnd(13)}${right}`);
  if (input.tests) {
    lines.push(" ↓            ↓");
    lines.push(`${"Tests".padEnd(13)}Tests`);
  }
  lines.push(" └─────┬──────┘");
  lines.push("       ↓");
  lines.push("   Integration");
  lines.push("       ↓");
  lines.push("     Review");
  return lines.join("\n");
}

export function formatLinearAscii(labels: string[]) {
  if (labels.length === 0) return "(none)";
  return labels.join("\n      ↓\n");
}

export function buildTaskGraph(input: {
  ticket: string;
  agents: PublicAgentName[];
  areas: AreaId[];
  vague: boolean;
  taskType: TaskType;
}): DependencyGraph {
  const fork = shouldForkTracks({
    areas: input.areas,
    taskType: input.taskType,
    vague: input.vague,
  });
  const debate = isEngineeringDecision(input.ticket);
  const has = (id: PublicAgentName) => input.agents.includes(id);
  const mobile = mobileTrackLabel(input.ticket);
  const nodes: DependencyGraph["nodes"] = [];
  const edges: DependencyGraph["edges"] = [];
  let wave = 0;
  let prev: string[] = [];

  const add = (id: string, label: string, kind: GraphNodeKind, track?: WorkTrack, depends = prev) => {
    wave += 1;
    nodes.push({ id, label, kind, track, stepIds: [id], wave });
    for (const from of depends) edges.push({ from, to: id });
    prev = [id];
  };

  if (has("bug") || has("research") || has("rca")) {
    add("investigation", "Investigation", "other");
  }
  if (has("requirements") || has("architect") || has("tech_debt")) {
    add("architecture", "Architecture", "architecture");
  }
  if (has("database")) add("schema", "Schema", "other");
  if (has("performance")) add("performance", "Performance", "other");
  if (has("security")) add("security", "Security", "security");

  if (fork && has("developer")) {
    const stem = prev;
    wave += 1;
    nodes.push({
      id: "backend",
      label: "Backend",
      kind: "backend",
      track: "backend",
      stepIds: ["backend"],
      wave,
    });
    nodes.push({
      id: "mobile",
      label: mobile,
      kind: "mobile",
      track: "mobile",
      stepIds: ["mobile"],
      wave,
    });
    for (const from of stem) {
      edges.push({ from, to: "backend" });
      edges.push({ from, to: "mobile" });
    }
    if (has("testing")) {
      wave += 1;
      nodes.push({
        id: "tests-backend",
        label: "Tests",
        kind: "tests",
        track: "backend",
        stepIds: ["tests-backend"],
        wave,
      });
      nodes.push({
        id: "tests-mobile",
        label: "Tests",
        kind: "tests",
        track: "mobile",
        stepIds: ["tests-mobile"],
        wave,
      });
      edges.push({ from: "backend", to: "tests-backend" });
      edges.push({ from: "mobile", to: "tests-mobile" });
      prev = ["tests-backend", "tests-mobile"];
    } else {
      prev = ["backend", "mobile"];
    }
    add("integration", "Integration", "integration");
    add("review", "Review", "review");
    return {
      nodes,
      edges,
      parallel: true,
      ascii: formatForkAscii({
        mobileLabel: mobile,
        architecture: has("requirements") || has("architect") || has("tech_debt"),
        security: has("security"),
        tests: has("testing"),
      }),
    };
  }

  if (has("developer")) add("implementation", debate ? "Developer" : "Implementation", "other");
  if (has("testing")) add("tests", "Tests", "tests");
  if (debate) {
    add("consensus", "Consensus", "other");
  } else if (has("pr_reviewer") || has("developer")) {
    add("review", "Review", "review");
  }

  return {
    nodes,
    edges,
    parallel: false,
    ascii: formatLinearAscii(nodes.map((node) => node.label)),
  };
}

export function buildExecutionGraph(analysis: TaskAnalysis, steps: PlanStep[]): DependencyGraph {
  const nodes = steps.map((step) => ({
    id: step.id,
    label: step.label,
    kind: kindOf(step),
    track: step.track,
    stepIds: [step.id],
    wave: step.wave,
  }));
  const edges = steps.flatMap((step) => step.dependsOn.map((from) => ({ from, to: step.id })));
  const parallel = groupByWave(steps).some((wave) => wave.filter((step) => !step.gate).length > 1);
  const mobile = mobileTrackLabel(analysis.input.task);
  const ascii = parallel
    ? formatForkAscii({
        mobileLabel: mobile,
        architecture: steps.some((step) => step.agent === "architect" || step.agent === "requirements"),
        security: steps.some((step) => step.agent === "security"),
        tests: steps.some((step) => step.agent === "tests"),
      })
    : formatLinearAscii(steps.filter((step) => !step.gate).map((step) => step.label));
  return { nodes, edges, parallel, ascii };
}

export function reorderForkedAgents(agents: AgentId[], forked: boolean): AgentId[] {
  if (!forked) return agents;
  const next = [...agents];
  const mergeIdx = next.indexOf("merge");
  const reviewIdx = next.indexOf("pr_review");
  if (mergeIdx >= 0 && reviewIdx >= 0 && reviewIdx < mergeIdx) {
    next.splice(mergeIdx, 1);
    next.splice(reviewIdx, 0, "merge");
  }
  return next;
}
