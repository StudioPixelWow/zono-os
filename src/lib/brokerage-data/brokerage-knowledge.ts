// ============================================================================
// 🧠 Persistent Brokerage Knowledge Base™ (Phase 26.4.8). Server-only, READ layer.
// Brokerage intelligence is SYSTEM data — not owned by one broker/run/workflow.
// getBrokerageKnowledgeForCity(orgId, city) returns everything the org already
// learned about a city so callers reuse it BEFORE running expensive research.
// Uses existing tables only. No schema change.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { detectFranchise } from "./franchise";
import { isAcceptableOfficeName } from "./office-name-guard";
import { normalizeHebrewName, normalizePhoneNumber } from "./normalize";
import { activeSearchVendor } from "./broker-research/providers";

// ── Lazy-learning freshness thresholds (Phase 26.4.9) — constants, not magic ──
export const CITY_FRESHNESS = {
  minCoverage: 60,        // coverageScore below → bootstrap / deep refresh
  minConfidence: 70,      // confidenceScore below → refresh
  researchStaleDays: 60,  // lastResearchAt older → refresh
  refreshStaleDays: 30,   // lastRefreshAt older → light refresh
} as const;

type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

const HEB_FINALS: Record<string, string> = { "ך": "כ", "ם": "מ", "ן": "נ", "ף": "פ", "ץ": "צ" };
export function normCityKb(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/[׳״"'`]/g, "").replace(/[-־–—_]/g, " ")
    .replace(/קריי/g, "קרי").replace(/[ךםןףץ]/g, (c) => HEB_FINALS[c] ?? c)
    .replace(/\s+/g, " ").trim().toLowerCase();
}
/** Stable office key shared across discovery, matching and relink. */
export function officeKey(name: string): string {
  const fr = detectFranchise(name);
  return `${fr.normalizedBrand}|${normalizeHebrewName(name)}`;
}

export interface KnownOffice {
  id: string; name: string; normalizedName: string; key: string;
  brandNetwork: string | null; status: string;
  phones: string[]; domains: string[]; website: string | null;
  confidence: number; brokerCount: number; lastSeenAt: string | null; lastVerifiedAt: string | null;
  fromKnowledgeBase: true;
}
export interface KnownBroker { id: string; name: string; phone: string | null; officeId: string | null }
export interface CityKnowledge {
  city: string; cityNormalized: string; cityVariants: string[];
  verifiedOffices: KnownOffice[];          // status active, evidence-backed
  candidateOffices: { name: string; status: string; confidence: number }[];
  brokers: KnownBroker[];
  brokersWithOffice: number;
  brokerOfficeLinks: number;
  contactPoints: { phones: string[]; domains: string[] };
  listingsInCity: number;
  listingsLinked: number;
  knownAliases: string[];                  // distinct office-name spellings seen
}

/** Everything the org already knows about a city. Read-only; existing tables only. */
export async function getBrokerageKnowledgeForCity(orgId: string, cityRaw: string): Promise<CityKnowledge> {
  const db = createServiceRoleClient();
  const cityNorm = normCityKb(cityRaw);
  const stem = cityRaw.trim().split(/\s+/).sort((a, b) => b.length - a.length)[0] ?? cityRaw.trim();
  const inCity = (c: unknown) => normCityKb(s(c)) === cityNorm;
  void orgId; // brokerage tables are national (service-role); city is the scope key.

  const [officeRes, agentRes, candRes, linkRes] = await Promise.all([
    db.from("brokerage_offices" as never).select("id,name,normalized_name,brand_network,city,status,primary_phone,email,website,confidence_score,last_seen_at,last_verified_at,metadata").limit(20000),
    db.from("brokerage_agents" as never).select("id,full_name,primary_phone,whatsapp_phone,city,office_id").limit(20000),
    db.from("brokerage_office_candidates" as never).select("office_name,city,status,confidence,phone,domain").limit(20000),
    db.from("brokerage_external_listing_links" as never).select("office_id,external_listing_id,city").limit(50000),
  ]);

  const agents = ((agentRes.data ?? []) as Row[]).filter((r) => inCity(r.city));
  const variants = new Set<string>();
  for (const a of agents) if (s(a.city)) variants.add(s(a.city));

  const brokerCountByOffice = new Map<string, number>();
  for (const a of agents) { const oid = s(a.office_id); if (oid) brokerCountByOffice.set(oid, (brokerCountByOffice.get(oid) ?? 0) + 1); }

  const officeRows = ((officeRes.data ?? []) as Row[]).filter((r) => inCity(r.city));
  for (const o of officeRows) if (s(o.city)) variants.add(s(o.city));
  const candRows = ((candRes.data ?? []) as Row[]).filter((r) => inCity(r.city));
  for (const c of candRows) if (s(c.city)) variants.add(s(c.city));

  const phonesAll = new Set<string>();
  const domainsAll = new Set<string>();
  const aliases = new Set<string>();

  const verifiedOffices: KnownOffice[] = officeRows
    .filter((o) => (s(o.status) || "active") === "active" && isAcceptableOfficeName(s(o.name)))
    .map((o) => {
      const name = s(o.name);
      aliases.add(name);
      const phone = normalizePhoneNumber(s(o.primary_phone));
      const website = s(o.website) || null;
      if (phone) phonesAll.add(phone);
      const phones = phone ? [phone] : [];
      const domains = website ? [website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]] : [];
      for (const d of domains) domainsAll.add(d);
      return {
        id: s(o.id), name, normalizedName: s(o.normalized_name) || normalizeHebrewName(name), key: officeKey(name),
        brandNetwork: s(o.brand_network) || null, status: s(o.status) || "active",
        phones, domains, website, confidence: Number(o.confidence_score ?? 0),
        brokerCount: brokerCountByOffice.get(s(o.id)) ?? 0,
        lastSeenAt: s(o.last_seen_at) || null, lastVerifiedAt: s(o.last_verified_at) || null,
        fromKnowledgeBase: true as const,
      };
    });

  const candidateOffices = candRows
    .filter((c) => s(c.status) !== "rejected")
    .map((c) => { aliases.add(s(c.office_name)); if (s(c.phone)) phonesAll.add(normalizePhoneNumber(s(c.phone))); if (s(c.domain)) domainsAll.add(s(c.domain)); return { name: s(c.office_name), status: s(c.status) || "candidate_pending_verification", confidence: Number(c.confidence ?? 0) }; });

  const brokers: KnownBroker[] = agents.map((a) => ({ id: s(a.id), name: s(a.full_name), phone: normalizePhoneNumber(s(a.primary_phone) || s(a.whatsapp_phone)) || null, officeId: s(a.office_id) || null }));
  const brokersWithOffice = brokers.filter((b) => b.officeId).length;

  // Listings linked in this city (via the links table — count distinct listings).
  const cityListingIds = new Set<string>();
  const { data: cityListings } = await db.from("external_listings" as never).select("id").ilike("city", `%${stem}%`).limit(50000);
  for (const r of (cityListings ?? []) as Row[]) cityListingIds.add(s(r.id));
  const linkedSet = new Set<string>();
  for (const r of ((linkRes.data ?? []) as Row[])) { const lid = s(r.external_listing_id); if (s(r.office_id) && (cityListingIds.has(lid) || inCity(r.city))) linkedSet.add(lid); }

  return {
    city: cityRaw.trim(), cityNormalized: cityNorm, cityVariants: [...variants].slice(0, 10),
    verifiedOffices, candidateOffices, brokers, brokersWithOffice,
    brokerOfficeLinks: brokersWithOffice,
    contactPoints: { phones: [...phonesAll].filter(Boolean).slice(0, 50), domains: [...domainsAll].filter(Boolean).slice(0, 50) },
    listingsInCity: cityListingIds.size,
    listingsLinked: linkedSet.size,
    knownAliases: [...aliases].slice(0, 50),
  };
}

