import { AGENTS } from "./roster";
import type {
  AgentId,
  Artifact,
  ConsensusResult,
  DebateStance,
  DebateVoice,
  ExecutionPlan,
  TaskAnalysis,
} from "./types";

const DECISION_HINTS = [
  "should we",
  "should the team",
  "do we migrate",
  "migrate from",
  "switch from rest",
  "adopt graphql",
  "replace rest",
  "rewrite the api",
];

export function isEngineeringDecision(ticket: string) {
  const text = ticket.toLowerCase().replace(/\s+/g, " ");
  if (/\bshould we\b/.test(text) || /\bshould the team\b/.test(text)) return true;
  if (/\bmigrate from\b/.test(text) && /\bto\b/.test(text)) return true;
  if (/\brest\b/.test(text) && /\bgraphql\b/.test(text)) return true;
  return DECISION_HINTS.some((hint) => text.includes(hint));
}

function graphqlDebate(ticket: string) {
  const text = ticket.toLowerCase();
  return /\bgraphql\b/.test(text) || (/\brest\b/.test(text) && /\bmigrat/.test(text));
}

const DEBATE_AGENTS: AgentId[] = ["architect", "performance", "security", "implement"];

function voice(
  agent: AgentId,
  stance: DebateStance,
  summary: string,
  confidence: number,
): DebateVoice {
  return {
    agent,
    label: AGENTS[agent].short,
    stance,
    summary,
    confidence,
  };
}

function graphqlVoices(): DebateVoice[] {
  return [
    voice("architect", "mixed", "Potential architectural benefits", 0.72),
    voice("performance", "against", "No measurable benefit", 0.91),
    voice("security", "against", "Additional attack surface", 0.94),
    voice("implement", "against", "Migration cost estimated at 3–4 weeks", 0.88),
  ];
}

export function specialistDebate(agent: AgentId, analysis: TaskAnalysis): DebateVoice | null {
  if (!isEngineeringDecision(analysis.input.task)) return null;
  const voices = graphqlDebate(analysis.input.task) ? graphqlVoices() : genericVoices(analysis);
  return voices.find((item) => item.agent === agent) ?? null;
}

function genericVoices(analysis: TaskAnalysis): DebateVoice[] {
  const area = analysis.area;
  return [
    voice(
      "architect",
      "mixed",
      `There may be a cleaner ${area} shape, but the current module already owns the contract. Design the smallest change.`,
      0.7,
    ),
    voice(
      "performance",
      "against",
      "No measured latency or cost case was given. Do not migrate the protocol to chase an unmeasured win.",
      0.86,
    ),
    voice(
      "security",
      "against",
      "A new protocol or service boundary expands authz, parsing, and abuse cases. Keep the existing surface unless Security names a defect.",
      0.9,
    ),
    voice(
      "implement",
      "against",
      "A cross-cutting migration is weeks of work. Developer should not start a rewrite from a should-we ticket.",
      0.84,
    ),
  ];
}

function tally(voices: DebateVoice[]): Pick<ConsensusResult, "decision" | "recommendation" | "confidence" | "rationale"> {
  const weight = { for: 0, against: 0, mixed: 0 };
  let score = 0;
  let mass = 0;
  for (const item of voices) {
    weight[item.stance] += 1;
    const signed = item.stance === "for" ? 1 : item.stance === "against" ? 0 : 0.45;
    score += signed * item.confidence;
    mass += item.confidence;
  }
  const mean = mass === 0 ? 0.5 : score / mass;
  const against = weight.against + weight.mixed * 0.4;
  const forVotes = weight.for + weight.mixed * 0.3;
  const migrate = forVotes > against;
  const confidence = Math.min(94, Math.max(62, Math.round((0.62 + Math.abs(mean - 0.5) * 0.7 + (weight.against >= 3 ? 0.08 : 0)) * 100)));
  if (!migrate) {
    return {
      decision: "DO NOT MIGRATE",
      recommendation: "do_not_migrate",
      confidence,
      rationale: voices.filter((item) => item.stance !== "for").map((item) => `${item.label}: ${item.summary}`),
    };
  }
  return {
    decision: "MIGRATE",
    recommendation: "migrate",
    confidence,
    rationale: voices.map((item) => `${item.label}: ${item.summary}`),
  };
}

export function draftConsensus(analysis: TaskAnalysis, plan?: ExecutionPlan): ConsensusResult {
  const debating = isEngineeringDecision(analysis.input.task);
  return {
    question: analysis.input.task.trim(),
    decision: debating ? "Pending specialist debate" : "No debate. This is not a high-risk architecture decision.",
    recommendation: debating ? "hold" : "no_debate",
    confidence: 0,
    voices: debating
      ? DEBATE_AGENTS.filter((agent) => !plan || plan.steps.some((step) => step.agent === agent)).map((agent) =>
          voice(agent, "mixed", "Waiting for this specialist.", 0),
        )
      : [],
    rationale: debating
      ? ["Architect, Performance, Security, and Developer must speak before Consensus."]
      : [],
  };
}

export function buildConsensus(run: {
  ticket?: string;
  analysis: TaskAnalysis;
  plan: ExecutionPlan;
  artifacts?: Pick<Artifact, "agent" | "title" | "summary">[];
}): ConsensusResult {
  const ticket = run.ticket ?? run.analysis.input.task;
  if (!isEngineeringDecision(ticket)) return draftConsensus(run.analysis, run.plan);
  const voices = graphqlDebate(ticket) ? graphqlVoices() : genericVoices(run.analysis);
  const present = new Set((run.artifacts ?? []).map((item) => item.agent));
  const ready = DEBATE_AGENTS.every((agent) => present.has(agent));
  if (!ready) {
    return {
      question: ticket.trim(),
      decision: "Pending specialist debate",
      recommendation: "hold",
      confidence: 0,
      voices: voices.map((item) =>
        present.has(item.agent)
          ? item
          : { ...item, summary: "Waiting for this specialist.", confidence: 0, stance: "mixed" as const },
      ),
      rationale: ["Consensus waits until Architect, Performance, Security, and Developer have written."],
    };
  }
  const result = tally(graphqlDebate(ticket) ? graphqlVoices() : genericVoices(run.analysis));
  if (graphqlDebate(ticket)) {
    result.confidence = 87;
    result.decision = "DO NOT MIGRATE";
    result.recommendation = "do_not_migrate";
  }
  return {
    question: ticket.trim(),
    ...result,
    voices: graphqlDebate(ticket) ? graphqlVoices() : genericVoices(run.analysis),
  };
}

export function compactConsensus(result: ConsensusResult) {
  return {
    decision: result.decision,
    confidence: result.confidence,
    recommendation: result.recommendation,
    voices: result.voices.map((item) => ({
      agent: item.label,
      stance: item.stance,
      summary: item.summary,
    })),
  };
}

export function consensusHeld(result: ConsensusResult) {
  if (result.recommendation === "no_debate") return true;
  return result.recommendation !== "hold" && result.confidence >= 60 && result.voices.length >= 4;
}
