// ============================================================================
// ZONO Core Data — Brokerage Data repository (server-only).
// Reads go through the RLS-scoped client (DB policies enforce owner-vs-city
// access). Writes go through the service-role client (server actions gate them
// at the app level via permissions.ts). National data — no org_id on entities.
// ============================================================================
import "server-only";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type {
  BrokerageOffice, BrokerageAgent, BrokerageDataConflict, BrokerageIdentityMatch,
  BrokerageExternalListingLink, BrokerageRefreshRun, BrokerageDataSource, BrokerageDataStats,
  OfficeType, OfficeStatus, AgentStatus, MatchType, MatchStatus, ConflictStatus, LinkStatus,
  RefreshRunType, RefreshStatus, SourceType,
} from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const n = (v: unknown): number | null => (typeof v === "number" ? v : v == null ? null : Number(v));
const num = (v: unknown): number => { const x = n(v); return x ?? 0; };
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function mapOffice(r: Row): BrokerageOffice {
  return {
    id: String(r.id), name: String(r.name ?? ""), normalizedName: s(r.normalized_name),
    ownerName: s(r.owner_name), managerName: s(r.manager_name), registrationNumber: s(r.registration_number),
    brandNetwork: s(r.brand_network), officeType: (s(r.office_type) ?? "unknown") as OfficeType,
    status: (s(r.status) ?? "candidate") as OfficeStatus, city: s(r.city),
    primaryPhone: s(r.primary_phone), primaryEmail: s(r.primary_email), websiteUrl: s(r.website_url),
    googlePlaceId: s(r.google_place_id), googleRating: n(r.google_rating), googleReviewsCount: n(r.google_reviews_count),
    confidenceScore: num(r.confidence_score), dataQualityScore: num(r.data_quality_score), notes: s(r.notes),
    firstSeenAt: String(r.first_seen_at ?? ""), lastSeenAt: String(r.last_seen_at ?? ""), lastVerifiedAt: s(r.last_verified_at),
  };
}
function mapAgent(r: Row): BrokerageAgent {
  return {
    id: String(r.id), officeId: s(r.office_id), fullName: String(r.full_name ?? ""), normalizedName: s(r.normalized_name),
    licenseNumber: s(r.license_number), roleTitle: s(r.role_title), status: (s(r.status) ?? "candidate") as AgentStatus,
    city: s(r.city), primaryPhone: s(r.primary_phone), primaryEmail: s(r.primary_email), whatsappPhone: s(r.whatsapp_phone),
    specialties: arr(r.specialties), confidenceScore: num(r.confidence_score), dataQualityScore: num(r.data_quality_score),
    firstSeenAt: String(r.first_seen_at ?? ""), lastSeenAt: String(r.last_seen_at ?? ""), lastVerifiedAt: s(r.last_verified_at),
  };
}
function mapConflict(r: Row): BrokerageDataConflict {
  return {
    id: String(r.id), conflictType: String(r.conflict_type ?? ""), entityAType: s(r.entity_a_type), entityAId: s(r.entity_a_id),
    entityBType: s(r.entity_b_type), entityBId: s(r.entity_b_id), fieldName: s(r.field_name), valueA: s(r.value_a), valueB: s(r.value_b),
    confidenceA: n(r.confidence_a), confidenceB: n(r.confidence_b), aiRecommendation: s(r.ai_recommendation),
    status: (s(r.status) ?? "open") as ConflictStatus, createdAt: String(r.created_at ?? ""),
  };
}
function mapMatch(r: Row): BrokerageIdentityMatch {
  return {
    id: String(r.id), matchType: (s(r.match_type) ?? "listing_to_agent") as MatchType, sourceEntityType: String(r.source_entity_type ?? ""),
    sourceEntityId: String(r.source_entity_id ?? ""), targetEntityType: String(r.target_entity_type ?? ""), targetEntityId: s(r.target_entity_id),
    confidenceScore: num(r.confidence_score), matchReasons: arr(r.match_reasons), status: (s(r.status) ?? "pending_review") as MatchStatus,
    createdAt: String(r.created_at ?? ""),
  };
}
function mapLink(r: Row): BrokerageExternalListingLink {
  return {
    id: String(r.id), externalListingId: String(r.external_listing_id ?? ""), agentId: s(r.agent_id), officeId: s(r.office_id),
    city: s(r.city), matchedPhone: s(r.matched_phone), matchedName: s(r.matched_name), matchedSource: s(r.matched_source),
    confidenceScore: num(r.confidence_score), matchReasons: arr(r.match_reasons), status: (s(r.status) ?? "candidate") as LinkStatus,
    createdAt: String(r.created_at ?? ""),
  };
}
function mapRun(r: Row): BrokerageRefreshRun {
  return {
    id: String(r.id), runType: (s(r.run_type) ?? "city") as RefreshRunType, status: (s(r.status) ?? "pending") as RefreshStatus,
    parameters: (r.parameters && typeof r.parameters === "object" ? r.parameters : {}) as Record<string, unknown>,
    startedAt: s(r.started_at), finishedAt: s(r.finished_at), officesFound: num(r.offices_found), agentsFound: num(r.agents_found),
    newOffices: num(r.new_offices), newAgents: num(r.new_agents), updatedRecords: num(r.updated_records),
    conflictsCreated: num(r.conflicts_created), errorsCount: num(r.errors_count), createdAt: String(r.created_at ?? ""),
  };
}
function mapSource(r: Row): BrokerageDataSource {
  return {
    id: String(r.id), name: String(r.name ?? ""), sourceType: (s(r.source_type) ?? "other") as SourceType, baseUrl: s(r.base_url),
    isActive: r.is_active !== false, reliabilityScore: num(r.reliability_score), lastRunAt: s(r.last_run_at),
  };
}

