// ============================================================================
// 🔗 CRM Relationship Graph Integration — discovery (pure). 28.4.
// Derives LIVE relationship edges connecting Buyer / Seller / Lead Digital Twins
// to Property / Valuation / Broker / Mission / Activity — from EXISTING data
// only. Reuses the Universal Relationship Graph (RawRelation → buildGraph). No
// new framework, no duplicated twin logic, evidence-only.
// ============================================================================
import type { RawRelation, EntityType } from "@/lib/relationship-graph";

// CRM relation types (the graph accepts any string; these are labelled below).
export const CRM_RELATION_HE: Record<string, string> = {
  converted_to: "הומר ל", managed_by: "מנוהל ע״י", interested_in: "מתעניין ב",
  owns: "בעלות על", valued_by: "הוערך ע״י", assigned_to: "משויך ל",
  logged: "תיעוד פעילות", duplicate_of: "כפילות עם",
};

export interface LeadRel { id: string; name: string; convertedBuyerId: string | null; convertedSellerId: string | null; propertyId: string | null; ownerId: string | null; at: string | null }
export interface BuyerRel { id: string; name: string; ownerId: string | null; matches: { propertyId: string; score: number; at: string | null }[]; at: string | null }
export interface SellerRel { id: string; name: string; ownerId: string | null; propertyId: string | null; valuationId: string | null; at: string | null }
export interface MissionRel { id: string; entityType: string; entityId: string | null; at: string | null }
export interface ActivityRel { id: string; entityType: string; entityId: string; kind: string; at: string | null }
export interface DuplicatePair { a: string; b: string }

export interface CrmInputs {
  leads: LeadRel[]; buyers: BuyerRel[]; sellers: SellerRel[];
  missions: MissionRel[]; activities: ActivityRel[]; duplicates: DuplicatePair[];
}

const rel = (from: string, to: string, ft: EntityType, tt: EntityType, type: string, at: string | null, source: string, evidence: string): RawRelation =>
  ({ from, to, fromType: ft, toType: tt, type, at, source, evidence });
const scoreRepeat = (score: number): number => (score >= 80 ? 3 : score >= 60 ? 2 : 1);

/** Build all CRM relationship edges from live data (evidence-only). */
export function relationsFromCrm(input: CrmInputs): RawRelation[] {
  const out: RawRelation[] = [];

  for (const l of input.leads) {
    if (l.convertedBuyerId) out.push(rel(l.id, l.convertedBuyerId, "lead", "buyer", "converted_to", l.at, "lead_record", "ליד הומר לקונה"));
    if (l.convertedSellerId) out.push(rel(l.id, l.convertedSellerId, "lead", "seller", "converted_to", l.at, "lead_record", "ליד הומר למוכר"));
    if (l.ownerId) out.push(rel(l.id, `broker:${l.ownerId}`, "lead", "broker", "managed_by", l.at, "lead_record", "בעלות מתווך"));
    if (l.propertyId) out.push(rel(l.id, l.propertyId, "lead", "property", "interested_in", l.at, "lead_record", "נכס מקושר לליד"));
  }
  for (const b of input.buyers) {
    if (b.ownerId) out.push(rel(b.id, `broker:${b.ownerId}`, "buyer", "broker", "managed_by", b.at, "buyer_record", "בעלות מתווך"));
    for (const m of b.matches) {
      const times = scoreRepeat(m.score);
      for (let i = 0; i < times; i++) out.push(rel(b.id, m.propertyId, "buyer", "property", "interested_in", m.at, "match_engine", `התאמה ${m.score}`));
    }
  }
  for (const sel of input.sellers) {
    if (sel.ownerId) out.push(rel(sel.id, `broker:${sel.ownerId}`, "seller", "broker", "managed_by", sel.at, "seller_record", "בעלות מתווך"));
    if (sel.propertyId) out.push(rel(sel.id, sel.propertyId, "seller", "property", "owns", sel.at, "seller_record", "בעלות על נכס"));
    if (sel.valuationId) out.push(rel(sel.id, `valuation:${sel.valuationId}`, "seller", "valuation", "valued_by", sel.at, "valuation_link", "הערכת שווי מקושרת"));
  }
  for (const ms of input.missions) {
    if (ms.entityId) out.push(rel(ms.entityId, ms.id, ms.entityType, "mission", "assigned_to", ms.at, "mission", "משימה משויכת"));
  }
  for (const a of input.activities) {
    out.push(rel(a.entityId, a.id, a.entityType, "activity", "logged", a.at, "activity", `פעילות ${a.kind}`));
  }
  for (const d of input.duplicates) {
    const [x, y] = d.a <= d.b ? [d.a, d.b] : [d.b, d.a];
    out.push(rel(x, y, "lead", "lead", "duplicate_of", null, "dedupe", "אותו טלפון/מייל"));
  }

  return out;
}
