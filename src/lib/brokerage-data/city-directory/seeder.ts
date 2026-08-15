// ============================================================================
// 🌱 discoverCityDirectory — seed System-B from the Madlan city directory.
// ----------------------------------------------------------------------------
// Directory answers WHO EXISTS and WHO MADLAN ASSOCIATES WITH WHOM. This seeds
// the EXISTING System-B tables (brokerage_offices / brokerage_agents /
// brokerage_broker_identity) — it does NOT create a second database. Every
// write is IDEMPOTENT (same office → same canonical office; same broker → same
// canonical broker; same relationship → refreshed freshness). Provenance +
// freshness reuse existing columns (NO migration):
//   offices : metadata.source='madlan_directory', metadata.madlan_entity_id,
//             metadata.madlan_profile_url, first/last_seen_at, last_verified_at
//   agents  : resolution_method='madlan_directory', resolution_sources=['madlan'],
//             first/last_seen_at, last_verified_at
//   identity: providers=['madlan'], evidence=[…]
// A source-stated relationship is stored as "Madlan CURRENTLY associates X→Y"
// (fresh, not eternal). If the source exposes no office for an agent we leave it
// UNRESOLVED — never inferred here.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getCityDirectoryProvider, DIRECTORY_SOURCE } from "./provider";
import { sameCity, normalizeCity } from "../normalize";
import { detectFranchise } from "../franchise";
import type { CityDirectorySeedResult, DirectoryOffice, DirectoryAgent } from "./types";

type DB = ReturnType<typeof createServiceRoleClient>;
type Row = Record<string, unknown>;
const s = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const nowIso = () => new Date().toISOString();
const SOFT_BUDGET_MS = 120_000;

export interface DiscoverCityDirectoryOptions {
  trigger?: string;
  softBudgetMs?: number;
}

/** Seed/refresh the city office universe from the sanctioned directory source.
 *  Never throws — every failure mode is captured in the result. */
