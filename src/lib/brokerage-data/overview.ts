// ============================================================================
// 🧭 Brokerage Data — CANONICAL read model (Phase 26.9.8, server-only).
// ----------------------------------------------------------------------------
// ONE source of truth for every brokerage counter across the product. Computed
// with the SERVICE-ROLE client so the numbers are exact and internally
// consistent — they intentionally bypass the per-city RLS visibility filter
// (brokerage_city_visible / is_zono_owner) that previously made an agency owner
// see "0 agents / 0 offices" while links clearly existed. These counts MATCH the
// manual verification SQL one-for-one (global count(*) over the brokerage tables).
//
//   getBrokerageDataOverview()  ⇒  the object below.
//
// Nothing is fabricated. Offices are 0 until real evidence creates them. The
// action layer (actions.ts) gates this behind an authenticated org user with
// brokerage access; the read itself is global because brokerage_agents /
// brokerage_offices are national (no org_id) and the links are effectively the
// org's own scan output.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const numOr = (v: unknown, d = 0): number => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : d; };

export interface TopAgentRow {
  id: string;
  fullName: string;
  city: string | null;
  officeId: string | null;
  officeName: string | null;
  listingCount: number;
  confidenceScore: number;
  status: string;
  lastSeenAt: string | null;
}

/** Parsed metrics from the latest brokerage_refresh_runs.log entry (UI-friendly). */
export interface BrokerageRefreshMetrics {
  externalListingsWithAgent: number;
  agentsCreated: number;
  agentsTotalAfter: number;
  listingLinksCreated: number;
  listingLinksTotalAfter: number;
  linksWithAgentId: number;
  officesDetected: number;
  agentsWithOffice: number;
  agentsWithoutOffice: number;
  skippedSources: string[];
  errors: string[];
}

