// ============================================================================
// 🗺️ ZONO Territory Intelligence OS™ — server service (server-only). 39.0.
// COMPOSES the EXISTING engines into one command center and caches the result:
//   getMarketDomination · getStreetBuildingIntelligence · getCurrentMarketHeatmap
// mapped into the pure assembler. Reuses the 34.2 compute-cache. Adds NO engine,
// NO schema. Read-only; every CTA routes to an existing approval-gated flow.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getMarketDomination } from "@/lib/market-domination/service";
import { getStreetBuildingIntelligence } from "@/lib/street-building-intel/service";
import { getCurrentMarketHeatmap } from "@/lib/market/service";
import { getCache, setCache } from "@/lib/platform-persistence";
import type { Json } from "@/lib/supabase/types";
import { assembleTerritoryOS } from "./assemble";
import type { TerritoryInput, TerritoryOS, AreaLean, ActionLean, BrokerTerritorySummary, PropertyTerritory, Priority } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

async function orgId(): Promise<string | null> {
  const sc = await getSessionContext();
  return sc.profile?.org_id ?? sc.organization?.id ?? null;
}

interface AreaDomLike { key: string; name: string; city: string | null; dominationScore: number; band: string; marketShare: number; breakdown: { demand: number; competition: number; momentum: number }; evidence: string[] }
const toAreaLean = (a: AreaDomLike): AreaLean => ({
  key: a.key, name: a.name, city: a.city, score: a.dominationScore, band: a.band, marketShare: a.marketShare,
  demand: a.breakdown.demand, competition: a.breakdown.competition, momentum: a.breakdown.momentum, evidence: a.evidence,
});

async function compose(city: string | null): Promise<TerritoryOS> {
  const [dom, sb, heat] = await Promise.all([
    getMarketDomination().catch(() => null),
    getStreetBuildingIntelligence(city ?? undefined).catch(() => null),
    getCurrentMarketHeatmap().catch(() => [] as Awaited<ReturnType<typeof getCurrentMarketHeatmap>>),
  ]);

  const notes: string[] = [];
  if (!dom) notes.push("שכבת השליטה בשוק לא נטענה.");
  if (!sb) notes.push("מודיעין רחובות/בניינים לא נטען.");

  const actions: ActionLean[] = (dom?.actionQueue ?? []).map((a) => ({
    areaName: a.areaName, kind: a.kind, title: a.title, why: a.why, evidence: a.evidence, priority: a.priority, impact: a.impact, ctaHref: a.cta.href, ctaLabel: a.cta.label,
  }));

  const input: TerritoryInput = {
    city,
    dominationSummary: dom?.summary ?? { areas: 0, avgScore: 0, dominant: 0, contested: 0, weak: 0, absent: 0, coverage: 0 },
    areas: (dom?.areas ?? []).map(toAreaLean),
    topOpportunities: (dom?.topOpportunities ?? []).map(toAreaLean),
    weakAreas: (dom?.weakAreas ?? []).map(toAreaLean),
    missingAreas: (dom?.missingAreas ?? []).map(toAreaLean),
    actions,
    plans: (dom?.plans ?? []).map((p) => ({ horizon: p.horizon, label: p.label, tasks: p.tasks.map((t) => ({ area: t.area, task: t.task })) })),
    streets: (sb?.streets ?? []).map((st) => ({ key: st.key, city: st.city, street: st.street, recruitmentScore: st.recruitmentScore, opportunity: st.opportunity, transactions: st.transactions, marketShare: st.marketShare, aiRecommendation: st.aiRecommendation, evidence: st.evidence })),
    buildings: (sb?.buildings ?? []).map((b) => ({ key: b.key, label: b.label, city: b.city, recruitmentPriority: b.recruitmentPriority, opportunityScore: b.opportunityScore, luxuryScore: b.luxuryScore, transactions: b.transactions, evidence: b.evidence })),
    streetSummary: sb?.summary ?? { streets: 0, buildings: 0, activeStreets: 0, highOpportunity: 0, avgRecruitment: 0 },
    heat: (heat ?? []).map((h) => ({ name: h.localityName, demand: h.demand, supply: h.supply, opportunity: h.opportunity, heatLevel: h.heatLabel })),
    notes,
  };
  return assembleTerritoryOS(input);
}

/** The unified Territory OS command center (cached 10 min via compute-cache). */
export async function getTerritoryOS(city?: string): Promise<TerritoryOS> {
  const org = await orgId();
  const key = [city ?? "all"];
  if (org) {
    const hit = await getCache<TerritoryOS>(org, "territory_os", key);
    if (hit) return hit.value;
  }
  const os = await compose(city ?? null);
  if (org) await setCache(org, "territory_os", key, os as unknown as Json, { ttlSeconds: 600, version: os.version });
  return os;
}