export async function discoverCityDirectory(
  orgId: string | null,
  localityRaw: string,
  opts: DiscoverCityDirectoryOptions = {},
): Promise<CityDirectorySeedResult> {
  const t0 = Date.now();
  const locality = localityRaw.trim();
  const budget = opts.softBudgetMs ?? SOFT_BUDGET_MS;
  const result: CityDirectorySeedResult = {
    locality, source: DIRECTORY_SOURCE, status: "provider_not_configured", reason: null,
    observedAt: nowIso(), durationMs: 0,
    officesDiscovered: 0, agentsDiscovered: 0, relationshipsDiscovered: 0, agentsWithoutOffice: 0,
    officesInserted: 0, officesUpdated: 0, agentsInserted: 0, agentsUpdated: 0, relationshipsPersisted: 0,
    officesDuplicatesMerged: 0, agentsDuplicatesMerged: 0,
    pagesFetched: 0, sourceExhausted: false, errors: [], notes: [],
  };

  const fetchRes = await getCityDirectoryProvider().fetchCityDirectory(locality);
  result.status = fetchRes.status;
  result.reason = fetchRes.reason;
  result.pagesFetched = fetchRes.pagination.pagesFetched;
  result.sourceExhausted = fetchRes.pagination.exhausted;
  result.officesDiscovered = fetchRes.offices.length;
  result.agentsDiscovered = fetchRes.agents.length;
  result.relationshipsDiscovered = fetchRes.relationships.length;

  // Honest short-circuit: no sanctioned source → ZERO persistence, no fabrication.
  if (fetchRes.status !== "success" && fetchRes.status !== "partial") {
    result.notes.push(fetchRes.reason ?? "ספק המדריך אינו זמין — לא בוצעה כתיבה.");
    result.durationMs = Date.now() - t0;
    return result;
  }
  if (fetchRes.offices.length === 0 && fetchRes.agents.length === 0) {
    result.notes.push("המקור החזיר 0 ישויות — לא בוצעה כתיבה.");
    result.durationMs = Date.now() - t0;
    return result;
  }

  const db = createServiceRoleClient();
  const officeIdBySourceId = new Map<string, string>();
  const officeIdByNorm = new Map<string, string>();
  const seenOfficeKeys = new Set<string>();
  const seenAgentKeys = new Set<string>();

  // ── 1) OFFICES — idempotent upsert ─────────────────────────────────────────
  for (const office of fetchRes.offices) {
    if (Date.now() - t0 > budget) { result.notes.push("תקציב זמן נגמר בשלב המשרדים — הרצה חוזרת תמשיך."); break; }
    const key = office.sourceEntityId ? `id:${office.sourceEntityId}` : `nm:${office.normalizedName}|${normalizeCity(office.city ?? locality)}`;
    if (seenOfficeKeys.has(key)) { result.officesDuplicatesMerged++; continue; }
    seenOfficeKeys.add(key);
    try {
      const officeId = await upsertOffice(db, office, locality, result);
      if (officeId) {
        if (office.sourceEntityId) officeIdBySourceId.set(office.sourceEntityId, officeId);
        officeIdByNorm.set(office.normalizedName, officeId);
      }
    } catch (e) { result.errors.push(`office "${office.displayName}": ${e instanceof Error ? e.message : "upsert failed"}`); }
  }

  // ── 2) AGENTS — idempotent upsert + source-stated relationship ─────────────
  for (const agent of fetchRes.agents) {
    if (Date.now() - t0 > budget) { result.notes.push("תקציב זמן נגמר בשלב המתווכים — הרצה חוזרת תמשיך."); break; }
    const key = agent.sourceEntityId ? `id:${agent.sourceEntityId}` : `nm:${agent.normalizedName}|${normalizeCity(agent.city ?? locality)}`;
    if (seenAgentKeys.has(key)) { result.agentsDuplicatesMerged++; continue; }
    seenAgentKeys.add(key);

    // Resolve the office STRICTLY from what the source stated (never inferred).
    const resolvedOfficeId = agent.officeSourceEntityId ? officeIdBySourceId.get(agent.officeSourceEntityId) ?? null : null;
    try {
      const agentId = await upsertAgent(db, agent, locality, resolvedOfficeId, result);
      if (!resolvedOfficeId) result.agentsWithoutOffice++;
      if (agentId && resolvedOfficeId) {
        const officeNm = await lookupOfficeName(db, resolvedOfficeId);
        await upsertBrokerIdentity(db, agentId, resolvedOfficeId, officeNm, agent, result);
      }
    } catch (e) { result.errors.push(`agent "${agent.displayName}": ${e instanceof Error ? e.message : "upsert failed"}`); }
  }

  result.durationMs = Date.now() - t0;
  return result;
}

// ── helpers ──────────────────────────────────────────────────────────────────