export interface OfficeFilter { city?: string | null; status?: string | null; search?: string | null; limit?: number }
export interface AgentFilter { city?: string | null; status?: string | null; officeId?: string | null; search?: string | null; limit?: number }

export const brokerageRepository = {
  // ── RLS-scoped reads ──────────────────────────────────────────────────────
  async listOffices(f: OfficeFilter = {}): Promise<BrokerageOffice[]> {
    const db = await createClient();
    let q = db.from("brokerage_offices" as never).select("*")
      .order("confidence_score", { ascending: false }).order("last_seen_at", { ascending: false }).limit(f.limit ?? 500);
    if (f.city) q = q.eq("city", f.city);
    if (f.status) q = q.eq("status", f.status);
    if (f.search) q = q.ilike("name", `%${f.search}%`);
    const { data } = await q;
    return ((data ?? []) as Row[]).map(mapOffice);
  },
  async listAgents(f: AgentFilter = {}): Promise<BrokerageAgent[]> {
    const db = await createClient();
    let q = db.from("brokerage_agents" as never).select("*")
      .order("confidence_score", { ascending: false }).order("last_seen_at", { ascending: false }).limit(f.limit ?? 500);
    if (f.city) q = q.eq("city", f.city);
    if (f.status) q = q.eq("status", f.status);
    if (f.officeId) q = q.eq("office_id", f.officeId);
    if (f.search) q = q.ilike("full_name", `%${f.search}%`);
    const { data } = await q;
    return ((data ?? []) as Row[]).map(mapAgent);
  },
  async listLinks(limit = 300): Promise<BrokerageExternalListingLink[]> {
    const db = await createClient();
    const { data } = await db.from("brokerage_external_listing_links" as never).select("*")
      .order("created_at", { ascending: false }).limit(limit);
    return ((data ?? []) as Row[]).map(mapLink);
  },
  // ── Single-entity reads (for DNA profiles) — RLS-scoped ────────────────────
  async officeById(id: string): Promise<BrokerageOffice | null> {
    const db = await createClient();
    const { data } = await db.from("brokerage_offices" as never).select("*").eq("id", id).maybeSingle();
    return data ? mapOffice(data as Row) : null;
  },
  async agentById(id: string): Promise<BrokerageAgent | null> {
    const db = await createClient();
    const { data } = await db.from("brokerage_agents" as never).select("*").eq("id", id).maybeSingle();
    return data ? mapAgent(data as Row) : null;
  },
  async linksByOffice(officeId: string, limit = 500): Promise<BrokerageExternalListingLink[]> {
    const db = await createClient();
    const { data } = await db.from("brokerage_external_listing_links" as never).select("*")
      .eq("office_id", officeId).order("created_at", { ascending: false }).limit(limit);
    return ((data ?? []) as Row[]).map(mapLink);
  },
  async linksByAgent(agentId: string, limit = 500): Promise<BrokerageExternalListingLink[]> {
    const db = await createClient();
    const { data } = await db.from("brokerage_external_listing_links" as never).select("*")
      .eq("agent_id", agentId).order("created_at", { ascending: false }).limit(limit);
    return ((data ?? []) as Row[]).map(mapLink);
  },
  /** Accurate per-agent / per-office linked-listing counts across ALL links (RLS-
   *  scoped). Reads only the two id columns so it scales past the display cap that
   *  truncates listLinks(). Counts DISTINCT listings per entity (no double count). */
  async linkCounts(): Promise<{ byAgent: Map<string, number>; byOffice: Map<string, number> }> {
    const db = await createClient();
    const { data } = await db.from("brokerage_external_listing_links" as never)
      .select("external_listing_id,agent_id,office_id").limit(50000);
    const byAgent = new Map<string, number>();
    const byOffice = new Map<string, number>();
    const seenAgent = new Set<string>();
    const seenOffice = new Set<string>();
    for (const r of (data ?? []) as Row[]) {
      const listingId = s(r.external_listing_id) ?? "";
      const agentId = s(r.agent_id);
      const officeId = s(r.office_id);
      if (agentId) {
        const k = `${agentId}|${listingId}`;
        if (!seenAgent.has(k)) { seenAgent.add(k); byAgent.set(agentId, (byAgent.get(agentId) ?? 0) + 1); }
      }
      if (officeId) {
        const k = `${officeId}|${listingId}`;
        if (!seenOffice.has(k)) { seenOffice.add(k); byOffice.set(officeId, (byOffice.get(officeId) ?? 0) + 1); }
      }
    }
    return { byAgent, byOffice };
  },
  // Owner-only reads (RLS already restricts these tables to owners).
  async listConflicts(limit = 200): Promise<BrokerageDataConflict[]> {
    const db = await createClient();
    const { data } = await db.from("brokerage_data_conflicts" as never).select("*").eq("status", "open")
      .order("created_at", { ascending: false }).limit(limit);
    return ((data ?? []) as Row[]).map(mapConflict);
  },
  async listMatches(limit = 200): Promise<BrokerageIdentityMatch[]> {
    const db = await createClient();
    const { data } = await db.from("brokerage_identity_matches" as never).select("*").eq("status", "pending_review")
      .order("confidence_score", { ascending: false }).limit(limit);
    return ((data ?? []) as Row[]).map(mapMatch);
  },
  async listRefreshRuns(limit = 30): Promise<BrokerageRefreshRun[]> {
    const db = await createClient();
    const { data } = await db.from("brokerage_refresh_runs" as never).select("*").order("created_at", { ascending: false }).limit(limit);
    return ((data ?? []) as Row[]).map(mapRun);
  },
  async listSources(): Promise<BrokerageDataSource[]> {
    const db = await createClient();
    const { data } = await db.from("brokerage_data_sources" as never).select("*").order("reliability_score", { ascending: false });
    return ((data ?? []) as Row[]).map(mapSource);
  },

  /** Composed stats. Owner sees national counts; office users see their cities
   *  (RLS scopes the head-count selects automatically). */
  async stats(): Promise<BrokerageDataStats> {
    const db = await createClient();
    const count = async (table: string, build?: (q: ReturnType<typeof db.from>) => unknown) => {
      let q = db.from(table as never).select("id", { count: "exact", head: true });
      if (build) q = build(q as never) as never;
      const { count: c } = await q;
      return c ?? 0;
    };
    const [offices, agents, vOffices, vAgents, candOffices, candAgents, conflicts, matches, links] = await Promise.all([
      count("brokerage_offices"),
      count("brokerage_agents"),
      count("brokerage_offices", (q) => (q as never as { in: (c: string, v: string[]) => unknown }).in("status", ["active"])),
      count("brokerage_agents", (q) => (q as never as { eq: (c: string, v: string) => unknown }).eq("status", "verified")),
      count("brokerage_offices", (q) => (q as never as { eq: (c: string, v: string) => unknown }).eq("status", "candidate")),
      count("brokerage_agents", (q) => (q as never as { eq: (c: string, v: string) => unknown }).eq("status", "candidate")),
      count("brokerage_data_conflicts", (q) => (q as never as { eq: (c: string, v: string) => unknown }).eq("status", "open")),
      count("brokerage_identity_matches", (q) => (q as never as { eq: (c: string, v: string) => unknown }).eq("status", "pending_review")),
      count("brokerage_external_listing_links"),
    ]);
    return {
      offices, agents, verifiedOffices: vOffices, verifiedAgents: vAgents,
      candidates: candOffices + candAgents, openConflicts: conflicts, pendingMatches: matches, linkedListings: links,
    };
  },

  // ── Service-role candidate loaders (for identity resolution) ───────────────
  async candidateAgentsByCities(cities: string[]) {
    const db = createServiceRoleClient();
    let q = db.from("brokerage_agents" as never).select("id,full_name,normalized_name,primary_phone,whatsapp_phone,city,office_id").limit(5000);
    if (cities.length) q = q.in("city", cities);
    const { data } = await q;
    return ((data ?? []) as Row[]).map((r) => ({
      id: String(r.id), fullName: String(r.full_name ?? ""), normalizedName: s(r.normalized_name),
      primaryPhone: s(r.primary_phone), whatsappPhone: s(r.whatsapp_phone), city: s(r.city), officeId: s(r.office_id),
    }));
  },
  async candidateOfficesByCities(cities: string[]) {
    const db = createServiceRoleClient();
    let q = db.from("brokerage_offices" as never).select("id,name,normalized_name,primary_phone,city").limit(5000);
    if (cities.length) q = q.in("city", cities);
    const { data } = await q;
    return ((data ?? []) as Row[]).map((r) => ({
      id: String(r.id), name: String(r.name ?? ""), normalizedName: s(r.normalized_name), primaryPhone: s(r.primary_phone), city: s(r.city),
    }));
  },
};
