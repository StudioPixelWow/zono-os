// ============================================================================
// 🎯 Lead Digital Twin — service (server-only). 28.3.
// Builds Lead Twins from the EXISTING `leads` table (+ activities), detects
// duplicate contacts across the org's leads, and integrates the reused engines:
// Truth Engine (per-lead) + Organizational Memory (shared lessons). Read-only;
// evidence-only; no schema changes.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { computeTruthScore } from "@/lib/truth-engine";
import { getOrgMemoryReport } from "@/lib/org-memory";
import { buildLeadTwin } from "./twin";
import type { LeadSeed, LeadActivityInput, LeadTwin, LeadIntent } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };
const norm = (v: string | null): string => (v ?? "").trim().toLowerCase().replace(/[^0-9a-z@.]/g, "");
const INTENTS = ["buyer", "seller", "both", "investor", "renter", "unknown"];
const asIntent = (v: unknown): LeadIntent => { const t = s(v) ?? "unknown"; return (INTENTS.includes(t) ? t : "unknown") as LeadIntent; };

function rowToSeed(r: Row, dupCount: number): LeadSeed {
  return {
    id: String(r.id), name: s(r.full_name) ?? "ליד ללא שם",
    source: s(r.source), intent: asIntent(r.intent), stage: s(r.stage) ?? "new",
    score: num(r.score), message: s(r.message),
    hasPhone: !!s(r.phone), hasEmail: !!s(r.email),
    propertyId: s(r.property_id), projectId: s(r.project_id),
    convertedBuyerId: s(r.converted_buyer_id), convertedSellerId: s(r.converted_seller_id),
    lostReason: s(r.lost_reason), duplicateContacts: dupCount,
    lastActivityAt: s(r.last_activity_at), createdAt: s(r.created_at), updatedAt: s(r.updated_at),
  };
}
const actToInput = (a: Row): LeadActivityInput => ({
  id: String(a.id ?? Math.random()), kind: s(a.kind) ?? s(a.type) ?? "other",
  at: s(a.occurred_at) ?? s(a.created_at) ?? new Date().toISOString(),
  summary: s(a.title) ?? s(a.description) ?? s(a.kind) ?? "פעילות",
});

async function assemble(seed: LeadSeed, activities: LeadActivityInput[], lessons: string[]): Promise<LeadTwin> {
  const truth = computeTruthScore({
    entityType: "lead", entityId: seed.id, entityName: seed.name,
    evidence: activities.map((a) => ({ source: a.kind, sourceType: a.kind, at: a.at, stance: "support" as const })),
    lastSeenAt: seed.lastActivityAt ?? activities[0]?.at ?? seed.updatedAt ?? null,
    requiredFields: ["contact", "source", "intent", "score"],
    presentFields: [seed.hasPhone || seed.hasEmail ? "contact" : "", seed.source ? "source" : "", seed.intent !== "unknown" ? "intent" : "", seed.score != null ? "score" : ""].filter(Boolean),
    baseConfidence: seed.score,
  });
  return buildLeadTwin({ seed, activities, truth, orgMemoryLessons: lessons });
}

export interface LeadTwinsOverview {
  version: string; generatedAt: string;
  totals: { leads: number; hot: number; cold: number; buyers: number; sellers: number; duplicates: number; stale: number; qualified: number };
  twins: LeadTwin[];
  notes: string[];
}

/** Build Lead Twins for the org (reuses the leads table + activities). */
export async function getLeadTwins(orgId: string | null, limit = 25): Promise<LeadTwinsOverview> {
  const notes: string[] = [];
  const db = await createClient();
  let rows: Row[] = [];
  try {
    const { data, error } = await db.from("leads").select("*").order("updated_at", { ascending: false }).limit(300);
    if (error) throw new Error(error.message);
    rows = (data ?? []) as Row[];
  } catch { notes.push("לא ניתן לטעון לידים — ודא הרשאות/נתונים."); }

  // Duplicate detection across the org's leads (normalized phone/email).
  const contactCount = new Map<string, number>();
  for (const r of rows) { for (const c of [norm(s(r.phone)), norm(s(r.email))]) if (c) contactCount.set(c, (contactCount.get(c) ?? 0) + 1); }
  const dupFor = (r: Row): number => Math.max(0, ...[norm(s(r.phone)), norm(s(r.email))].filter(Boolean).map((c) => (contactCount.get(c) ?? 1) - 1));

  const slice = rows.slice(0, limit);
  const ids = slice.map((r) => String(r.id));
  const actsByLead = new Map<string, LeadActivityInput[]>();
  try {
    const { data } = await db.from("activities").select("*").in("lead_id", ids).order("occurred_at", { ascending: false }).limit(1000);
    for (const a of (data ?? []) as Row[]) { const lid = s(a.lead_id); if (!lid) continue; (actsByLead.get(lid) ?? actsByLead.set(lid, []).get(lid)!).push(actToInput(a)); }
  } catch { /* none */ }

  const lessons = await getOrgMemoryReport(orgId).then((r) => r.executiveMemory.lessonsLearned.slice(0, 4)).catch(() => [] as string[]);
  const twins = await Promise.all(slice.map((r) => assemble(rowToSeed(r, dupFor(r)), actsByLead.get(String(r.id)) ?? [], lessons)));

  if (!rows.length) notes.push("אין לידים במערכת עדיין — המסגרת מוכנה; צור לידים כדי לבנות Twins. אין המצאות.");
  const has = (t: LeadTwin, tag: string) => t.classification.includes(tag);
  return {
    version: "28.3", generatedAt: new Date().toISOString(),
    totals: {
      leads: rows.length,
      hot: twins.filter((t) => has(t, "ליד חם")).length,
      cold: twins.filter((t) => has(t, "ליד קר")).length,
      buyers: twins.filter((t) => has(t, "ליד קונה")).length,
      sellers: twins.filter((t) => has(t, "ליד מוכר")).length,
      duplicates: twins.filter((t) => has(t, "כפילות")).length,
      stale: twins.filter((t) => has(t, "מתיישן")).length,
      qualified: twins.filter((t) => has(t, "מוסמך")).length,
    },
    twins: [...twins].sort((a, b) => b.profile.conversionProbability - a.profile.conversionProbability),
    notes,
  };
}

/** Build a single Lead Twin by id. */
export async function getLeadTwinById(orgId: string | null, leadId: string): Promise<LeadTwin | null> {
  const db = await createClient();
  const { data } = await db.from("leads").select("*").eq("id", leadId).maybeSingle();
  if (!data) return null;
  const r = data as Row;
  let acts: LeadActivityInput[] = [];
  try { const { data: a } = await db.from("activities").select("*").eq("lead_id", leadId).order("occurred_at", { ascending: false }).limit(100); acts = ((a ?? []) as Row[]).map(actToInput); } catch { /* none */ }
  const lessons = await getOrgMemoryReport(orgId).then((x) => x.executiveMemory.lessonsLearned.slice(0, 4)).catch(() => [] as string[]);
  return assemble(rowToSeed(r, 0), acts, lessons);
}
