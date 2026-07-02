// ============================================================================
// 🏠 Listing Intelligence Agent — service (server-only). 29.3.
// Assembles per-property signals from the EXISTING engines/data (properties +
// buyer↔property matches + activities + city Competitive Intelligence + Truth
// Engine + Mission Action Center), builds one scorecard per property and exposes
// signals for the agent runtime. Read-only; evidence-only; nothing auto-executes.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCityCompetitiveDashboard } from "@/lib/brokerage-data/competitive-intelligence";
import { computeTruthScore } from "@/lib/truth-engine";
import { getActionCenter } from "@/lib/mission-engine";
import { buildScorecard } from "./scorecard";
import { computeValuationView, NO_VALUATION, type ValuationInput } from "./valuation";
import type { ListingSignals, PropertyScorecard } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };
const DAY = 86400000;
const daysBetween = (iso: string | null, now: number): number | null => (iso ? Math.max(0, Math.round((now - new Date(iso).getTime()) / DAY)) : null);

async function assembleSignals(orgId: string | null, limit: number): Promise<{ signals: ListingSignals[]; notes: string[] }> {
  const notes: string[] = [];
  const now = Date.now();
  const db = await createClient();
  const safe = async (t: string, cols: string, cap: number): Promise<Row[]> => { try { const { data } = await db.from(t as never).select(cols).limit(cap); return (data ?? []) as Row[]; } catch { return []; } };

  const propRows = await safe("properties", "id,title,city,type,status,listing_kind,price,rooms,size_sqm,seller_id,zono_score,estimated_days_to_sell,has_exclusivity,exclusivity_ends_at,listed_at,created_at,updated_at", 200);
  if (!propRows.length) { notes.push("אין נכסים במערכת עדיין — צור נכסים כדי להפעיל את סוכן המודעות."); return { signals: [], notes }; }

  const ids = propRows.slice(0, limit).map((r) => String(r.id));

  // Demand from buyer↔property matches.
  const matchAgg = new Map<string, { count: number; sum: number }>();
  for (const m of await safe("buyer_property_matches", "linked_property_id,match_score", 5000)) { const pid = s(m.linked_property_id); if (!pid) continue; const a = matchAgg.get(pid) ?? { count: 0, sum: 0 }; a.count += 1; a.sum += num(m.match_score) ?? 0; matchAgg.set(pid, a); }

  // Recent buyer activity per property (best-effort).
  const actAgg = new Map<string, number>(); const lastAct = new Map<string, string>();
  for (const a of await safe("activities", "property_id,occurred_at", 5000)) { const pid = s(a.property_id); const at = s(a.occurred_at); if (!pid) continue; if (at && (now - new Date(at).getTime()) / DAY <= 30) actAgg.set(pid, (actAgg.get(pid) ?? 0) + 1); if (at && (!lastAct.get(pid) || at > lastAct.get(pid)!)) lastAct.set(pid, at); }

  // City competitive snapshots (bounded, cached).
  const cities = [...new Set(propRows.slice(0, limit).map((r) => s(r.city)).filter((x): x is string => !!x))].slice(0, 8);
  const marketByCity = new Map<string, ListingSignals["market"]>();
  await Promise.all(cities.map(async (c) => { try { const d = await getCityCompetitiveDashboard(c); marketByCity.set(c, { inventoryTrendPct: d.snapshot.inventoryTrendPct, concentrationLevel: d.snapshot.concentrationLevel, topSharePct: d.snapshot.topOfficeSharePct }); } catch { /* none */ } }));

  // READ-ONLY valuation lookup — latest completed valuation per property (29.3.1).
  // No formula change, no fake valuation. Missing/stale handled honestly.
  const valById = new Map<string, ValuationInput>();
  for (const r of await safe("property_valuations", "property_id,status,estimated_value,low_value,high_value,confidence_score,confidence_level,created_at", 3000)) {
    const pid = s(r.property_id); if (!pid || !ids.includes(pid)) continue;
    if ((s(r.status) ?? "") !== "completed") continue;
    const at = s(r.created_at);
    const prev = valById.get(pid);
    // keep the most recent completed valuation
    if (prev && prev.createdAt && at && prev.createdAt >= at) continue;
    const cScore = num(r.confidence_score);
    const cLabel = s(r.confidence_level);
    const confidence = cScore != null ? Math.round(cScore <= 1 ? cScore * 100 : cScore) : cLabel === "high" ? 80 : cLabel === "medium" ? 55 : cLabel === "low" ? 30 : null;
    valById.set(pid, { available: true, estimatedValue: num(r.estimated_value), lowValue: num(r.low_value), highValue: num(r.high_value), confidence, createdAt: at, unavailableReason: null });
  }

  // Open missions per property (from Action Center).
  const openByProp = new Map<string, number>();
  try { const ac = await getActionCenter(orgId); for (const b of [ac.critical, ac.highPriority, ac.inProgress, ac.blocked, ac.waiting, ac.recentlyCreated]) for (const mm of b) if (mm.entityType === "property" && mm.entityId) openByProp.set(mm.entityId, (openByProp.get(mm.entityId) ?? 0) + 1); } catch { /* none */ }

  const signals: ListingSignals[] = propRows.slice(0, limit).map((r) => {
    const id = String(r.id);
    const agg = matchAgg.get(id) ?? { count: 0, sum: 0 };
    const avgMatchScore = agg.count ? Math.round(agg.sum / agg.count) : 0;
    const listedAt = s(r.listed_at) ?? s(r.created_at);
    const recentBuyerActivity = actAgg.get(id) ?? 0;
    const lastActivityAt = lastAct.get(id) ?? s(r.updated_at);
    const vInput = valById.get(id);
    const valuation = vInput ? computeValuationView(num(r.price), vInput, now) : NO_VALUATION;
    const truth = computeTruthScore({
      entityType: "property", entityId: id, entityName: s(r.title),
      evidence: [...Array(Math.min(agg.count, 10)).fill(0).map(() => ({ source: "match_engine", sourceType: "match", at: s(r.updated_at), stance: "support" as const })), ...Array(Math.min(recentBuyerActivity, 10)).fill(0).map(() => ({ source: "activity", sourceType: "activity", at: lastActivityAt, stance: "support" as const }))],
      lastSeenAt: lastActivityAt, baseConfidence: num(r.zono_score),
    });
    return {
      id, title: s(r.title) ?? "נכס", city: s(r.city), type: s(r.type), status: s(r.status) ?? "active", listingKind: s(r.listing_kind) ?? "sale",
      price: num(r.price), rooms: num(r.rooms), sizeSqm: num(r.size_sqm),
      listedAt, createdAt: s(r.created_at), updatedAt: s(r.updated_at),
      timeOnMarketDays: daysBetween(listedAt, now),
      zonoScore: num(r.zono_score), estimatedDaysToSell: num(r.estimated_days_to_sell), hasExclusivity: !!r.has_exclusivity, exclusivityEndsAt: s(r.exclusivity_ends_at),
      matchCount: agg.count, avgMatchScore, recentBuyerActivity,
      market: r.city ? marketByCity.get(String(r.city)) ?? null : null,
      sellerLinked: !!s(r.seller_id), valuationEstimate: valuation.estimatedValue, valuation, campaignActive: null, lastActivityAt,
      openMissions: openByProp.get(id) ?? 0, truthScore: truth.truthScore,
    };
  });

  void ids;
  return { signals, notes };
}

