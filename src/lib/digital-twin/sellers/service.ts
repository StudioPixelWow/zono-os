// ============================================================================
// 🏷️ Seller Digital Twin — service (server-only). 28.2.
// Builds Seller Twins from the EXISTING sellers read model (sellers + activities
// + linked property, reused — not duplicated) and integrates the reused engines:
// Truth Engine (per-seller) + Organizational Memory (shared lessons). Read-only;
// evidence-only; no schema changes.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { listSellers, getSellerById, type SellerRow } from "@/lib/sellers/repository";
import { computeTruthScore } from "@/lib/truth-engine";
import { getOrgMemoryReport } from "@/lib/org-memory";
import { getCrmEdgeIndex, type LiteEdge } from "../crm-graph";
import { buildSellerTwin } from "./twin";
import type { SellerSeed, SellerActivityInput, SellerTwin } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };
const n0 = (v: unknown, d = 50): number => num(v) ?? d;

interface PropLink { propertyId: string | null; estimatedValue: number | null }

function rowToSeed(r: SellerRow, prop: PropLink | undefined): SellerSeed {
  const rec = r as unknown as Row;
  return {
    id: String(rec.id), name: s(rec.full_name) ?? "מוכר ללא שם",
    motivationLabel: s(rec.motivation) ?? s(rec.motivation_type),
    urgencyLevel: s(rec.urgency_level),
    desiredPrice: num(rec.desired_price), minimumPrice: num(rec.minimum_price), dreamPrice: num(rec.dream_price),
    estimatedValue: prop?.estimatedValue ?? null,
    decisionStyle: s(rec.decision_style), mainObjection: s(rec.main_objection),
    priceSensitivity: n0(rec.price_sensitivity_score), timeSensitivity: n0(rec.time_sensitivity_score),
    trustSensitivity: n0(rec.trust_sensitivity_score), cooperation: n0(rec.cooperation_score),
    negotiationFlexibility: n0(rec.negotiation_flexibility_score),
    hasSignedAgreement: !!rec.has_signed_agreement,
    propertyId: prop?.propertyId ?? null, valuationId: null,
    hasPhone: !!s(rec.phone), hasEmail: !!s(rec.email),
    mustSellBy: s(rec.must_sell_by), targetSaleDate: s(rec.target_sale_date),
    createdAt: s(rec.created_at), updatedAt: s(rec.updated_at),
  };
}
const actToInput = (a: Row): SellerActivityInput => ({
  id: String(a.id ?? Math.random()), kind: s(a.kind) ?? s(a.type) ?? "other",
  at: s(a.occurred_at) ?? s(a.created_at) ?? new Date().toISOString(),
  summary: s(a.title) ?? s(a.description) ?? s(a.kind) ?? "פעילות",
});

async function assemble(seed: SellerSeed, activities: SellerActivityInput[], lessons: string[], edges?: LiteEdge[]): Promise<SellerTwin> {
  const truth = computeTruthScore({
    entityType: "seller", entityId: seed.id, entityName: seed.name,
    evidence: activities.map((a) => ({ source: a.kind, sourceType: a.kind, at: a.at, stance: "support" as const })),
    lastSeenAt: activities[0]?.at ?? seed.updatedAt ?? null,
    requiredFields: ["price", "motivation", "contact", "property"],
    presentFields: [seed.desiredPrice != null ? "price" : "", seed.motivationLabel || seed.urgencyLevel ? "motivation" : "", seed.hasPhone || seed.hasEmail ? "contact" : "", seed.propertyId ? "property" : ""].filter(Boolean),
    baseConfidence: seed.trustSensitivity,
  });
  return buildSellerTwin({ seed, activities, truth, orgMemoryLessons: lessons, relationshipEdges: edges });
}

export interface SellerTwinsOverview {
  version: string; generatedAt: string;
  totals: { sellers: number; hot: number; atRisk: number; priceGap: number; readyToSign: number; stale: number; highValue: number };
  twins: SellerTwin[];
  notes: string[];
}

