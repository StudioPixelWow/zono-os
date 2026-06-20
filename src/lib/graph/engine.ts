/**
 * Knowledge Graph — relationship strength + cluster/specialization detection.
 * Pure, client-safe, deterministic, no LLM. Data assembly lives in the service;
 * these helpers turn raw signals into strength scores and detected opportunities.
 */

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export const REL_LABELS: Record<string, string> = {
  owns: "בעלות", interested_in: "מתעניין ב", matched_to: "התאמה", represented_by: "מיוצג ע״י",
  assigned_to: "מוקצה ל", located_in: "ממוקם ב", competes_with: "מתחרה ב", referred_by: "הופנה ע״י",
  communicated_with: "תקשורת", visited: "ביקר", viewed: "צפה", liked: "אהב", rejected: "דחה",
  negotiating: "במשא ומתן", closed: "סגר", generated: "יצר", recommended: "הומלץ", related_to: "קשור ל",
};
export const NODE_LABELS: Record<string, string> = {
  buyer: "קונה", seller: "מוכר", property: "נכס", lead: "ליד", match: "התאמה", agent: "סוכן",
  broker: "מתווך", competitor: "מתחרה", locality: "אזור", neighborhood: "שכונה", acquisition: "גיוס",
  deal: "עסקה", external_listing: "מודעה חיצונית",
};

// ── Relationship strength ────────────────────────────────────────────────────
export interface StrengthFactors {
  activityCount: number; // interactions on this edge
  communications: number;
  meetings: number;
  deals: number;
  matches: number;
  visits: number;
  propertyInteractions: number; // viewed/liked
  daysSinceLast: number | null;
  engagement: number; // 0..100 (external engagement signal)
}

export function calculateRelationshipStrength(f: StrengthFactors): number {
  let s = 10;
  s += Math.min(20, f.activityCount * 3);
  s += Math.min(20, f.communications * 4);
  s += Math.min(15, f.meetings * 5);
  s += Math.min(25, f.deals * 25);
  s += Math.min(15, f.matches * 7);
  s += Math.min(15, f.visits * 5);
  s += Math.min(10, f.propertyInteractions * 2);
  s += f.engagement * 0.1;
  // Recency decay.
  if (f.daysSinceLast != null) {
    if (f.daysSinceLast > 90) s -= 20;
    else if (f.daysSinceLast > 30) s -= 8;
  }
  return clamp(s);
}

// ── Cluster detection ────────────────────────────────────────────────────────
const budgetBand = (max: number | null): string => {
  if (max == null) return "any";
  if (max <= 1_500_000) return "≤1.5M";
  if (max <= 2_500_000) return "1.5–2.5M";
  if (max <= 4_000_000) return "2.5–4M";
  return "4M+";
};

export interface BuyerForCluster { id: string; city: string | null; budgetMax: number | null; propertyType: string | null }
export interface ClusterSignal { key: string; locality: string; band: string; type: string | null; count: number; entityIds: string[] }

/** Group buyers by locality + budget band (+ type) → hidden demand clusters (≥3). */
export function detectBuyerClusters(buyers: BuyerForCluster[]): ClusterSignal[] {
  const groups = new Map<string, { locality: string; band: string; type: string | null; ids: string[] }>();
  for (const b of buyers) {
    const city = (b.city ?? "").trim();
    if (!city) continue;
    const band = budgetBand(b.budgetMax);
    const key = `${city}|${band}`;
    const g = groups.get(key) ?? { locality: city, band, type: b.propertyType, ids: [] };
    g.ids.push(b.id);
    groups.set(key, g);
  }
  return [...groups.entries()].filter(([, g]) => g.ids.length >= 3)
    .map(([key, g]) => ({ key, locality: g.locality, band: g.band, type: g.type, count: g.ids.length, entityIds: g.ids }))
    .sort((a, b) => b.count - a.count);
}

export interface SellerForCluster { id: string; city: string | null }
export function detectSellerClusters(sellers: SellerForCluster[]): ClusterSignal[] {
  const groups = new Map<string, string[]>();
  for (const s of sellers) { const c = (s.city ?? "").trim(); if (!c) continue; const arr = groups.get(c) ?? []; arr.push(s.id); groups.set(c, arr); }
  return [...groups.entries()].filter(([, ids]) => ids.length >= 3)
    .map(([locality, ids]) => ({ key: locality, locality, band: "all", type: null, count: ids.length, entityIds: ids }))
    .sort((a, b) => b.count - a.count);
}

// ── Importance / activity node scoring ───────────────────────────────────────
export function nodeImportance(edgeCount: number, deals: number, value: number): number {
  return clamp(Math.min(50, edgeCount * 6) + Math.min(30, deals * 15) + Math.min(20, value / 250_000));
}