// ── National Brokerage Census (Phase 26.5) — coverage metrics, EVIDENCE-ONLY ──
export interface CityBrokerageCensus {
  city: string; cityNormalized: string; cityVariants: string[];
  estimatedActiveOffices: number;          // evidence-backed: verified + researching
  verifiedOffices: number; researchingOffices: number; avgOfficeConfidence: number;
  brokersTotal: number; brokersMatched: number; brokersUnmatched: number; brokerCoveragePct: number;
  listingsTotal: number; listingsLinked: number; listingsUnlinked: number; listingCoveragePct: number;
  officeCoveragePct: number; marketCoveragePct: number;
  contactPoints: number;
  lastResearchAt: string | null;
  missingKnowledge: { unmatchedBrokers: number; unlinkedListings: number; unverifiedCandidates: number };
  offices: { id: string; name: string; brand: string | null; status: string; confidence: number; brokerCount: number; lastSeenAt: string | null; lastVerifiedAt: string | null; phones: string[]; website: string | null }[];
  unknownEstimable: false;                  // we NEVER fabricate total market size
  notes: string[];
}

/** Per-city census: how much of the brokerage market is covered, from real evidence. */
export async function getCityBrokerageCensus(orgId: string, city: string): Promise<CityBrokerageCensus> {
  const kb = await getBrokerageKnowledgeForCity(orgId, city);
  const verifiedOffices = kb.verifiedOffices.length;
  const researchingOffices = kb.candidateOffices.filter((c) => c.status !== "verified" && c.status !== "rejected").length;
  const estimatedActiveOffices = verifiedOffices + researchingOffices;
  const avgOfficeConfidence = verifiedOffices ? Math.round(kb.verifiedOffices.reduce((n, o) => n + o.confidence, 0) / verifiedOffices) : 0;
  const brokersTotal = kb.brokers.length;
  const brokersMatched = kb.brokersWithOffice;
  const brokersUnmatched = Math.max(0, brokersTotal - brokersMatched);
  const brokerCoveragePct = brokersTotal ? Math.round((brokersMatched / brokersTotal) * 100) : 0;
  const listingsTotal = kb.listingsInCity;
  const listingsLinked = kb.listingsLinked;
  const listingsUnlinked = Math.max(0, listingsTotal - listingsLinked);
  const listingCoveragePct = listingsTotal ? Math.round((listingsLinked / listingsTotal) * 100) : 0;
  const officeCoveragePct = estimatedActiveOffices ? Math.round((verifiedOffices / estimatedActiveOffices) * 100) : 0;
  // Composite market coverage = mean of the three evidence-based coverages present.
  const parts = [officeCoveragePct, brokerCoveragePct, listingCoveragePct].filter((_, i) => [estimatedActiveOffices, brokersTotal, listingsTotal][i] > 0);
  const marketCoveragePct = parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0;
  const lastResearchAt = kb.verifiedOffices.map((o) => o.lastVerifiedAt || o.lastSeenAt).filter(Boolean).sort().pop() ?? null;

  const notes: string[] = [];
  notes.push("המספרים מבוססי-ראיות בלבד. סך השוק האמיתי ('לא ידוע') אינו ניתן לאמידה ללא מרשם חיצוני — ולכן אינו מומצא.");
  if (brokersUnmatched > 0) notes.push(`${brokersUnmatched} מתווכים בעיר עדיין ללא שיוך משרד.`);
  if (listingsUnlinked > 0) notes.push(`${listingsUnlinked} מודעות בעיר עדיין ללא שיוך משרד.`);

  return {
    city: kb.city, cityNormalized: kb.cityNormalized, cityVariants: kb.cityVariants,
    estimatedActiveOffices, verifiedOffices, researchingOffices, avgOfficeConfidence,
    brokersTotal, brokersMatched, brokersUnmatched, brokerCoveragePct,
    listingsTotal, listingsLinked, listingsUnlinked, listingCoveragePct,
    officeCoveragePct, marketCoveragePct,
    contactPoints: kb.contactPoints.phones.length + kb.contactPoints.domains.length,
    lastResearchAt,
    missingKnowledge: { unmatchedBrokers: brokersUnmatched, unlinkedListings: listingsUnlinked, unverifiedCandidates: researchingOffices },
    offices: kb.verifiedOffices.map((o) => ({ id: o.id, name: o.name, brand: o.brandNetwork, status: o.status, confidence: o.confidence, brokerCount: o.brokerCount, lastSeenAt: o.lastSeenAt, lastVerifiedAt: o.lastVerifiedAt, phones: o.phones, website: o.website })).sort((a, b) => b.brokerCount - a.brokerCount),
    unknownEstimable: false,
    notes,
  };
}

