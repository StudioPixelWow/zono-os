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

export interface ResolveStats { scanned: number; linked: number; review: number; candidates: number; skippedLocked: number }

/**
 * Resolve every active external listing (with a contact) for an org against the
 * national brokerage data and persist links. Service-role; safe to call after a
 * sync. Returns counts. Never overwrites confirmed/rejected human decisions.
 */
export async function resolveBrokerageLinksForOrg(orgId: string): Promise<ResolveStats> {
  const out: ResolveStats = { scanned: 0, linked: 0, review: 0, candidates: 0, skippedLocked: 0 };
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

    if (status === "auto_linked") out.linked++;
    else if (status === "pending_review") out.review++;
    else out.candidates++;
  }

  // Audit: record a lightweight refresh run for this resolution pass.
  try {
    await db.from("brokerage_refresh_runs" as never).insert({
      run_type: "source", status: "completed", parameters: { mode: "identity_resolution", org_id: orgId } as never,
      started_at: new Date().toISOString(), finished_at: new Date().toISOString(),
      updated_records: out.linked + out.review + out.candidates,
    } as never);
  } catch { /* audit is best-effort */ }

  return out;
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