export interface BrokerageLatestRun {
  id: string;
  status: string;
  runType: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface BrokerageDataQuality {
  /** % of listing links that carry an agent_id. */
  linkCoverage: number;
  /** % of brokers resolved to an office. */
  resolutionRate: number;
  /** Composite 0–100 confidence in the brokerage graph completeness. */
  score: number;
  label: "ריק" | "ראשוני" | "טוב" | "מצוין";
}

export interface BrokerageDataOverview {
  agentsTotal: number;
  officesTotal: number;
  listingLinksTotal: number;
  listingLinksWithAgent: number;
  agentsWithOffice: number;
  agentsWithoutOffice: number;
  unresolvedAgents: number;
  pendingOfficeMatches: number;
  topAgentsByListings: TopAgentRow[];
  latestRefreshRun: BrokerageLatestRun | null;
  refreshMetrics: BrokerageRefreshMetrics | null;
  dataQuality: BrokerageDataQuality;
}

const EMPTY: BrokerageDataOverview = {
  agentsTotal: 0, officesTotal: 0, listingLinksTotal: 0, listingLinksWithAgent: 0,
  agentsWithOffice: 0, agentsWithoutOffice: 0, unresolvedAgents: 0, pendingOfficeMatches: 0,
  topAgentsByListings: [], latestRefreshRun: null, refreshMetrics: null,
  dataQuality: { linkCoverage: 0, resolutionRate: 0, score: 0, label: "ריק" },
};

function qualityLabel(score: number): BrokerageDataQuality["label"] {
  if (score >= 85) return "מצוין";
  if (score >= 55) return "טוב";
  if (score > 0) return "ראשוני";
  return "ריק";
}

/** Parse the latest run's jsonb log (an array with one diagnostics object). */
function parseRunMetrics(log: unknown, agentsTotal: number, listingLinksTotal: number, agentsWithOffice: number): BrokerageRefreshMetrics | null {
  const entry = Array.isArray(log) ? (log[0] as Row | undefined) : (log && typeof log === "object" ? (log as Row) : undefined);
  if (!entry) return null;
  const asArr = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : (typeof v === "string" && v ? [v] : []);
  return {
    externalListingsWithAgent: numOr(entry.external_listings_with_agent),
    agentsCreated: numOr(entry.agents_created),
    agentsTotalAfter: agentsTotal,
    listingLinksCreated: numOr(entry.listing_links_created),
    listingLinksTotalAfter: listingLinksTotal,
    linksWithAgentId: numOr(entry.links_with_agent_id),
    officesDetected: numOr(entry.offices_detected),
    agentsWithOffice,
    agentsWithoutOffice: Math.max(0, agentsTotal - agentsWithOffice),
    skippedSources: asArr(entry.skipped_reason).concat(asArr(entry.office_skipped_reason)),
    errors: asArr(entry.error),
  };
}

/**
 * Build the canonical overview. Exact head counts for totals + a single bounded
 * read of the link id-columns for the per-agent aggregation (distinct listings
 * per agent — never double counted), then one batched fetch of the top agents'
 * names + their office names. All service-role: RLS-independent and consistent.
 */
export async function getBrokerageDataOverview(orgId?: string | null): Promise<BrokerageDataOverview> {
  const db = createServiceRoleClient();

  const headCount = async (table: string, build?: (q: ReturnType<typeof db.from>) => unknown): Promise<number> => {
    try {
      let q = db.from(table as never).select("id", { count: "exact", head: true });
      if (build) q = build(q as never) as never;
      const { count } = await q;
      return count ?? 0;
    } catch { return 0; }
  };

  const [agentsTotal, officesTotal, agentsWithOffice, listingLinksTotal, listingLinksWithAgent, pendingOfficeMatches] = await Promise.all([
    headCount("brokerage_agents"),
    headCount("brokerage_offices"),
    headCount("brokerage_agents", (q) => (q as never as { not: (c: string, op: string, v: null) => unknown }).not("office_id", "is", null)),
    headCount("brokerage_external_listing_links"),
    headCount("brokerage_external_listing_links", (q) => (q as never as { not: (c: string, op: string, v: null) => unknown }).not("agent_id", "is", null)),
    headCount("brokerage_identity_matches", (q) => (q as never as { eq: (c: string, v: string) => unknown }).eq("status", "pending_review")),
  ]);

  // Per-agent distinct-listing aggregation (only the id columns; bounded read).
  const byAgent = new Map<string, number>();
  const seen = new Set<string>();
  try {
    const { data } = await db.from("brokerage_external_listing_links" as never)
      .select("external_listing_id,agent_id").not("agent_id", "is", null).limit(50000);
    for (const r of (data ?? []) as Row[]) {
      const agentId = s(r.agent_id); const listingId = s(r.external_listing_id) ?? "";
      if (!agentId) continue;
      const k = `${agentId}|${listingId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      byAgent.set(agentId, (byAgent.get(agentId) ?? 0) + 1);
    }
  } catch { /* leave empty */ }

  const topIds = [...byAgent.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([id]) => id);
  let topAgentsByListings: TopAgentRow[] = [];
  if (topIds.length) {
    const { data: agentRows } = await db.from("brokerage_agents" as never)
      .select("id,full_name,city,office_id,confidence_score,status,last_seen_at").in("id", topIds);
    const officeIds = Array.from(new Set(((agentRows ?? []) as Row[]).map((r) => s(r.office_id)).filter((x): x is string => !!x)));
    const officeNameById = new Map<string, string>();
    if (officeIds.length) {
      const { data: officeRows } = await db.from("brokerage_offices" as never).select("id,name").in("id", officeIds);
      for (const o of (officeRows ?? []) as Row[]) officeNameById.set(String(o.id), String(o.name ?? ""));
    }
    const byId = new Map<string, Row>(((agentRows ?? []) as Row[]).map((r) => [String(r.id), r]));
    topAgentsByListings = topIds.map((id) => {
      const r = byId.get(id);
      const officeId = r ? s(r.office_id) : null;
      return {
        id,
        fullName: r ? String(r.full_name ?? "") : "מתווך",
        city: r ? s(r.city) : null,
        officeId,
        officeName: officeId ? officeNameById.get(officeId) ?? null : null,
        listingCount: byAgent.get(id) ?? 0,
        confidenceScore: r ? numOr(r.confidence_score) : 0,
        status: r ? String(r.status ?? "candidate") : "candidate",
        lastSeenAt: r ? s(r.last_seen_at) : null,
      };
    });
  }

  // Latest refresh run (scoped to this org's scans when an orgId is known).
  let latestRefreshRun: BrokerageLatestRun | null = null;
  let refreshMetrics: BrokerageRefreshMetrics | null = null;
  try {
    const { data: runs } = await db.from("brokerage_refresh_runs" as never)
      .select("id,status,run_type,started_at,finished_at,parameters,log,created_at")
      .order("created_at", { ascending: false }).limit(50);
    const rows = (runs ?? []) as Row[];
    const match = orgId
      ? rows.find((r) => (r.parameters as { org_id?: string } | null)?.org_id === orgId) ?? rows[0]
      : rows[0];
    if (match) {
      latestRefreshRun = {
        id: String(match.id), status: String(match.status ?? "pending"), runType: String(match.run_type ?? "source"),
        startedAt: s(match.started_at), finishedAt: s(match.finished_at),
      };
      refreshMetrics = parseRunMetrics(match.log, agentsTotal, listingLinksTotal, agentsWithOffice);
    }
  } catch { /* runs optional */ }

  const agentsWithoutOffice = Math.max(0, agentsTotal - agentsWithOffice);
  const linkCoverage = listingLinksTotal ? Math.round((listingLinksWithAgent / listingLinksTotal) * 100) : 0;
  const resolutionRate = agentsTotal ? Math.round((agentsWithOffice / agentsTotal) * 100) : 0;
  // Composite: weight that we actually linked listings to brokers (the core
  // pipeline) more heavily than office resolution (a later, evidence-gated stage).
  const hasData = agentsTotal > 0 && listingLinksWithAgent > 0;
  const score = hasData ? Math.min(100, Math.round(linkCoverage * 0.7 + resolutionRate * 0.3)) : 0;

  return {
    agentsTotal, officesTotal, listingLinksTotal, listingLinksWithAgent,
    agentsWithOffice, agentsWithoutOffice, unresolvedAgents: agentsWithoutOffice, pendingOfficeMatches,
    topAgentsByListings, latestRefreshRun, refreshMetrics,
    dataQuality: { linkCoverage, resolutionRate, score, label: qualityLabel(score) },
  };
}

export const EMPTY_BROKERAGE_OVERVIEW = EMPTY;

// ── Broker Directory (Part 5) ────────────────────────────────────────────────
// The same canonical truth, shaped for a searchable broker directory. Real
// linked-listing counts (distinct listings via brokerage_external_listing_links),
// office names, observed top city + neighborhoods. Service-role; RLS-independent.

export interface DirectoryBroker {
  id: string;
  fullName: string;
  officeId: string | null;
  officeName: string | null;
  listingCount: number;
  city: string | null;
  topCity: string | null;
  topNeighborhoods: string[];
  primaryPhone: string | null;
  confidenceScore: number;
  status: string;
  lastSeenAt: string | null;
  resolved: boolean;
}

export interface BrokerDirectory {
  brokers: DirectoryBroker[];
  agentsTotal: number;
  officesTotal: number;
  listingLinksTotal: number;
  listingLinksWithAgent: number;
  cities: string[];
  offices: { id: string; name: string }[];
}

const topN = (m: Map<string, number>, n: number): string[] =>
  [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);

export async function getBrokerDirectory(limit = 800): Promise<BrokerDirectory> {
  const db = createServiceRoleClient();

  const headCount = async (table: string, build?: (q: ReturnType<typeof db.from>) => unknown): Promise<number> => {
    try {
      let q = db.from(table as never).select("id", { count: "exact", head: true });
      if (build) q = build(q as never) as never;
      const { count } = await q;
      return count ?? 0;
    } catch { return 0; }
  };
  const [agentsTotal, officesTotal, listingLinksTotal, listingLinksWithAgent] = await Promise.all([
    headCount("brokerage_agents"),
    headCount("brokerage_offices"),
    headCount("brokerage_external_listing_links"),
    headCount("brokerage_external_listing_links", (q) => (q as never as { not: (c: string, op: string, v: null) => unknown }).not("agent_id", "is", null)),
  ]);

  // Per-agent: distinct listings, city frequency, sampled listing ids (for neighborhoods).
  const listingsByAgent = new Map<string, Set<string>>();
  const cityFreqByAgent = new Map<string, Map<string, number>>();
  const sampleListingsByAgent = new Map<string, string[]>();
  try {
    const { data } = await db.from("brokerage_external_listing_links" as never)
      .select("external_listing_id,agent_id,city").not("agent_id", "is", null).limit(50000);
    for (const r of (data ?? []) as Row[]) {
      const agentId = s(r.agent_id); if (!agentId) continue;
      const listingId = s(r.external_listing_id) ?? "";
      let set = listingsByAgent.get(agentId); if (!set) { set = new Set(); listingsByAgent.set(agentId, set); }
      set.add(listingId);
      const city = s(r.city);
      if (city) { let cf = cityFreqByAgent.get(agentId); if (!cf) { cf = new Map(); cityFreqByAgent.set(agentId, cf); } cf.set(city, (cf.get(city) ?? 0) + 1); }
      const sample = sampleListingsByAgent.get(agentId) ?? [];
      if (sample.length < 40 && listingId) { sample.push(listingId); sampleListingsByAgent.set(agentId, sample); }
    }
  } catch { /* leave empty */ }

  // Neighborhoods: one bounded read over the union of sampled listing ids.
  const neighborhoodByListing = new Map<string, string>();
  const unionIds = Array.from(new Set([...sampleListingsByAgent.values()].flat())).slice(0, 8000);
  for (let i = 0; i < unionIds.length; i += 500) {
    const chunk = unionIds.slice(i, i + 500);
    try {
      const { data } = await db.from("external_listings" as never).select("id,neighborhood").in("id", chunk);
      for (const r of (data ?? []) as Row[]) { const nb = s(r.neighborhood); if (nb) neighborhoodByListing.set(String(r.id), nb); }
    } catch { /* skip */ }
  }

  // All brokers (cap for the directory page).
  const { data: agentRows } = await db.from("brokerage_agents" as never)
    .select("id,full_name,office_id,city,primary_phone,confidence_score,status,last_seen_at")
    .order("confidence_score", { ascending: false }).limit(limit);
  const rows = (agentRows ?? []) as Row[];
  const officeIds = Array.from(new Set(rows.map((r) => s(r.office_id)).filter((x): x is string => !!x)));
  const officeNameById = new Map<string, string>();
  if (officeIds.length) {
    const { data: officeRows } = await db.from("brokerage_offices" as never).select("id,name").in("id", officeIds);
    for (const o of (officeRows ?? []) as Row[]) officeNameById.set(String(o.id), String(o.name ?? ""));
  }

  const brokers: DirectoryBroker[] = rows.map((r) => {
    const id = String(r.id);
    const officeId = s(r.office_id);
    const nbFreq = new Map<string, number>();
    for (const lid of sampleListingsByAgent.get(id) ?? []) { const nb = neighborhoodByListing.get(lid); if (nb) nbFreq.set(nb, (nbFreq.get(nb) ?? 0) + 1); }
    const cityFreq = cityFreqByAgent.get(id);
    return {
      id,
      fullName: String(r.full_name ?? ""),
      officeId,
      officeName: officeId ? officeNameById.get(officeId) ?? null : null,
      listingCount: listingsByAgent.get(id)?.size ?? 0,
      city: s(r.city),
      topCity: cityFreq ? topN(cityFreq, 1)[0] ?? s(r.city) : s(r.city),
      topNeighborhoods: topN(nbFreq, 3),
      primaryPhone: s(r.primary_phone),
      confidenceScore: numOr(r.confidence_score),
      status: String(r.status ?? "candidate"),
      lastSeenAt: s(r.last_seen_at),
      resolved: !!officeId,
    };
  });

  const cities = Array.from(new Set(brokers.map((b) => b.topCity).filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b, "he"));
  const offices = officeIds.map((id) => ({ id, name: officeNameById.get(id) ?? "" })).filter((o) => o.name);

  return { brokers, agentsTotal, officesTotal, listingLinksTotal, listingLinksWithAgent, cities, offices };
}
