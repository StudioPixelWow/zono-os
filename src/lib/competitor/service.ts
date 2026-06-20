/**
 * Competitor Intelligence service — server-only. Builds competitor profiles +
 * per-locality market positions + signals from confirmed broker listings,
 * external-listing inventory and market snapshots. Org-scoped (RLS).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database } from "@/lib/supabase/types";
import { buildCompetitorAi, isDominant, scoreCompetitor, type CompetitorAggregate } from "./engine";
import { normalizeHebrewName } from "@/lib/broker/engine";

type DB = Database["public"]["Tables"];
export type CompetitorProfileRow = DB["competitor_profiles"]["Row"];
const DAY = 86_400_000;
const cityNorm = (s: string | null | undefined) => (s ? s.trim().toLowerCase() : "");

async function requireProfile() {
  const { profile } = await getSessionContext();
  if (!profile) throw new Error("not authenticated");
  return profile;
}

export interface CompetitorRecomputeSummary { competitors: number; signals: number }

export async function recomputeCompetitorsForOrg(): Promise<CompetitorRecomputeSummary> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const orgId = profile.org_id;
  const now = Date.now();
  const d7 = new Date(now - 7 * DAY).toISOString();
  const d30 = new Date(now - 30 * DAY).toISOString();

  const [activeRes, removedRes, brokersRes, mktRes] = await Promise.all([
    supabase.from("external_listings").select("city,price,sqm,detected_broker_id,detected_broker_name,contact_name,broker_detection_status,first_seen_at,listing_source_type")
      .eq("status", "active").limit(4000),
    supabase.from("external_listings").select("city,detected_broker_id,broker_detection_status,removed_at")
      .eq("status", "removed").not("detected_broker_id", "is", null).gte("removed_at", d30).limit(4000),
    supabase.from("broker_profiles").select("id,display_name,broker_type"),
    supabase.from("market_area_snapshots").select("locality_name,date,avg_price_per_sqm,demand_score,supply_score").order("date", { ascending: false }).limit(500),
  ]);

  const active = activeRes.data ?? [];
  const brokerMeta = new Map((brokersRes.data ?? []).map((b) => [b.id, { name: b.display_name, type: b.broker_type }]));

  // A "competitor" is any publisher classified as broker/agency OR matched to a
  // broker profile. Identity = broker_profile_id when known, else the publisher
  // name — so competitors surface even without a formal broker profile.
  const identityOf = (l: { detected_broker_id: string | null; detected_broker_name: string | null; contact_name: string | null; listing_source_type: string }): { key: string; brokerProfileId: string | null; name: string; type: string } | null => {
    const isBrokerish = !!l.detected_broker_id || l.listing_source_type === "broker" || l.listing_source_type === "agency" || l.listing_source_type === "office";
    if (!isBrokerish) return null;
    if (l.detected_broker_id) { const m = brokerMeta.get(l.detected_broker_id); return { key: l.detected_broker_id, brokerProfileId: l.detected_broker_id, name: m?.name ?? l.detected_broker_name ?? l.contact_name ?? "מתווך", type: m?.type ?? (l.listing_source_type === "agency" || l.listing_source_type === "office" ? "agency" : "independent_broker") }; }
    const nm = normalizeHebrewName(l.detected_broker_name ?? l.contact_name);
    if (!nm) return null;
    return { key: `name:${nm}`, brokerProfileId: null, name: l.detected_broker_name ?? l.contact_name ?? "מתווך", type: l.listing_source_type === "agency" || l.listing_source_type === "office" ? "agency" : "independent_broker" };
  };
  const confirmed = active.filter((l) => identityOf(l) != null);
  if (!confirmed.length) return { competitors: 0, signals: 0 };
  const idMeta = new Map<string, { brokerProfileId: string | null; name: string; type: string }>();

  // Locality totals (denominator) + market avg ₪/m² per city.
  const localityTotal = new Map<string, number>();
  const cityAcc = new Map<string, { sum: number; n: number }>();
  for (const l of active) {
    const c = cityNorm(l.city); if (!c) continue;
    localityTotal.set(c, (localityTotal.get(c) ?? 0) + 1);
    if (l.price && l.sqm) { const a = cityAcc.get(c) ?? { sum: 0, n: 0 }; a.sum += l.price / l.sqm; a.n++; cityAcc.set(c, a); }
  }
  const cityAvgSqm = new Map([...cityAcc].map(([c, a]) => [c, a.n ? a.sum / a.n : 0]));
  const mktByCity = new Map<string, { avgSqm: number | null; demand: number; supply: number }>();
  for (const m of mktRes.data ?? []) { const k = cityNorm(m.locality_name); if (!mktByCity.has(k)) mktByCity.set(k, { avgSqm: m.avg_price_per_sqm, demand: m.demand_score, supply: m.supply_score }); }

  // Group confirmed listings by broker → per-locality stats.
  interface Loc { count: number; priceSum: number; priceN: number; sqmSum: number; sqmN: number; added7: number; added30: number; exclusives: number }
  const byBroker = new Map<string, { localities: Map<string, Loc>; firstSeen: string | null; lastSeen: string | null }>();
  const newLoc = (): Loc => ({ count: 0, priceSum: 0, priceN: 0, sqmSum: 0, sqmN: 0, added7: 0, added30: 0, exclusives: 0 });
  for (const l of confirmed) {
    const ident = identityOf(l); if (!ident) continue;
    const bid = ident.key; idMeta.set(bid, { brokerProfileId: ident.brokerProfileId, name: ident.name, type: ident.type });
    const c = cityNorm(l.city); if (!c) continue;
    const b = byBroker.get(bid) ?? { localities: new Map(), firstSeen: null, lastSeen: null };
    const loc = b.localities.get(c) ?? newLoc();
    loc.count++;
    if (l.price) { loc.priceSum += l.price; loc.priceN++; }
    if (l.price && l.sqm) { loc.sqmSum += l.price / l.sqm; loc.sqmN++; }
    if (l.first_seen_at && l.first_seen_at >= d7) loc.added7++;
    if (l.first_seen_at && l.first_seen_at >= d30) loc.added30++;
    if (l.listing_source_type === "exclusive") loc.exclusives++;
    b.localities.set(c, loc);
    if (l.first_seen_at) { if (!b.firstSeen || l.first_seen_at < b.firstSeen) b.firstSeen = l.first_seen_at; if (!b.lastSeen || l.first_seen_at > b.lastSeen) b.lastSeen = l.first_seen_at; }
    byBroker.set(bid, b);
  }
  // removed (decline) by broker+locality
  const removedByBroker = new Map<string, Map<string, number>>();
  for (const r of removedRes.data ?? []) {
    if (!(r.broker_detection_status === "auto" || r.broker_detection_status === "approved")) continue;
    const bid = r.detected_broker_id as string; const c = cityNorm(r.city); if (!c) continue;
    const m = removedByBroker.get(bid) ?? new Map(); m.set(c, (m.get(c) ?? 0) + 1); removedByBroker.set(bid, m);
  }

  // Rank per locality across brokers.
  const localityRanks = new Map<string, { brokerId: string; count: number }[]>();
  for (const [bid, b] of byBroker) for (const [c, loc] of b.localities) { const arr = localityRanks.get(c) ?? []; arr.push({ brokerId: bid, count: loc.count }); localityRanks.set(c, arr); }
  for (const arr of localityRanks.values()) arr.sort((a, b) => b.count - a.count);
  const rankOf = (c: string, bid: string) => (localityRanks.get(c)?.findIndex((x) => x.brokerId === bid) ?? -1) + 1;

  // Build profile rows.
  const profileRows: DB["competitor_profiles"]["Insert"][] = [];
  const positionsByBroker = new Map<string, DB["competitor_market_positions"]["Insert"][]>();
  const signalsByBroker = new Map<string, { type: string; locality: string | null; title: string; description: string; severity: string; confidence: number }[]>();

  for (const [bid, b] of byBroker) {
    const meta = idMeta.get(bid) ?? { brokerProfileId: null, name: "מתחרה", type: "unknown" };
    let total = 0, added7 = 0, added30 = 0, removed30 = 0, exclusives = 0, shareSum = 0, maxShare = 0, sqmSum = 0, sqmN = 0;
    let topLocality: string | null = null, topShare = -1;
    const positions: DB["competitor_market_positions"]["Insert"][] = [];
    const removedMap = removedByBroker.get(bid) ?? new Map();
    for (const [c, loc] of b.localities) {
      total += loc.count; added7 += loc.added7; added30 += loc.added30; exclusives += loc.exclusives;
      const rem = removedMap.get(c) ?? 0; removed30 += rem;
      const denom = localityTotal.get(c) ?? loc.count;
      const share = denom > 0 ? (loc.count / denom) * 100 : 0;
      shareSum += share; if (share > maxShare) maxShare = share;
      if (share > topShare) { topShare = share; topLocality = c; }
      if (loc.sqmN) { sqmSum += loc.sqmSum; sqmN += loc.sqmN; }
      const change30 = loc.added30 - rem;
      positions.push({
        organization_id: orgId, competitor_profile_id: "", locality: c, listings_count: loc.count,
        market_share_percent: Math.round(share * 100) / 100,
        avg_price: loc.priceN ? Math.round(loc.priceSum / loc.priceN) : null,
        avg_price_per_sqm: loc.sqmN ? Math.round(loc.sqmSum / loc.sqmN) : null,
        exclusives_count: loc.exclusives, private_seller_loss_count: 0, inventory_change_30d: change30,
        growth_rate: loc.count > 0 ? Math.round((change30 / loc.count) * 10000) / 100 : 0, rank: rankOf(c, bid),
      });
    }
    const localities = b.localities.size;
    const brokerSqm = sqmN ? sqmSum / sqmN : 0;
    const cityAvg = topLocality ? (mktByCity.get(topLocality)?.avgSqm ?? cityAvgSqm.get(topLocality) ?? 0) : 0;
    const agg: CompetitorAggregate = {
      competitorType: meta.type, totalListings: total, localities,
      weightedMarketShare: localities ? shareSum / localities : 0, maxLocalityShare: maxShare,
      exclusives, added30, removed30, added7,
      avgPriceVsMarket: cityAvg > 0 && brokerSqm > 0 ? brokerSqm / cityAvg : 1,
    };
    const scores = scoreCompetitor(agg);
    const ai = buildCompetitorAi({ name: meta.name, scores, agg, topLocality });
    const dominant = positions.filter((p) => isDominant(meta.type, p.market_share_percent ?? 0)).map((p) => ({ locality: p.locality, share: p.market_share_percent ?? 0 }));

    profileRows.push({
      organization_id: orgId, broker_profile_id: meta.brokerProfileId, display_name: meta.name, competitor_type: meta.type,
      metadata: { identity: bid } as never,
      market_share_score: scores.market_share_score, inventory_strength_score: scores.inventory_strength_score,
      growth_score: scores.growth_score, exclusivity_score: scores.exclusivity_score,
      pricing_power_score: scores.pricing_power_score, activity_score: scores.activity_score,
      acquisition_risk_score: scores.acquisition_risk_score, opportunity_score: scores.opportunity_score,
      total_listings: total, active_localities: localities, dominant_localities: dominant as never,
      first_seen_at: b.firstSeen, last_seen_at: b.lastSeen,
      ai_summary: ai.ai_summary, ai_risk_summary: ai.ai_risk_summary, ai_opportunity_summary: ai.ai_opportunity_summary,
    });
    positionsByBroker.set(bid, positions);

    const sig: { type: string; locality: string | null; title: string; description: string; severity: string; confidence: number }[] = [];
    for (const dl of dominant) sig.push({ type: "dominant_broker", locality: dl.locality, title: `${meta.name} שולט ב${dl.locality}`, description: `${dl.share}% מהמלאי החיצוני באזור`, severity: "warning", confidence: 80 });
    const net = added30 - removed30;
    if (net >= 3) sig.push({ type: "competitor_growing", locality: topLocality, title: `${meta.name} מתחזק`, description: `+${net} מודעות ב-30 יום`, severity: "warning", confidence: 75 });
    if (net <= -3) sig.push({ type: "competitor_losing_inventory", locality: topLocality, title: `${meta.name} מאבד מלאי`, description: `${net} מודעות ב-30 יום — הזדמנות גיוס`, severity: "info", confidence: 75 });
    if (scores.acquisition_risk_score >= 65) sig.push({ type: "vulnerable_broker", locality: topLocality, title: `${meta.name} פגיע`, description: ai.ai_opportunity_summary, severity: "info", confidence: 70 });
    if (scores.exclusivity_score >= 50) sig.push({ type: "exclusivity_leader", locality: topLocality, title: `${meta.name} מוביל בבלעדיות`, description: `${scores.exclusivity_score}% מהמלאי בבלעדיות`, severity: "info", confidence: 65 });
    signalsByBroker.set(bid, sig);
  }

  // Full regeneration (delete cascades positions + signals via FK).
  await supabase.from("competitor_profiles").delete().eq("organization_id", orgId);
  for (let i = 0; i < profileRows.length; i += 500) { const c = profileRows.slice(i, i + 500); if (c.length) await supabase.from("competitor_profiles").insert(c as never); }
  const { data: profs } = await supabase.from("competitor_profiles").select("id,metadata").eq("organization_id", orgId);
  const idByBroker = new Map<string, string>();
  for (const p of profs ?? []) { const k = (p.metadata as { identity?: string })?.identity; if (k) idByBroker.set(k, p.id); }
  const profIds = (profs ?? []).map((p) => p.id);

  if (profIds.length) {
    const posRows: DB["competitor_market_positions"]["Insert"][] = [];
    const sigRows: DB["competitor_signals"]["Insert"][] = [];
    for (const [bid, positions] of positionsByBroker) { const pid = idByBroker.get(bid); if (!pid) continue; for (const p of positions) posRows.push({ ...p, competitor_profile_id: pid }); }
    for (const [bid, sigs] of signalsByBroker) { const pid = idByBroker.get(bid); if (!pid) continue; for (const s of sigs) sigRows.push({ organization_id: orgId, competitor_profile_id: pid, signal_type: s.type, locality: s.locality, title: s.title, description: s.description, severity: s.severity, confidence_score: s.confidence }); }
    if (posRows.length) await supabase.from("competitor_market_positions").insert(posRows as never);
    if (sigRows.length) await supabase.from("competitor_signals").insert(sigRows as never);
    return { competitors: profileRows.length, signals: sigRows.length };
  }
  return { competitors: profileRows.length, signals: 0 };
}

// ── Read models ──────────────────────────────────────────────────────────────
export interface CompetitorCommandCenter {
  total: number; dominant: number; growing: number; declining: number; opportunities: number; avgConcentration: number;
}
export interface LocalityRanking { locality: string; leader: string; leaderShare: number; competitors: number; concentration: number }

export async function getCompetitorBoard(): Promise<{ cc: CompetitorCommandCenter; competitors: CompetitorProfileRow[]; localities: LocalityRanking[]; signals: DB["competitor_signals"]["Row"][] }> {
  const supabase = await createClient();
  const [profsRes, posRes, sigRes] = await Promise.all([
    supabase.from("competitor_profiles").select("*").order("market_share_score", { ascending: false }).limit(200),
    supabase.from("competitor_market_positions").select("locality,listings_count,market_share_percent,competitor_profile_id,rank").limit(2000),
    supabase.from("competitor_signals").select("*").order("confidence_score", { ascending: false }).limit(100),
  ]);
  const competitors = profsRes.data ?? [];
  const nameById = new Map(competitors.map((c) => [c.id, c.display_name]));
  const positions = posRes.data ?? [];

  // Locality rankings.
  const byLoc = new Map<string, { brokerId: string; count: number; share: number }[]>();
  for (const p of positions) { const arr = byLoc.get(p.locality) ?? []; arr.push({ brokerId: p.competitor_profile_id, count: p.listings_count, share: p.market_share_percent }); byLoc.set(p.locality, arr); }
  const localities: LocalityRanking[] = [...byLoc.entries()].map(([locality, arr]) => {
    arr.sort((a, b) => b.share - a.share);
    const top3 = arr.slice(0, 3).reduce((s, x) => s + x.share, 0);
    return { locality, leader: nameById.get(arr[0].brokerId) ?? "—", leaderShare: arr[0].share, competitors: arr.length, concentration: Math.round(top3) };
  }).sort((a, b) => b.leaderShare - a.leaderShare);

  const cc: CompetitorCommandCenter = {
    total: competitors.length,
    dominant: competitors.filter((c) => Array.isArray(c.dominant_localities) && (c.dominant_localities as unknown[]).length > 0).length,
    growing: competitors.filter((c) => c.growth_score >= 60).length,
    declining: competitors.filter((c) => c.acquisition_risk_score >= 65).length,
    opportunities: competitors.filter((c) => c.opportunity_score >= 60).length,
    avgConcentration: localities.length ? Math.round(localities.reduce((s, l) => s + l.concentration, 0) / localities.length) : 0,
  };
  return { cc, competitors, localities, signals: sigRes.data ?? [] };
}

export interface CompetitorDetail {
  profile: CompetitorProfileRow;
  positions: DB["competitor_market_positions"]["Row"][];
  signals: DB["competitor_signals"]["Row"][];
  listings: { id: string; title: string | null; city: string | null; price: number | null }[];
}
export async function getCompetitorDetail(id: string): Promise<CompetitorDetail | null> {
  const supabase = await createClient();
  const { data: profile } = await supabase.from("competitor_profiles").select("*").eq("id", id).maybeSingle();
  if (!profile) return null;
  const [{ data: positions }, { data: signals }, listingsRes] = await Promise.all([
    supabase.from("competitor_market_positions").select("*").eq("competitor_profile_id", id).order("listings_count", { ascending: false }),
    supabase.from("competitor_signals").select("*").eq("competitor_profile_id", id),
    profile.broker_profile_id
      ? supabase.from("external_listings").select("id,title,city,price").eq("detected_broker_id", profile.broker_profile_id).eq("status", "active").limit(100)
      : supabase.from("external_listings").select("id,title,city,price,contact_name,detected_broker_name").or(`detected_broker_name.eq.${profile.display_name},contact_name.eq.${profile.display_name}`).eq("status", "active").limit(100),
  ]);
  return { profile, positions: positions ?? [], signals: signals ?? [], listings: (listingsRes.data ?? []) as { id: string; title: string | null; city: string | null; price: number | null }[] };
}
