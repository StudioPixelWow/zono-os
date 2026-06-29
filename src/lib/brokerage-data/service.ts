// ============================================================================
// ZONO Core Data — Brokerage Data service (server-only).
// • getBrokerageCommandCenter — composes access + stats + recent lists for UI.
// • resolveBrokerageLinksForOrg — THE integration hook: every external-listing
//   scan runs Broker Identity Resolution against the national data and persists
//   links (auto_linked / pending_review / candidate). Human decisions
//   (confirmed / rejected) are LOCKED and never overwritten. Records a refresh
//   run for auditability. Best-effort & no-throw so it never breaks a sync.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { brokerageRepository } from "./repository";
import { getBrokerageAccess } from "./permissions";
import { resolveIdentity, type ListingContact } from "./identity";
import { buildOfficeDna, buildBrokerDna, type BrokerageDna } from "./dna";
import { normalizeHebrewName, normalizePhoneNumber } from "./normalize";
import type {
  BrokerageAccess, BrokerageOffice, BrokerageAgent, BrokerageDataConflict, BrokerageIdentityMatch,
  BrokerageExternalListingLink, BrokerageRefreshRun, BrokerageDataSource, BrokerageDataStats, LinkStatus,
} from "./types";

export interface BrokerageCommandCenter {
  access: BrokerageAccess;
  stats: BrokerageDataStats;
  offices: BrokerageOffice[];
  agents: BrokerageAgent[];
  links: BrokerageExternalListingLink[];
  conflicts: BrokerageDataConflict[];   // owner only
  matches: BrokerageIdentityMatch[];     // owner only
  runs: BrokerageRefreshRun[];           // owner only
  sources: BrokerageDataSource[];        // owner only
  /** Accurate linked-listing counts (across ALL links, not the display cap). */
  agentListingCounts: Record<string, number>;
  officeListingCounts: Record<string, number>;
}

/** Compose the /brokerage-data command center (RLS scopes every read). */
export async function getBrokerageCommandCenter(opts: { city?: string | null; search?: string | null } = {}): Promise<BrokerageCommandCenter | null> {
  const access = await getBrokerageAccess();
  if (!access) return null;
  const owner = access.isOwner;
  const [stats, offices, agents, links, conflicts, matches, runs, sources, counts] = await Promise.all([
    brokerageRepository.stats(),
    brokerageRepository.listOffices({ city: opts.city ?? undefined, search: opts.search ?? undefined, limit: 300 }),
    brokerageRepository.listAgents({ city: opts.city ?? undefined, search: opts.search ?? undefined, limit: 300 }),
    brokerageRepository.listLinks(200),
    owner ? brokerageRepository.listConflicts(100) : Promise.resolve([]),
    owner ? brokerageRepository.listMatches(100) : Promise.resolve([]),
    owner ? brokerageRepository.listRefreshRuns(20) : Promise.resolve([]),
    owner ? brokerageRepository.listSources() : Promise.resolve([]),
    brokerageRepository.linkCounts(),
  ]);
  return {
    access, stats, offices, agents, links, conflicts, matches, runs, sources,
    agentListingCounts: Object.fromEntries(counts.byAgent),
    officeListingCounts: Object.fromEntries(counts.byOffice),
  };
}

// ── Brokerage DNA™ — deterministic identity profile (no AI, RLS-scoped reads) ──
/** Compose the deterministic DNA profile for one office, or null if not visible. */
export async function getOfficeDna(officeId: string): Promise<BrokerageDna | null> {
  const office = await brokerageRepository.officeById(officeId);
  if (!office) return null;
  const [agents, links] = await Promise.all([
    brokerageRepository.listAgents({ officeId, limit: 500 }),
    brokerageRepository.linksByOffice(officeId, 500),
  ]);
  return buildOfficeDna(office, agents, links);
}

/** Compose the deterministic DNA profile for one broker, or null if not visible. */
export async function getBrokerDna(agentId: string): Promise<BrokerageDna | null> {
  const agent = await brokerageRepository.agentById(agentId);
  if (!agent) return null;
  const [office, links] = await Promise.all([
    agent.officeId ? brokerageRepository.officeById(agent.officeId) : Promise.resolve(null),
    brokerageRepository.linksByAgent(agentId, 500),
  ]);
  return buildBrokerDna(agent, office, links);
}