/** Signals for the agent runtime (injected into the framework context). */
export async function getListingSignals(orgId: string | null, limit = 20): Promise<ListingSignals[]> {
  try { return (await assembleSignals(orgId, limit)).signals; } catch { return []; }
}

export interface ListingScorecardsOverview {
  version: string; generatedAt: string;
  totals: { properties: number; healthy: number; critical: number; luxury: number; stale: number; highOpportunity: number };
  scorecards: PropertyScorecard[];
  notes: string[];
}

/** Part 10 — one scorecard per property (dashboard). */
export async function getListingScorecards(orgId: string | null, limit = 30): Promise<ListingScorecardsOverview> {
  const { signals, notes } = await assembleSignals(orgId, limit);
  const now = Date.now();
  const scorecards = signals.map((sig) => buildScorecard(sig, now));
  const has = (c: PropertyScorecard, t: string) => c.classification.includes(t);
  return {
    version: "29.3", generatedAt: new Date(now).toISOString(),
    totals: {
      properties: scorecards.length,
      healthy: scorecards.filter((c) => c.health.label === "בריא").length,
      critical: scorecards.filter((c) => c.health.label === "קריטי" || has(c, "קריטי")).length,
      luxury: scorecards.filter((c) => has(c, "יוקרה")).length,
      stale: scorecards.filter((c) => has(c, "מתיישן")).length,
      highOpportunity: scorecards.filter((c) => has(c, "הזדמנות גבוהה")).length,
    },
    scorecards: [...scorecards].sort((a, b) => (b.risks.some((r) => r.severity === "high") ? 1 : 0) - (a.risks.some((r) => r.severity === "high") ? 1 : 0) || b.health.urgency - a.health.urgency),
    notes,
  };
}
