// ============================================================================
// 👤 Digital Twin Framework — universal API (pure). 28.1. Parts 1 + 11.
// The reusable primitives every future entity twin uses:
//   createDigitalTwin · updateTwin · buildTwinMemory · learnFromActivity ·
//   buildTwinHealth · computeConfidence · buildTwinTruth · buildTwinRelationships ·
//   attachOrgMemory · rankTwinDecisions · rankTwinMissions.
// Entity-agnostic — no Buyer/Seller/etc. code. Composes reused-engine summaries.
// ============================================================================
import type {
  DigitalTwin, TwinEntityType, TwinIdentity, TwinActivity, TwinMemory, TwinHealth,
  TwinTruthSummary, TwinRelationshipSummary, TwinDecisionSignal, TwinMissionSignal,
} from "./types";
import { DIGITAL_TWIN_VERSION } from "./types";

export const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, Math.round(n)));
const DAY = 86400000;
const daysSince = (iso: string | null, now: number): number | null => {
  if (!iso) return null; const d = (now - new Date(iso).getTime()) / DAY; return Number.isFinite(d) && d >= 0 ? d : null;
};

// ── Part 4 — memory from activities ──────────────────────────────────────────
export function buildTwinMemory(activities: TwinActivity[], now: number = Date.now()): TwinMemory {
  const sorted = [...activities].sort((a, b) => b.at.localeCompare(a.at));
  const counts: Record<string, number> = {};
  const days = new Set<string>();
  for (const a of sorted) { counts[a.kind] = (counts[a.kind] ?? 0) + 1; if (a.at) days.add(a.at.slice(0, 10)); }
  const lastActivityAt = sorted[0]?.at ?? null;
  const last = daysSince(lastActivityAt, now);
  const recencyScore = last == null ? 0 : last <= 3 ? 100 : last <= 14 ? 75 : last <= 30 ? 50 : last <= 90 ? 25 : 5;
  const variety = Object.keys(counts).length;
  const engagementScore = clamp(Math.min(100, sorted.length * 8) * 0.6 + Math.min(100, variety * 20) * 0.4);
  return { activities: sorted, counts, totalActivities: sorted.length, lastActivityAt, activeDays: days.size, recencyScore, engagementScore };
}

// ── Part 1 — health ──────────────────────────────────────────────────────────
export interface HealthInputs { memory: TwinMemory; completeness: number; risk: number; truthScore?: number | null }
export function buildTwinHealth(inp: HealthInputs): TwinHealth {
  const freshness = inp.memory.recencyScore;
  const engagement = inp.memory.engagementScore;
  const completeness = clamp(inp.completeness);
  const risk = clamp(inp.risk);
  const truthBonus = inp.truthScore != null ? inp.truthScore * 0.1 : 0;
  const score = clamp(engagement * 0.3 + freshness * 0.25 + completeness * 0.25 + (100 - risk) * 0.2 + truthBonus - truthBonus);
  const label: TwinHealth["label"] =
    inp.memory.totalActivities === 0 ? "ריק"
    : freshness <= 10 ? "רדום"
    : risk >= 60 ? "בסיכון"
    : score >= 66 ? "בריא" : "יציב";
  const basis = [
    `מעורבות ${engagement}`, `טריות ${freshness}`, `שלמות פרופיל ${completeness}`, `סיכון ${risk}`,
    `${inp.memory.totalActivities} פעילויות · ${inp.memory.activeDays} ימים פעילים`,
  ];
  return { score, engagement, freshness, completeness, risk, label, basis };
}

// ── Part 1 — confidence (data completeness behind the twin) ──────────────────
export function computeConfidence(memory: TwinMemory, completeness: number, truthScore?: number | null): number {
  return clamp(
    Math.min(100, memory.totalActivities * 10) * 0.4 +
    clamp(completeness) * 0.3 +
    (truthScore != null ? truthScore : 0) * 0.3,
  );
}