async function upsertOffice(db: DB, o: DirectoryOffice, locality: string, result: CityDirectorySeedResult): Promise<string | null> {
  const city = o.city || locality;
  const existing = await findOffice(db, o, city);
  const fr = detectFranchise(o.displayName);
  const nowStamp = nowIso();
  if (existing) {
    const prevMeta = (existing.metadata as Row | null) ?? {};
    const metadata = {
      ...prevMeta, source: DIRECTORY_SOURCE,
      madlan_entity_id: o.sourceEntityId ?? prevMeta.madlan_entity_id ?? null,
      madlan_profile_url: o.profileUrl ?? prevMeta.madlan_profile_url ?? null,
      directory_last_seen_at: nowStamp,
    };
    const patch: Row = { last_seen_at: nowStamp, last_verified_at: nowStamp, metadata };
    if (o.phone && !s(existing.primary_phone)) patch.primary_phone = o.phone;
    if (o.website && !s(existing.website_url)) patch.website_url = o.website;
    if (o.brandNetwork && !s(existing.brand_network)) patch.brand_network = o.brandNetwork;
    const { error } = await db.from("brokerage_offices" as never).update(patch as never).eq("id", s(existing.id));
    if (error) { result.errors.push(`office update: ${error.message}`); return s(existing.id); }
    result.officesUpdated++;
    return s(existing.id);
  }
  const officeId = globalThis.crypto.randomUUID();
  const { error } = await db.from("brokerage_offices" as never).insert({
    id: officeId, name: o.displayName, normalized_name: o.normalizedName,
    brand_network: o.brandNetwork ?? (fr.matched ? fr.brandNetwork : null), office_type: "unknown",
    status: "active", city, primary_phone: o.phone, website_url: o.website,
    confidence_score: 85, data_quality_score: 60,
    metadata: {
      source: DIRECTORY_SOURCE, madlan_entity_id: o.sourceEntityId, madlan_profile_url: o.profileUrl,
      address: o.address, source_metadata: o.sourceMetadata, directory_first_seen_at: nowStamp,
    },
    first_seen_at: nowStamp, last_seen_at: nowStamp, last_verified_at: nowStamp,
  } as never);
  if (error) { result.errors.push(`office insert: ${error.message}`); return null; }
  result.officesInserted++;
  return officeId;
}

/** Find an existing office by stable source id first, else by normalized name +
 *  same-city, ignoring rejected rows. */
async function findOffice(db: DB, o: DirectoryOffice, city: string): Promise<Row | null> {
  if (o.sourceEntityId) {
    const { data } = await db.from("brokerage_offices" as never)
      .select("id,city,status,metadata,primary_phone,website_url,brand_network")
      .eq("metadata->>madlan_entity_id", o.sourceEntityId).limit(1);
    const hit = ((data ?? []) as Row[])[0];
    if (hit) return hit;
  }
  const { data } = await db.from("brokerage_offices" as never)
    .select("id,city,status,metadata,primary_phone,website_url,brand_network")
    .eq("normalized_name", o.normalizedName).limit(50);
  return ((data ?? []) as Row[]).find((r) => s(r.status) !== "rejected" && (!s(r.city) || sameCity(s(r.city), city))) ?? null;
}

async function upsertAgent(db: DB, a: DirectoryAgent, locality: string, resolvedOfficeId: string | null, result: CityDirectorySeedResult): Promise<string | null> {
  const city = a.city || locality;
  const existing = await findAgent(db, a, city);
  const nowStamp = nowIso();
  const provenance = resolvedOfficeId
    ? {
        resolution_method: DIRECTORY_SOURCE, resolution_sources: ["madlan"], resolution_confidence: 85,
        resolution_explanation: "מדלן משייך את המתווך למשרד זה במאגר הנוכחי", resolved_at: nowStamp,
      }
    : {};
  if (existing) {
    const prevMeta = (existing.metadata as Row | null) ?? {};
    const metadata = {
      ...prevMeta, source: DIRECTORY_SOURCE,
      madlan_entity_id: a.sourceEntityId ?? prevMeta.madlan_entity_id ?? null,
      madlan_profile_url: a.profileUrl ?? prevMeta.madlan_profile_url ?? null,
    };
    const patch: Row = { last_seen_at: nowStamp, last_verified_at: nowStamp, metadata, ...provenance };
    // Source-stated relationship is authoritative over a prior weak guess.
    if (resolvedOfficeId) patch.office_id = resolvedOfficeId;
    if (a.phone && !s(existing.primary_phone)) patch.primary_phone = a.phone;
    if (a.role && !s(existing.role_title)) patch.role_title = a.role;
    const { error } = await db.from("brokerage_agents" as never).update(patch as never).eq("id", s(existing.id));
    if (error) { result.errors.push(`agent update: ${error.message}`); return s(existing.id); }
    result.agentsUpdated++;
    return s(existing.id);
  }
  const agentId = globalThis.crypto.randomUUID();
  const { error } = await db.from("brokerage_agents" as never).insert({
    id: agentId, office_id: resolvedOfficeId, full_name: a.displayName, normalized_name: a.normalizedName,
    role_title: a.role, status: "active", city, primary_phone: a.phone,
    confidence_score: 85, data_quality_score: 60,
    metadata: { source: DIRECTORY_SOURCE, madlan_entity_id: a.sourceEntityId, madlan_profile_url: a.profileUrl, source_metadata: a.sourceMetadata },
    first_seen_at: nowStamp, last_seen_at: nowStamp, last_verified_at: nowStamp,
    resolution_method: resolvedOfficeId ? DIRECTORY_SOURCE : null,
    resolution_sources: resolvedOfficeId ? ["madlan"] : null,
    resolution_confidence: resolvedOfficeId ? 85 : null,
    resolution_explanation: resolvedOfficeId ? "מדלן משייך את המתווך למשרד זה במאגר הנוכחי" : null,
    resolved_at: resolvedOfficeId ? nowStamp : null,
  } as never);
  if (error) { result.errors.push(`agent insert: ${error.message}`); return null; }
  result.agentsInserted++;
  return agentId;
}

