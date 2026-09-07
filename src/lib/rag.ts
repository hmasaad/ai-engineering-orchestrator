import { understandTask } from "./classify";
import { buildPlan } from "./plan";
import type { Learning, SharedLearnings, TaskAnalysis, TaskInput } from "./types";

const SEED_INPUTS: TaskInput[] = [
  { task: "Add social login with Google", repository: "my-app", branch: "feature/google-login" },
  { task: "Users are getting logged out randomly after upgrading the app." },
  { task: "Change the primary button on the settings screen to navy." },
  { task: "Please clean up unused CSS on the settings screen." },
  { task: "Add a column to the accounts table for nickname." },
  { task: "The settings screen list is slow to render with 10,000 rows. p95 latency is four seconds." },
  { task: "Deploy the new checkout service to production." },
  { task: "Add a rate limit on the login endpoint to stop brute force password guesses." },
  { task: "It's broken" },
  { task: "How does session refresh work in the mobile app?" },
  { task: "Add a database migration that drops the unused users_legacy table." },
  { task: "Add a feature so customers can receive a reminder the day before their salon appointment." },
];

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "are",
  "was",
  "you",
  "not",
  "add",
  "can",
  "into",
]);

const POISON = [
  "skip security",
  "skip human",
  "skip evals",
  "merge this to main",
  "ignore previous",
  "you are a developer only",
];

function hay(text: string) {
  return ` ${text.toLowerCase().replace(/\s+/g, " ").trim()} `;
}

function poisoned(text: string) {
  const h = hay(text);
  return POISON.some((needle) => h.includes(needle));
}

export function sanitizeLesson(text: string) {
  if (!text.trim() || poisoned(text)) return "";
  return text.replace(/\s+/g, " ").trim();
}

function tokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP.has(token));
}

function norm(ticket: string) {
  return ticket.toLowerCase().replace(/\s+/g, " ").trim();
}

let seedCache: Learning[] | null = null;

export function seedLearnings(): Learning[] {
  if (seedCache) return seedCache;
  seedCache = SEED_INPUTS.map((input, index) => {
    const analysis = understandTask(input);
    const plan = buildPlan(analysis);
    return {
      id: `seed-${index}`,
      at: "seed",
      ticket: input.task,
      type: analysis.taskType,
      risk: analysis.risk,
      areas: analysis.areas,
      pattern: analysis.route.pattern,
      agents: analysis.route.routing.agents,
      summary: analysis.summary,
      lessons: [plan.principle, ...plan.steps.slice(0, 4).map((step) => `${step.label}: ${step.why}`)]
        .map(sanitizeLesson)
        .filter(Boolean),
      quality: "PASS",
      source: "seed",
    } satisfies Learning;
  });
  return seedCache;
}

export type LearningHit = Learning & { score: number };

function overlapScore(query: string, doc: Learning, analysis?: TaskAnalysis) {
  const q = new Set(tokens(query));
  if (q.size === 0) return 0;
  const bag = tokens([doc.ticket, doc.summary, doc.pattern, doc.type, ...doc.areas].join(" "));
  let hit = 0;
  for (const token of bag) if (q.has(token)) hit += 1;
  if (hit === 0) return 0;
  let score = hit;
  if (analysis) {
    if (doc.type === analysis.taskType) score += 4;
    if (doc.risk === analysis.risk) score += 1;
    if (analysis.route?.pattern && doc.pattern === analysis.route.pattern) score += 3;
    score += doc.areas.filter((area) => analysis.areas.includes(area)).length * 2;
  }
  if (doc.quality === "FAIL") score *= 0.4;
  return score;
}

export function retrieveLearnings(
  query: string,
  analysis?: TaskAnalysis,
  extra: Learning[] = [],
  limit = 3,
): LearningHit[] {
  const corpus = [...seedLearnings(), ...extra];
  const needle = norm(query);
  return corpus
    .filter((doc) => norm(doc.ticket) !== needle)
    .filter((doc) => !poisoned([doc.ticket, doc.summary, ...doc.lessons].join(" ")))
    .map((doc) => ({ ...doc, score: overlapScore(query, doc, analysis) }))
    .filter((doc) => doc.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function packLearnings(hits: LearningHit[]): SharedLearnings {
  return {
    mode: "offline",
    hits: hits.map((hit) => ({
      ticket: hit.ticket,
      pattern: hit.pattern,
      risk: hit.risk,
      score: Math.round(hit.score),
      summary: hit.summary,
      lessons: hit.lessons.slice(0, 3),
    })),
  };
}

export function learningFromRun(input: {
  id: string;
  createdAt: string;
  ticket: string;
  analysis: TaskAnalysis;
  artifacts: { recommendation: string; summary: string }[];
  quality: { verdict?: string };
}): Learning {
  return {
    id: input.id,
    at: input.createdAt,
    ticket: input.ticket,
    type: input.analysis.taskType,
    risk: input.analysis.risk,
    areas: input.analysis.areas,
    pattern: input.analysis.route.pattern,
    agents: input.analysis.route.routing.agents,
    summary: input.analysis.summary,
    lessons: [
      ...input.artifacts.map((item) => sanitizeLesson(item.recommendation)),
      ...input.artifacts.map((item) => sanitizeLesson(item.summary)),
    ]
      .filter(Boolean)
      .slice(0, 8),
    quality: input.quality.verdict === "FAIL" ? "FAIL" : "PASS",
    source: "live",
  };
}