// ── Part 8 — reused-engine summaries (pure wrappers; nothing recomputed) ─────
export function buildTwinTruth(t: { truthScore: number; confidence: number; verificationLevel: string; freshness: number; missingInfo: string[] } | null): TwinTruthSummary | null {
  if (!t) return null;
  return { truthScore: t.truthScore, confidence: t.confidence, verification: t.verificationLevel, freshness: t.freshness, missing: t.missingInfo };
}
export function buildTwinRelationships(entityId: string, edges: { from: string; to: string; type: string; strength: number }[]): TwinRelationshipSummary {
  const mine = edges.filter((e) => e.from === entityId || e.to === entityId);
  const strongest = [...mine].sort((a, b) => b.strength - a.strength).slice(0, 5)
    .map((e) => ({ to: e.from === entityId ? e.to : e.from, type: e.type, strength: e.strength }));
  return { count: mine.length, degree: mine.length, strongest };
}
export function attachOrgMemory(lessons: string[]): string[] { return lessons.slice(0, 6); }

// ── Intelligence — ranking (entities supply candidate signals) ───────────────
export function rankTwinDecisions(signals: TwinDecisionSignal[]): TwinDecisionSignal[] {
  return [...signals].sort((a, b) => b.priority - a.priority);
}
export function rankTwinMissions(signals: TwinMissionSignal[]): TwinMissionSignal[] {
  return [...signals].sort((a, b) => b.priority - a.priority);
}

// ── Part 11 — create / update / learn ────────────────────────────────────────
export interface CreateTwinInput<TProfile> {
  id: string; entityType: TwinEntityType; name: string;
  createdAt?: string | null; updatedAt?: string | null;
  profile: TProfile;
  activities?: TwinActivity[];
  completeness: number; risk: number;
  truth?: Parameters<typeof buildTwinTruth>[0];
  relationshipEdges?: { from: string; to: string; type: string; strength: number }[];
  orgMemoryLessons?: string[];
  decisions?: TwinDecisionSignal[];
  missions?: TwinMissionSignal[];
  learnings?: DigitalTwin<TProfile>["learnings"];
  classification?: string[];
  now?: number;
}

export function createDigitalTwin<TProfile>(input: CreateTwinInput<TProfile>): DigitalTwin<TProfile> {
  const now = input.now ?? Date.now();
  const memory = buildTwinMemory(input.activities ?? [], now);
  const truth = buildTwinTruth(input.truth ?? null);
  const health = buildTwinHealth({ memory, completeness: input.completeness, risk: input.risk, truthScore: truth?.truthScore ?? null });
  const confidence = computeConfidence(memory, input.completeness, truth?.truthScore ?? null);
  const identity: TwinIdentity = { id: input.id, entityType: input.entityType, name: input.name, createdAt: input.createdAt ?? null, updatedAt: input.updatedAt ?? null };
  const notes: string[] = [];
  if (memory.totalActivities === 0) notes.push("אין פעילות מתועדת — הפרופיל מבוסס על נתוני בסיס בלבד. אין המצאות.");

  return {
    version: DIGITAL_TWIN_VERSION, identity, profile: input.profile, memory, health, confidence, truth,
    relationships: input.relationshipEdges ? buildTwinRelationships(input.id, input.relationshipEdges) : null,
    orgMemoryLessons: attachOrgMemory(input.orgMemoryLessons ?? []),
    decisions: rankTwinDecisions(input.decisions ?? []),
    missions: rankTwinMissions(input.missions ?? []),
    learnings: input.learnings ?? [],
    classification: input.classification ?? [],
    notes,
  };
}

/** Immutable patch. Any provided section replaces the previous one. */
export function updateTwin<TProfile>(twin: DigitalTwin<TProfile>, patch: Partial<DigitalTwin<TProfile>>): DigitalTwin<TProfile> {
  return { ...twin, ...patch, identity: { ...twin.identity, ...(patch.identity ?? {}) } };
}

/** Fold new activities into the twin's memory + recompute health/confidence. */
export function learnFromActivity<TProfile>(twin: DigitalTwin<TProfile>, newActivities: TwinActivity[], completeness: number, risk: number, now: number = Date.now()): DigitalTwin<TProfile> {
  const memory = buildTwinMemory([...twin.memory.activities, ...newActivities], now);
  const health = buildTwinHealth({ memory, completeness, risk, truthScore: twin.truth?.truthScore ?? null });
  const confidence = computeConfidence(memory, completeness, twin.truth?.truthScore ?? null);
  return { ...twin, memory, health, confidence };
}
