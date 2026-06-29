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
}

/** Compose the /brokerage-data command center (RLS scopes every read). */
export async function getBrokerageCommandCenter(opts: { city?: string | null; search?: string | null } = {}): Promise<BrokerageCommandCenter | null> {
  const access = await getBrokerageAccess();
  if (!access) return null;
  const owner = access.isOwner;
  const [stats, offices, agents, links, conflicts, matches, runs, sources] = await Promise.all([
    brokerageRepository.stats(),
    brokerageRepository.listOffices({ city: opts.city ?? undefined, search: opts.search ?? undefined, limit: 300 }),
    brokerageRepository.listAgents({ city: opts.city ?? undefined, search: opts.search ?? undefined, limit: 300 }),
    brokerageRepository.listLinks(200),
    owner ? brokerageRepository.listConflicts(100) : Promise.resolve([]),
    owner ? brokerageRepository.listMatches(100) : Promise.resolve([]),
    owner ? brokerageRepository.listRefreshRuns(20) : Promise.resolve([]),
    owner ? brokerageRepository.listSources() : Promise.resolve([]),
  ]);
  return { access, stats, offices, agents, links, conflicts, matches, runs, sources };
}

const tierToLinkStatus: Record<string, LinkStatus> = {
  auto_link: "auto_linked", pending_review: "pending_review", candidate: "candidate",
};

export interface ResolveStats { scanned: number; linked: number; review: number; candidates: number; skippedLocked: number; officesMatched: number; agentsMatched: number }

/**
 * Resolve every active external listing (with a contact) for an org against the
 * national brokerage data and persist links. Service-role; safe to call after a
 * sync. Returns counts. Never overwrites confirmed/rejected human decisions.
 */
export async function resolveBrokerageLinksForOrg(orgId: string, opts: { recordAudit?: boolean } = {}): Promise<ResolveStats> {
  const recordAudit = opts.recordAudit ?? true;
  const out: ResolveStats = { scanned: 0, linked: 0, review: 0, candidates: 0, skippedLocked: 0, officesMatched: 0, agentsMatched: 0 };
  const officeSet = new Set<string>();
  const agentSet = new Set<string>();
  const db = createServiceRoleClient();

  const { data: listingRows } = await db
    .from("external_listings" as never)
    .select("id,contact_name,contact_phone,city,source")
    .eq("org_id", orgId)
    .eq("status", "active")
    .limit(2000);
  const listings = ((listingRows ?? []) as Record<string, unknown>[])
    .filter((r) => (typeof r.contact_phone === "string" && r.contact_phone) || (typeof r.contact_name === "string" && r.contact_name));
  if (!listings.length) return out;

  // Load national candidates once (capped). The pure engine validates city/phone.
  const [agents, offices] = await Promise.all([
    brokerageRepository.candidateAgentsByCities([]),
    brokerageRepository.candidateOfficesByCities([]),
  ]);
  if (!agents.length && !offices.length) return out; // nothing to resolve against yet

  for (const r of listings) {
    out.scanned++;
    const listingId = String(r.id);

    // Respect locked human decisions.
    const { data: existing } = await db
      .from("brokerage_external_listing_links" as never)
      .select("id,status").eq("external_listing_id", listingId);
    const rows = (existing ?? []) as { id: string; status: string }[];
    if (rows.some((x) => x.status === "confirmed" || x.status === "rejected")) { out.skippedLocked++; continue; }

    const contact: ListingContact = {
      name: typeof r.contact_name === "string" ? r.contact_name : null,
      phone: typeof r.contact_phone === "string" ? r.contact_phone : null,
      city: typeof r.city === "string" ? r.city : null,
    };
    const res = resolveIdentity(contact, agents, offices);
    if (res.tier === "none" || (!res.agentId && !res.officeId)) continue;

    // Replace prior non-human links for this listing with the fresh resolution.
    if (rows.length) await db.from("brokerage_external_listing_links" as never).delete().eq("external_listing_id", listingId);
    const status = tierToLinkStatus[res.tier] ?? "candidate";
    await db.from("brokerage_external_listing_links" as never).insert({
      external_listing_id: listingId, organization_id: orgId, agent_id: res.agentId, office_id: res.officeId,
      city: contact.city, matched_phone: res.matchedPhone, matched_name: res.matchedName,
      matched_source: typeof r.source === "string" ? r.source : null,
      confidence_score: res.confidence, match_reasons: res.reasons as never, status,
    } as never);

    if (res.officeId) officeSet.add(res.officeId);
    if (res.agentId) agentSet.add(res.agentId);
    if (status === "auto_linked") out.linked++;
    else if (status === "pending_review") out.review++;
    else out.candidates++;
  }
  out.officesMatched = officeSet.size;
  out.agentsMatched = agentSet.size;

  // Audit: record a lightweight refresh run for this resolution pass (skipped
  // when invoked by startBrokerageDataRefresh, which owns its own run row).
  if (recordAudit) {
    try {
      await db.from("brokerage_refresh_runs" as never).insert({
        run_type: "source", status: "completed", parameters: { mode: "identity_resolution", org_id: orgId } as never,
        started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
        updated_records: out.linked + out.review + out.candidates,
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

  // 3) Run the existing synchronous scan + finalize the run row with real counts.
  try {
    const stats = await resolveBrokerageLinksForOrg(orgId, { recordAudit: false });
    const updated = stats.linked + stats.review + stats.candidates;
    await db.from("brokerage_refresh_runs" as never).update({
      status: "completed", finished_at: new Date().toISOString(), updated_records: updated, errors_count: 0,
      offices_found: stats.officesMatched, agents_found: stats.agentsMatched,
      log: [{ scanned: stats.scanned, linked: stats.linked, review: stats.review, candidates: stats.candidates, skippedLocked: stats.skippedLocked, officesMatched: stats.officesMatched, agentsMatched: stats.agentsMatched }] as never,
    } as never).eq("id", runId);
    console.info(`[brokerage-data] scan finished id=${runId} scanned=${stats.scanned} linked=${stats.linked} review=${stats.review} candidates=${stats.candidates}`);
    const message = stats.scanned === 0
      ? "הסריקה הסתיימה — אין עדיין מודעות חיצוניות לסריקה. סנכרן נכסי שוק תחילה."
      : updated === 0
        ? "הסריקה הסתיימה אך לא נמצאו משרדים/סוכנים. נסה לבחור עיר אחרת או להריץ סריקה עמוקה."
        : `הסריקה הסתיימה ✓ — ${stats.linked} קושרו · ${stats.review} לבדיקה · ${stats.candidates} מועמדים (מתוך ${stats.scanned} מודעות).`;
    return { ok: true, runId, status: "completed", message };
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
