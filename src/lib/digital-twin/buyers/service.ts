// ============================================================================
// 👤 Buyer Digital Twin — service (server-only). 28.1. Part 8.
// Builds Buyer Twins from the EXISTING buyers read model (buyers + activities,
// reused — not duplicated) and integrates the reused engines: Truth Engine
// (per-buyer truth from activity evidence) and Organizational Memory (shared
// buyer lessons). Read-only; evidence-only; no schema changes.
// ============================================================================
import "server-only";
import { listBuyers, getBuyerById, getBuyerActivities, type BuyerRow } from "@/lib/buyers/repository";
import { computeTruthScore } from "@/lib/truth-engine";
import { getOrgMemoryReport } from "@/lib/org-memory";
import { buildBuyerTwin } from "./twin";
import type { BuyerSeed, BuyerActivityInput, BuyerTwin } from "./types";

type ActRow = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };

function rowToSeed(r: BuyerRow): BuyerSeed {
  const rec = r as unknown as Record<string, unknown>;
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const temp = s(rec.temperature);
  return {
    id: String(rec.id), name: s(rec.full_name) ?? "קונה ללא שם",
    temperature: temp === "hot" || temp === "warm" || temp === "cold" ? temp : null,
    budgetMin: num(rec.budget_min), budgetMax: num(rec.budget_max),
    roomsMin: num(rec.rooms_min), roomsMax: num(rec.rooms_max),
    preferredAreas: arr(rec.preferred_areas), preferredTypes: arr(rec.preferred_types),
    mustHaveParking: !!rec.must_have_parking, mustHaveElevator: !!rec.must_have_elevator, mustHaveSafeRoom: !!rec.must_have_safe_room,
    hasPhone: !!s(rec.phone), hasEmail: !!s(rec.email),
    createdAt: s(rec.created_at), updatedAt: s(rec.updated_at),
  };
}
function actToInput(a: ActRow): BuyerActivityInput {
  return { id: String(a.id ?? Math.random()), kind: s(a.kind) ?? s(a.type) ?? "other", at: s(a.occurred_at) ?? s(a.created_at) ?? new Date().toISOString(), summary: s(a.title) ?? s(a.description) ?? s(a.kind) ?? "פעילות" };
}

const TEMP_BASE: Record<string, number> = { hot: 75, warm: 55, cold: 30 };

async function assemble(seed: BuyerSeed, activities: BuyerActivityInput[], lessons: string[]): Promise<BuyerTwin> {
  const truth = computeTruthScore({
    entityType: "buyer", entityId: seed.id, entityName: seed.name,
    evidence: activities.map((a) => ({ source: a.kind, sourceType: a.kind, at: a.at, stance: "support" as const })),
    lastSeenAt: activities[0]?.at ?? seed.updatedAt ?? null,
    requiredFields: ["budget", "areas", "types", "contact"],
    presentFields: [seed.budgetMax != null ? "budget" : "", seed.preferredAreas.length ? "areas" : "", seed.preferredTypes.length ? "types" : "", seed.hasPhone || seed.hasEmail ? "contact" : ""].filter(Boolean),
    baseConfidence: TEMP_BASE[seed.temperature ?? ""] ?? null,
  });
  return buildBuyerTwin({ seed, activities, truth, orgMemoryLessons: lessons });
}

export interface BuyerTwinsOverview {
  version: string; generatedAt: string;
  totals: { buyers: number; hot: number; luxury: number; investors: number; families: number; dormant: number; highValue: number };
  twins: BuyerTwin[];
  frameworkEntities: string[];
  notes: string[];
}

/** Build Buyer Twins for the org (reuses the buyers read model). */
export async function getBuyerTwins(orgId: string | null, limit = 20): Promise<BuyerTwinsOverview> {
  const notes: string[] = [];
  let rows: BuyerRow[] = [];
  try { rows = await listBuyers(); } catch { notes.push("לא ניתן לטעון קונים — ודא הרשאות/נתונים."); }
  const lessons = await getOrgMemoryReport(orgId).then((r) => r.executiveMemory.lessonsLearned.slice(0, 4)).catch(() => [] as string[]);

  const slice = rows.slice(0, limit);
  const twins = await Promise.all(slice.map(async (r) => {
    const seed = rowToSeed(r);
    let acts: BuyerActivityInput[] = [];
    try { acts = ((await getBuyerActivities(seed.id)) as ActRow[]).map(actToInput); } catch { /* none */ }
    return assemble(seed, acts, lessons);
  }));

  if (!rows.length) notes.push("אין קונים במערכת עדיין — המסגרת מוכנה; צור קונים כדי לבנות Twins. אין המצאות.");
  const has = (t: BuyerTwin, tag: string) => t.classification.includes(tag);
  return {
    version: "28.1", generatedAt: new Date().toISOString(),
    totals: {
      buyers: rows.length,
      hot: twins.filter((t) => has(t, "קונה חם")).length,
      luxury: twins.filter((t) => has(t, "יוקרה")).length,
      investors: twins.filter((t) => has(t, "משקיע")).length,
      families: twins.filter((t) => has(t, "משפחה")).length,
      dormant: twins.filter((t) => has(t, "רדום")).length,
      highValue: twins.filter((t) => has(t, "ערך גבוה")).length,
    },
    twins: [...twins].sort((a, b) => b.profile.probabilityToBuy - a.profile.probabilityToBuy),
    frameworkEntities: ["buyer", "seller", "lead", "broker", "office", "property", "project", "developer", "campaign"],
    notes,
  };
}

/** Build a single Buyer Twin by id. */
export async function getBuyerTwinById(orgId: string | null, buyerId: string): Promise<BuyerTwin | null> {
  const r = await getBuyerById(buyerId).catch(() => null);
  if (!r) return null;
  const seed = rowToSeed(r);
  let acts: BuyerActivityInput[] = [];
  try { acts = ((await getBuyerActivities(seed.id)) as ActRow[]).map(actToInput); } catch { /* none */ }
  const lessons = await getOrgMemoryReport(orgId).then((x) => x.executiveMemory.lessonsLearned.slice(0, 4)).catch(() => [] as string[]);
  return assemble(seed, acts, lessons);
}