// ── Lazy City Learning status (Phase 26.4.9) — READ-ONLY evaluator ───────────
export type CityRecommendedAction = "BOOTSTRAP_CITY" | "REFRESH_CITY" | "REUSE_KNOWLEDGE" | "INSUFFICIENT_DATA";
export interface CityKnowledgeStatus {
  city: string; normalizedCity: string;
  existsInKnowledgeBase: boolean;
  verifiedOffices: number; researchingOffices: number;
  knownBrokers: number; knownListings: number; linkedListings: number; contactPoints: number;
  lastResearchAt: string | null; lastRefreshAt: string | null;
  coverageScore: number; confidenceScore: number; freshnessScore: number;
  stalenessReason: string | null;
  shouldBootstrap: boolean; shouldRefresh: boolean;
  recommendedAction: CityRecommendedAction;
  estimatedActiveOffices: number | null;   // total market size is UNKNOWN → null, never faked
}

/** Decide whether a city needs bootstrap, refresh, or can reuse existing knowledge. */
export async function getCityKnowledgeStatus(orgId: string, city: string): Promise<CityKnowledgeStatus> {
  const c = await getCityBrokerageCensus(orgId, city);
  const existsInKnowledgeBase = c.verifiedOffices > 0 || c.researchingOffices > 0 || c.brokersTotal > 0;
  const coverageScore = c.marketCoveragePct;
  const confidenceScore = c.avgOfficeConfidence;
  const ageDays = c.lastResearchAt ? (Date.now() - new Date(c.lastResearchAt).getTime()) / 86400000 : null;
  const freshnessScore = ageDays == null ? 0
    : ageDays <= CITY_FRESHNESS.refreshStaleDays ? 100
      : ageDays >= CITY_FRESHNESS.researchStaleDays ? 30
        : Math.round(100 - ((ageDays - CITY_FRESHNESS.refreshStaleDays) / (CITY_FRESHNESS.researchStaleDays - CITY_FRESHNESS.refreshStaleDays)) * 70);

  let stalenessReason: string | null = null;
  if (!existsInKnowledgeBase) stalenessReason = "העיר אינה מוכרת למערכת";
  else if (coverageScore < CITY_FRESHNESS.minCoverage) stalenessReason = `כיסוי נמוך (${coverageScore}%)`;
  else if (confidenceScore < CITY_FRESHNESS.minConfidence) stalenessReason = `אמינות נמוכה (${confidenceScore}%)`;
  else if (ageDays != null && ageDays > CITY_FRESHNESS.researchStaleDays) stalenessReason = `מחקר אחרון לפני ${Math.round(ageDays)} ימים`;
  else if (c.brokersUnmatched > 0 || c.listingsUnlinked > 0) stalenessReason = `${c.brokersUnmatched} מתווכים / ${c.listingsUnlinked} מודעות ללא שיוך`;

  const shouldBootstrap = !existsInKnowledgeBase || coverageScore < CITY_FRESHNESS.minCoverage;
  const shouldRefresh = !shouldBootstrap && (
    confidenceScore < CITY_FRESHNESS.minConfidence ||
    (ageDays != null && ageDays > CITY_FRESHNESS.researchStaleDays) || ageDays == null ||
    c.brokersUnmatched > 0 || c.listingsUnlinked > 0
  );
  const hasSignal = c.brokersTotal > 0 || c.listingsTotal > 0 || !!activeSearchVendor();

  let recommendedAction: CityRecommendedAction;
  if (shouldBootstrap) recommendedAction = hasSignal ? "BOOTSTRAP_CITY" : "INSUFFICIENT_DATA";
  else if (shouldRefresh) recommendedAction = "REFRESH_CITY";
  else recommendedAction = "REUSE_KNOWLEDGE";

  return {
    city: c.city, normalizedCity: c.cityNormalized,
    existsInKnowledgeBase,
    verifiedOffices: c.verifiedOffices, researchingOffices: c.researchingOffices,
    knownBrokers: c.brokersTotal, knownListings: c.listingsTotal, linkedListings: c.listingsLinked, contactPoints: c.contactPoints,
    lastResearchAt: c.lastResearchAt, lastRefreshAt: c.lastResearchAt,
    coverageScore, confidenceScore, freshnessScore, stalenessReason,
    shouldBootstrap, shouldRefresh, recommendedAction,
    estimatedActiveOffices: null,
  };
}