const tierToLinkStatus: Record<string, LinkStatus> = {
  auto_link: "auto_linked", pending_review: "pending_review", candidate: "candidate",
};

export interface ResolveStats {
  scanned: number; linked: number; review: number; candidates: number; skippedLocked: number;
  officesMatched: number; agentsMatched: number;
  // Diagnostics — proof the Listing→Broker pipeline actually ran each stage.
  listingsWithAgent: number;   // external_listings has_agent=true with a usable contact
  agentsCreated: number;       // brokers self-seeded from listing data this pass
  linksCreated: number;        // brokerage_external_listing_links rows written
  linksWithAgent: number;      // of those, how many carry a non-null agent_id
  existingAgentsBefore: number;
  skippedReason: string | null;
}

const rstr = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * THE Listing→Broker pipeline. For every broker-published external listing
 * (has_agent=true with a contact), resolve it against known brokers/offices; if
 * no broker exists yet, SELF-SEED a candidate broker from the listing's own
 * contact data (real names/phones — nothing fabricated) and link the listing to
 * it. This removes the chicken-and-egg where an empty brokerage_agents table
 * meant every listing resolved to nothing. Service-role; never overwrites
 * confirmed/rejected human decisions. Returns full per-stage diagnostics.
 */
export async function resolveBrokerageLinksForOrg(orgId: string, opts: { recordAudit?: boolean } = {}): Promise<ResolveStats> {
  const recordAudit = opts.recordAudit ?? true;
  const out: ResolveStats = {
    scanned: 0, linked: 0, review: 0, candidates: 0, skippedLocked: 0, officesMatched: 0, agentsMatched: 0,
    listingsWithAgent: 0, agentsCreated: 0, linksCreated: 0, linksWithAgent: 0, existingAgentsBefore: 0, skippedReason: null,
  };
  const officeSet = new Set<string>();
  const agentSet = new Set<string>();
  const db = createServiceRoleClient();

  // Broker-published listings. NO status filter — match the operator's own proof
  // query (has_agent=true). Require a contact name/phone for a stable identity.
  const { data: listingRows, error: listErr } = await db
    .from("external_listings" as never)
    .select("id,contact_name,contact_phone,contact_type,city,source,has_agent")
    .eq("org_id", orgId)
    .eq("has_agent", true)
    .limit(5000);
  if (listErr) { out.skippedReason = `external_listings query failed: ${listErr.message}`; return out; }
  const brokerListings = ((listingRows ?? []) as Record<string, unknown>[])
    .filter((r) => rstr(r.contact_phone) || rstr(r.contact_name));
  out.listingsWithAgent = brokerListings.length;
  if (!brokerListings.length) {
    out.skippedReason = "no has_agent listings with a contact name/phone for this org";
    return out;
  }

  // Load existing brokers/offices once (the pure engine validates city/phone).
  const [agents, offices] = await Promise.all([
    brokerageRepository.candidateAgentsByCities([]),
    brokerageRepository.candidateOfficesByCities([]),
  ]);
  out.existingAgentsBefore = agents.length;

  // Index existing brokers by normalized phone / name so a seeded broker created
  // for one listing is reused for that broker's other listings (no duplicates).
  const agentByKey = new Map<string, { id: string }>();
  for (const a of agents) {
    const np = normalizePhoneNumber(a.primaryPhone ?? "");
    const nn = a.normalizedName ?? normalizeHebrewName(a.fullName);
    if (np) agentByKey.set(np, { id: a.id });
    else if (nn) agentByKey.set(nn, { id: a.id });
  }

  for (const r of brokerListings) {
    out.scanned++;
    const listingId = String(r.id);

    // Respect locked human decisions.
    const { data: existing } = await db
      .from("brokerage_external_listing_links" as never)
      .select("id,status").eq("external_listing_id", listingId);
    const rows = (existing ?? []) as { id: string; status: string }[];
    if (rows.some((x) => x.status === "confirmed" || x.status === "rejected")) { out.skippedLocked++; continue; }

    const name = rstr(r.contact_name);
    const phone = rstr(r.contact_phone);
    const city = rstr(r.city) || null;
    const np = normalizePhoneNumber(phone);
    const nn = normalizeHebrewName(name);
    const key = np || nn;
    if (!key) continue; // no stable identity to seed/match on

    // Office (and any existing-broker) match via the pure engine.
    const contact: ListingContact = { name: name || null, phone: phone || null, city };
    const res = resolveIdentity(contact, agents, offices);
    let agentId: string | null = res.agentId;
    const officeId: string | null = res.officeId;
    const seeded = { value: false };

    if (!agentId) {
      const found = agentByKey.get(key);
      if (found) {
        agentId = found.id;
      } else {
        // SELF-SEED a candidate broker from this listing's real contact data.
        const nowIso = new Date().toISOString();
        const { data: ins, error: insErr } = await db.from("brokerage_agents" as never).insert({
          full_name: (name || phone).trim(), normalized_name: nn || normalizeHebrewName(name),
          status: "candidate", city, primary_phone: phone || null, specialties: [] as never,
          confidence_score: 60, data_quality_score: phone ? 55 : 35,
          metadata: { seeded_from: "external_listing", org_id: orgId, source: rstr(r.source) } as never,
          first_seen_at: nowIso, last_seen_at: nowIso,
        } as never).select("id").maybeSingle();
        if (insErr || !ins) {
          if (!out.skippedReason) out.skippedReason = `brokerage_agents insert failed: ${insErr?.message ?? "no row returned"}`;
        } else {
          agentId = String((ins as { id: string }).id);
          agents.push({ id: agentId, fullName: (name || phone).trim(), normalizedName: nn || null, primaryPhone: phone || null, whatsappPhone: null, city, officeId });
          agentByKey.set(key, { id: agentId });
          out.agentsCreated++;
          seeded.value = true;
        }
      }
    }

    if (!agentId && !officeId) continue;

    // Replace prior non-human links for this listing with the fresh resolution.
    if (rows.length) await db.from("brokerage_external_listing_links" as never).delete().eq("external_listing_id", listingId);
    const status: LinkStatus = agentId ? "auto_linked" : (tierToLinkStatus[res.tier] ?? "candidate");
    const reasons = seeded.value ? ["מתווך זוהה מהמודעה", ...res.reasons] : res.reasons;
    const { error: linkErr } = await db.from("brokerage_external_listing_links" as never).insert({
      external_listing_id: listingId, organization_id: orgId, agent_id: agentId, office_id: officeId,
      city, matched_phone: np || res.matchedPhone, matched_name: nn || res.matchedName,
      matched_source: rstr(r.source) || null,
      confidence_score: agentId ? Math.max(res.confidence, 75) : res.confidence, match_reasons: reasons as never, status,
    } as never);
    if (linkErr) { if (!out.skippedReason) out.skippedReason = `link insert failed: ${linkErr.message}`; continue; }

    out.linksCreated++;
    if (agentId) { out.linksWithAgent++; agentSet.add(agentId); }
    if (officeId) officeSet.add(officeId);
    if (status === "auto_linked") out.linked++;
    else if (status === "pending_review") out.review++;
    else out.candidates++;
  }
  out.officesMatched = officeSet.size;
  out.agentsMatched = agentSet.size;

  // Audit (only for direct resolve calls; startBrokerageDataRefresh owns its own
  // run row). Honest status: if broker listings existed but nothing was created
  // or linked, mark the pass "partial" with the explicit reason.
  if (recordAudit) {
    const stalled = out.listingsWithAgent > 0 && out.linksCreated === 0;
    try {
      await db.from("brokerage_refresh_runs" as never).insert({
        run_type: "source", status: stalled ? "partial" : "completed",
        parameters: { mode: "identity_resolution", org_id: orgId } as never,
        started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
        agents_found: out.agentsMatched, new_agents: out.agentsCreated,
        updated_records: out.linksCreated, errors_count: stalled ? 1 : 0,
        log: [{
          external_listings_with_agent: out.listingsWithAgent, agents_created: out.agentsCreated,
          listing_links_created: out.linksCreated, links_with_agent_id: out.linksWithAgent,
          existing_agents_before: out.existingAgentsBefore, skipped_reason: out.skippedReason,
        }] as never,
      } as never);
    } catch { /* audit is best-effort */ }
  }

  return out;
}

