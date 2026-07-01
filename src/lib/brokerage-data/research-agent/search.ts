// ============================================================================
// 🔎 Research Agent — staged search queries + vendor wrapper (server-only-safe
// but pure query building). Phase 26.4.13.
// ----------------------------------------------------------------------------
// The agent NEVER stops after one search. It runs a staged loop of real public
// queries (franchises, independents, directories, portals, social), then
// cross-references each discovered office. Query building is deterministic.
// ============================================================================
import type { activeSearchVendor } from "../broker-research/providers";
import type { AgentOptions, ResearchStage, SearchRecord } from "./types";

export type Vendor = NonNullable<ReturnType<typeof activeSearchVendor>>;
export type Hit = { title: string | null; url: string | null; snippet: string | null };

/** The staged query plan (Stages 1–6). Stage 7 (cross-reference) is per office. */
export function stageQueries(city: string, o: AgentOptions): { stage: ResearchStage; queries: string[] }[] {
  const plan: { stage: ResearchStage; queries: string[] }[] = [];
  // Stage 1 — city understanding (always).
  plan.push({ stage: "city_understanding", queries: [
    `משרדי תיווך ${city}`, `מתווכים ${city}`, `נדל"ן ${city}`, `משרד נדל"ן ${city}`,
  ] });
  // Stage 2 — franchise branches.
  if (o.includeFranchises !== false) plan.push({ stage: "franchises", queries: [
    `RE/MAX ${city}`, `רי/מקס ${city}`, `רימקס ${city}`, `אנגלו סכסון ${city}`,
    `Keller Williams ${city}`, `Century 21 ${city}`,
  ] });
  // Stage 3 — local independents.
  if (o.includeIndependents !== false) plan.push({ stage: "independents", queries: [
    `תיווך ${city} משרד`, `נדל"ן ${city} תיווך`, `דירות למכירה ${city} תיווך`, `משרד תיווך מומלץ ${city}`,
  ] });
  // Stage 4 — public directories.
  if (o.includeDirectories !== false) plan.push({ stage: "directories", queries: [
    `תיווך ${city} B144`, `משרד תיווך ${city} דפי זהב`, `נדל"ן ${city} עסקים`,
  ] });
  // Stage 5 — listing portals.
  if (o.includePortals !== false) plan.push({ stage: "portals", queries: [
    `יד2 תיווך ${city}`, `מדלן משרד תיווך ${city}`, `nadlan תיווך ${city}`,
  ] });
  // Stage 6 — social.
  if (o.includeSocial !== false) plan.push({ stage: "social", queries: [
    `תיווך ${city} Facebook`, `נדל"ן ${city} אינסטגרם`, `משרד תיווך ${city} LinkedIn`,
  ] });
  return plan;
}

/** Cross-reference queries for one discovered office (Stage 7). */
export function crossRefQueries(officeName: string, city: string): string[] {
  return [
    `${officeName} ${city}`, `${officeName} תיווך`, `${officeName} נדל"ן`,
    `${officeName} טלפון`, `${officeName} אתר`, `${officeName} Facebook`,
  ];
}

/** Run one query, bounded, returning a SearchRecord + hits (never throws). */
export async function runQuery(vendor: Vendor, stage: ResearchStage, query: string): Promise<{ record: SearchRecord; hits: Hit[] }> {
  const t0 = Date.now();
  try {
    const hits = await vendor.run(query);
    return { record: { stage, query, hits: hits.length, ms: Date.now() - t0, error: null }, hits };
  } catch (e) {
    return { record: { stage, query, hits: 0, ms: Date.now() - t0, error: e instanceof Error ? e.message : "search error" }, hits: [] };
  }
}