async function findAgent(db: DB, a: DirectoryAgent, city: string): Promise<Row | null> {
  if (a.sourceEntityId) {
    const { data } = await db.from("brokerage_agents" as never)
      .select("id,city,status,metadata,primary_phone,role_title,office_id")
      .eq("metadata->>madlan_entity_id", a.sourceEntityId).limit(1);
    const hit = ((data ?? []) as Row[])[0];
    if (hit) return hit;
  }
  const { data } = await db.from("brokerage_agents" as never)
    .select("id,city,status,metadata,primary_phone,role_title,office_id")
    .eq("normalized_name", a.normalizedName).limit(50);
  return ((data ?? []) as Row[]).find((r) => !s(r.city) || sameCity(s(r.city), city)) ?? null;
}

async function lookupOfficeName(db: DB, officeId: string): Promise<string | null> {
  const { data } = await db.from("brokerage_offices" as never).select("name").eq("id", officeId).limit(1);
  return s(((data ?? []) as Row[])[0]?.name) || null;
}

/** Persist the source-stated agent→office relationship into the identity graph
 *  (idempotent by agent_id). Semantics: "Madlan CURRENTLY associates X→Y". */
async function upsertBrokerIdentity(db: DB, agentId: string, officeId: string, officeNm: string | null, a: DirectoryAgent, result: CityDirectorySeedResult): Promise<void> {
  const nowStamp = nowIso();
  const evidence = [{ source: DIRECTORY_SOURCE, observed_at: nowStamp, agent_source_id: a.sourceEntityId, office_source_id: a.officeSourceEntityId, semantics: "current_association_not_eternal" }];
  const { data: existing } = await db.from("brokerage_broker_identity" as never).select("id").eq("agent_id", agentId).limit(1);
  const hit = ((existing ?? []) as Row[])[0];
  if (hit) {
    const { error } = await db.from("brokerage_broker_identity" as never).update({
      resolved_office_id: officeId, resolved_office_name: officeNm, status: "directory_stated",
      confidence: 85, why: "שיוך מוצהר במאגר מדלן", providers: ["madlan"], evidence, resolved_at: nowStamp,
    } as never).eq("id", s(hit.id));
    if (error) { result.errors.push(`identity update: ${error.message}`); return; }
    result.relationshipsPersisted++;
    return;
  }
  const { error } = await db.from("brokerage_broker_identity" as never).insert({
    agent_id: agentId, resolved_office_id: officeId, resolved_office_name: officeNm, status: "directory_stated",
    confidence: 85, why: "שיוך מוצהר במאגר מדלן", providers: ["madlan"], evidence, resolved_at: nowStamp,
  } as never);
  if (error) { result.errors.push(`identity insert: ${error.message}`); return; }
  result.relationshipsPersisted++;
}