/** Result of starting a brokerage data scan/refresh. */
export interface StartRefreshResult {
  ok: boolean;
  runId: string | null;
  status: "pending" | "running" | "completed" | "failed" | "partial";
  message?: string;
  error?: string;
  alreadyRunning?: boolean;
}

/**
 * Start an initial scan / refresh of brokerage intelligence. Reuses the EXISTING
 * synchronous identity-resolution flow (resolveBrokerageLinksForOrg) — no new
 * engine. Persists a real brokerage_refresh_runs row (running → completed/failed)
 * with who/when + counts, and is idempotent per org (a running scan is reused).
 */
export async function startBrokerageDataRefresh(
  orgId: string, userId: string | null, params: Record<string, unknown>,
): Promise<StartRefreshResult> {
  const db = createServiceRoleClient();
  const runType = (params.runType as string) ?? "full_country";
  const STALE_MS = 10 * 60 * 1000; // a pending/running run older than this is stale.

  // 1) Idempotency — reuse a RECENT pending/running scan for this org (double-click
  //    safe). Stale rows (incl. legacy "pending" rows that never had a processor)
  //    are marked failed so they stop blocking new scans forever.
  const { data: active } = await db.from("brokerage_refresh_runs" as never)
    .select("id,status,parameters,created_at,started_at").in("status", ["pending", "running"]).order("created_at", { ascending: false }).limit(50);
  const mine = ((active ?? []) as { id: string; parameters?: { org_id?: string }; created_at?: string; started_at?: string | null }[])
    .filter((r) => r.parameters?.org_id === orgId);
  const now = Date.now();
  let liveRun: { id: string } | null = null;
  for (const r of mine) {
    const ts = Date.parse(r.started_at ?? r.created_at ?? "") || 0;
    if (now - ts > STALE_MS) {
      await db.from("brokerage_refresh_runs" as never).update({
        status: "failed", finished_at: new Date().toISOString(), errors_count: 1,
        log: [{ error: "stale-run-expired", note: "pending/running for >10m without completion" }] as never,
      } as never).eq("id", r.id);
      console.info(`[brokerage-data] expired stale run id=${r.id} org=${orgId}`);
    } else if (!liveRun) {
      liveRun = { id: String(r.id) };
    }
  }
  if (liveRun) {
    return { ok: true, runId: liveRun.id, status: "running", message: "סריקה כבר מתבצעת.", alreadyRunning: true };
  }

  // 2) Create a running run row (who/when/params).
  const { data: ins, error: insErr } = await db.from("brokerage_refresh_runs" as never)
    .insert({ run_type: runType, status: "running", requested_by: userId, parameters: { ...params, org_id: orgId } as never, started_at: new Date().toISOString() } as never)
    .select("id").maybeSingle();
  if (insErr || !ins) {
    console.error("[brokerage-data] failed to create refresh run:", insErr?.message);
    return { ok: false, runId: null, status: "failed", error: "create-run-failed" };
  }
  const runId = String((ins as { id: string }).id);
  console.info(`[brokerage-data] scan run created id=${runId} org=${orgId} user=${userId ?? "?"} type=${runType}`);

  // 3) Run THE Listing→Broker pipeline (resolveBrokerageLinksForOrg now self-seeds
  //    brokers from the listings themselves, so it works against empty tables).
  //    Persist full per-stage diagnostics; mark "partial" (not completed) when
  //    broker listings existed but nothing was created/linked.
  try {
    const stats = await resolveBrokerageLinksForOrg(orgId, { recordAudit: false });
    const stalled = stats.listingsWithAgent > 0 && stats.linksCreated === 0;
    const diag = {
      external_listings_with_agent: stats.listingsWithAgent, agents_created: stats.agentsCreated,
      listing_links_created: stats.linksCreated, links_with_agent_id: stats.linksWithAgent,
      existing_agents_before: stats.existingAgentsBefore, skipped_reason: stats.skippedReason,
      scanned: stats.scanned, linked: stats.linked, review: stats.review, candidates: stats.candidates,
      skippedLocked: stats.skippedLocked,
    };
    await db.from("brokerage_refresh_runs" as never).update({
      status: stalled ? "partial" : "completed", finished_at: new Date().toISOString(),
      updated_records: stats.linksCreated, errors_count: stalled ? 1 : 0,
      offices_found: stats.officesMatched, agents_found: stats.agentsMatched, new_agents: stats.agentsCreated,
      log: [diag] as never,
    } as never).eq("id", runId);
    console.info(`[brokerage-data] scan finished id=${runId}`, diag);
    const message = stats.listingsWithAgent === 0
      ? `הסריקה הסתיימה — אין מודעות שפורסמו ע"י מתווכים (has_agent) לארגון. סנכרן נכסי שוק תחילה.${stats.skippedReason ? ` (${stats.skippedReason})` : ""}`
      : stalled
        ? `הסריקה לא יצרה קישורים למרות ${stats.listingsWithAgent} מודעות מתווכים. סיבה: ${stats.skippedReason ?? "לא ידועה"}.`
        : `הסריקה הסתיימה ✓ — ${stats.agentsCreated} מתווכים חדשים · ${stats.linksWithAgent} קישורים למתווכים (מתוך ${stats.listingsWithAgent} מודעות מתווכים).`;
    return { ok: !stalled, runId, status: stalled ? "partial" : "completed", message, error: stalled ? "pipeline-stalled" : undefined };
  } catch (e) {
    console.error(`[brokerage-data] scan failed id=${runId}:`, e);
    await db.from("brokerage_refresh_runs" as never).update({
      status: "failed", finished_at: new Date().toISOString(), errors_count: 1, log: [{ error: e instanceof Error ? e.message : String(e) }] as never,
    } as never).eq("id", runId);
    return { ok: false, runId, status: "failed", error: "scan-failed" };
  }
}