async function loadLinksAndActivities(ids: string[]): Promise<{ props: Map<string, PropLink>; acts: Map<string, SellerActivityInput[]> }> {
  const props = new Map<string, PropLink>();
  const acts = new Map<string, SellerActivityInput[]>();
  if (!ids.length) return { props, acts };
  const db = await createClient();
  // Linked property (best-effort). Estimated value requires a valuation join that
  // is not read here — price gap stays null until a valuation link is available.
  try {
    const { data } = await db.from("properties").select("id,seller_id").in("seller_id", ids);
    for (const p of (data ?? []) as Row[]) { const sid = s(p.seller_id); if (sid && !props.has(sid)) props.set(sid, { propertyId: s(p.id), estimatedValue: null }); }
  } catch { /* none */ }
  // Activities (bulk).
  try {
    const { data } = await db.from("activities").select("*").in("seller_id", ids).order("occurred_at", { ascending: false }).limit(1000);
    for (const a of (data ?? []) as Row[]) { const sid = s(a.seller_id); if (!sid) continue; (acts.get(sid) ?? acts.set(sid, []).get(sid)!).push(actToInput(a)); }
  } catch { /* none */ }
  return { props, acts };
}

/** Build Seller Twins for the org (reuses the sellers read model). */
export async function getSellerTwins(orgId: string | null, limit = 20): Promise<SellerTwinsOverview> {
  const notes: string[] = [];
  let rows: SellerRow[] = [];
  try { rows = await listSellers(); } catch { notes.push("לא ניתן לטעון מוכרים — ודא הרשאות/נתונים."); }
  const slice = rows.slice(0, limit);
  const ids = slice.map((r) => String((r as unknown as Row).id));
  const [{ props, acts }, lessons, edgeIndex] = await Promise.all([
    loadLinksAndActivities(ids),
    getOrgMemoryReport(orgId).then((r) => r.executiveMemory.lessonsLearned.slice(0, 4)).catch(() => [] as string[]),
    getCrmEdgeIndex(orgId),
  ]);

  const twins = await Promise.all(slice.map((r) => {
    const seed = rowToSeed(r, props.get(String((r as unknown as Row).id)));
    return assemble(seed, acts.get(seed.id) ?? [], lessons, edgeIndex.get(seed.id));
  }));

  if (!rows.length) notes.push("אין מוכרים במערכת עדיין — המסגרת מוכנה; צור מוכרים כדי לבנות Twins. אין המצאות.");
  const has = (t: SellerTwin, tag: string) => t.classification.includes(tag);
  return {
    version: "28.2", generatedAt: new Date().toISOString(),
    totals: {
      sellers: rows.length,
      hot: twins.filter((t) => has(t, "מוכר חם")).length,
      atRisk: twins.filter((t) => has(t, "בסיכון נטישה")).length,
      priceGap: twins.filter((t) => has(t, "פער מחיר")).length,
      readyToSign: twins.filter((t) => has(t, "מוכן לחתימה")).length,
      stale: twins.filter((t) => has(t, "מתיישן")).length,
      highValue: twins.filter((t) => has(t, "ערך גבוה")).length,
    },
    twins: [...twins].sort((a, b) => b.profile.sellerConfidence - a.profile.sellerConfidence),
    notes,
  };
}

/** Build a single Seller Twin by id. */
export async function getSellerTwinById(orgId: string | null, sellerId: string): Promise<SellerTwin | null> {
  const r = await getSellerById(sellerId).catch(() => null);
  if (!r) return null;
  const { props, acts } = await loadLinksAndActivities([sellerId]);
  const [lessons, edgeIndex] = await Promise.all([
    getOrgMemoryReport(orgId).then((x) => x.executiveMemory.lessonsLearned.slice(0, 4)).catch(() => [] as string[]),
    getCrmEdgeIndex(orgId),
  ]);
  const seed = rowToSeed(r, props.get(sellerId));
  return assemble(seed, acts.get(sellerId) ?? [], lessons, edgeIndex.get(sellerId));
}