// ── Broker /my integration (Part 9) ─────────────────────────────────────────
export async function getBrokerTerritory(): Promise<BrokerTerritorySummary> {
  const os = await getTerritoryOS().catch(() => null);
  if (!os) return { acquisitionStreets: [], buildings: [], opportunities: [], marketChanges: [] };
  return {
    acquisitionStreets: os.streets.filter((st) => st.opportunity === "high").slice(0, 5).map((st) => ({ street: st.street, city: st.city, score: st.recruitmentScore, href: "/territory" })),
    buildings: os.buildings.filter((b) => b.recruitmentPriority === "high").slice(0, 5).map((b) => ({ label: b.label, city: b.city, score: b.opportunityScore, href: "/territory" })),
    opportunities: os.recommendations.slice(0, 4).map((r) => ({ title: r.title, why: r.why, href: "/territory" })),
    marketChanges: os.marketShare.expansion.slice(0, 3).map((e) => ({ title: `הזדמנות הרחבה: ${e.name}`, detail: e.why })),
  };
}

// ── Property integration (Part 8) ───────────────────────────────────────────
export async function getPropertyTerritory(propertyId: string): Promise<PropertyTerritory | null> {
  const org = await orgId();
  if (!org || !propertyId) return null;
  const db = await createClient();
  let prop: Row | null = null;
  try {
    const { data } = await db.from("properties").select("city,neighborhood,street").eq("org_id", org).eq("id", propertyId).limit(1).maybeSingle();
    prop = (data as Row | null) ?? null;
  } catch { prop = null; }
  if (!prop) return null;
  const city = s(prop.city), neighborhood = s(prop.neighborhood), street = s(prop.street);

  const os = await getTerritoryOS(city ?? undefined).catch(() => null);
  const nScore = os?.neighborhoods.find((n) => n.name === neighborhood)?.score ?? null;
  const stScore = os?.streets.find((x) => x.street === street)?.recruitmentScore ?? null;
  const evidence: string[] = [];
  if (nScore != null) evidence.push(`ציון שכונה ${nScore}`);
  if (stScore != null) evidence.push(`ציון רחוב ${stScore}`);
  const best = Math.max(nScore ?? 0, stScore ?? 0);
  const importance: Priority = best >= 70 ? "high" : best >= 45 ? "medium" : "low";
  return {
    city, neighborhood, street,
    streetScore: stScore, buildingScore: null, neighborhoodScore: nScore,
    territoryImportance: importance,
    coverageContribution: importance === "high" ? "נכס באזור אסטרטגי — תורם משמעותית לכיסוי" : importance === "medium" ? "נכס באזור עם פוטנציאל" : "נכס באזור משני",
    evidence: evidence.length ? evidence : ["אין עדיין נתוני טריטוריה לאזור זה"],
  };
}

// ── Ask ZONO for territory (Part 10) ────────────────────────────────────────
export interface TerritoryAnswer { question: string; answer: string; items: { title: string; detail: string; href: string }[] }
export async function answerTerritoryQuestion(question: string): Promise<TerritoryAnswer> {
  const q = (question || "").trim();
  const os = await getTerritoryOS();
  const ref = (title: string, detail: string, href = "/territory") => ({ title, detail, href });

  if (/לגייס|גיוס|נכסים.*שבוע|איפה.*לגייס/.test(q)) {
    const st = os.streets.filter((x) => x.opportunity === "high").slice(0, 6);
    return { question: q, answer: st.length ? `${st.length} רחובות חמים לגיוס השבוע.` : "אין כרגע רחובות בהזדמנות גבוהה.", items: st.map((x) => ref(x.street, `ציון גיוס ${x.recruitmentScore} · ${x.transactions} עסקאות`)) };
  }
  if (/רחוב.*חם|הכי חם|רחוב/.test(q)) {
    const top = [...os.streets].sort((a, b) => b.recruitmentScore - a.recruitmentScore).slice(0, 5);
    return { question: q, answer: top.length ? `הרחוב החם ביותר: ${top[0].street}.` : "אין נתוני רחובות.", items: top.map((x) => ref(x.street, x.aiRecommendation)) };
  }
  if (/חלש|חלשים|איפה.*חלש/.test(q)) {
    const w = os.marketShare.weak.slice(0, 6);
    return { question: q, answer: w.length ? `${w.length} אזורים חלשים דורשים חיזוק.` : "אין אזורים חלשים בולטים.", items: w.map((x) => ref(x.name, `ציון ${x.score}`)) };
  }
  if (/בניין|בניינים/.test(q)) {
    const b = [...os.buildings].sort((a, b2) => b2.opportunityScore - a.opportunityScore).slice(0, 5);
    return { question: q, answer: b.length ? `הבניין המעניין ביותר: ${b[0].label}.` : "אין נתוני בניינים.", items: b.map((x) => ref(x.label, `הזדמנות ${x.opportunityScore} · יוקרה ${x.luxuryScore}`)) };
  }
  if (/מתחר|מתחזק|תחרות/.test(q)) {
    const c = os.neighborhoods.filter((n) => (n.competition ?? 0) >= 55).slice(0, 6);
    return { question: q, answer: c.length ? `${c.length} אזורים עם תחרות גוברת.` : "אין לחץ תחרותי בולט.", items: c.map((x) => ref(x.name, `תחרות ${x.competition}`)) };
  }
  return { question: q, answer: os.score.aiSummary, items: os.recommendations.slice(0, 5).map((r) => ref(r.title, r.why)) };
}