/** Poll a refresh run's current status (for the UI). */
export async function getRefreshRunStatus(runId: string): Promise<{ status: string; updatedRecords: number } | null> {
  const db = createServiceRoleClient();
  const { data } = await db.from("brokerage_refresh_runs" as never).select("status,updated_records").eq("id", runId).maybeSingle();
  if (!data) return null;
  const d = data as { status?: string; updated_records?: number };
  return { status: d.status ?? "pending", updatedRecords: Number(d.updated_records ?? 0) };
}

/** Owner action — record a manual refresh run row (the heavy scrape would be a
 *  separate job; this captures intent + audit). Returns the created run id. */
export async function recordRefreshRequest(params: Record<string, unknown>): Promise<string | null> {
  const db = createServiceRoleClient();
  const { data } = await db.from("brokerage_refresh_runs" as never)
    .insert({ run_type: (params.runType as string) ?? "city", status: "pending", parameters: params as never } as never)
    .select("id").maybeSingle();
  return (data as { id?: string } | null)?.id ?? null;
}

/** Owner action — review an identity match (approve → merged link / reject). */
export async function reviewIdentityMatch(matchId: string, decision: "approve" | "reject"): Promise<void> {
  const db = createServiceRoleClient();
  await db.from("brokerage_identity_matches" as never).update({
    status: decision === "approve" ? "auto_approved" : "rejected", reviewed_at: new Date().toISOString(),
  } as never).eq("id", matchId);
}

/** Owner action — resolve a data conflict (keep A / keep B / ignore). */
export async function resolveDataConflict(conflictId: string, resolution: "resolved" | "ignored"): Promise<void> {
  const db = createServiceRoleClient();
  await db.from("brokerage_data_conflicts" as never).update({
    status: resolution, resolved_at: new Date().toISOString(),
  } as never).eq("id", conflictId);
}

/** Owner action — confirm/reject an external-listing link (locks the decision). */
export async function decideListingLink(linkId: string, decision: "confirmed" | "rejected"): Promise<void> {
  const db = createServiceRoleClient();
  await db.from("brokerage_external_listing_links" as never).update({
    status: decision, updated_at: new Date().toISOString(),
  } as never).eq("id", linkId);
}
