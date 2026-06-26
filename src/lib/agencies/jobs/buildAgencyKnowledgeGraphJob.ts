// ============================================================================
// ZONO — Agency Knowledge Graph batch job (Phase 26.3, SERVER-ONLY).
// ----------------------------------------------------------------------------
// Rebuilds the knowledge graph for every agency in the org (or a single agency).
// Rules: safe pagination · idempotent · resumable (cursor) · logs counts · no
// destructive deletion (only soft-deactivation) · no UI dependency.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { currentOrgId } from "../_context";
import { AgencyGraphService } from "../graph/agencyGraphService";

export interface AgencyGraphJobOptions {
  /** Limit to a single agency (skips pagination). */
  agencyId?: string;
  /** Page size for the agency scan. */
  pageSize?: number;
  /** Resume cursor (agency id of the last processed agency). */
  cursor?: string | null;
  /** Hard cap on agencies processed in one invocation (resumability). */
  maxAgencies?: number;
}

export interface AgencyGraphJobResult {
  agenciesScanned: number;
  relationshipsCreated: number;
  relationshipsUpdated: number;
  areasDetected: number;
  signalsCreated: number;
  timelineEventsCreated: number;
  errors: { agencyId: string; message: string }[];
  /** Cursor to resume from on the next invocation, or null when complete. */
  nextCursor: string | null;
  done: boolean;
}

function emptyResult(): AgencyGraphJobResult {
  return {
    agenciesScanned: 0, relationshipsCreated: 0, relationshipsUpdated: 0,
    areasDetected: 0, signalsCreated: 0, timelineEventsCreated: 0,
    errors: [], nextCursor: null, done: true,
  };
}

/** Fetch a page of agency ids for the current org, after `cursor` (id order). */
async function fetchAgencyPage(cursor: string | null, pageSize: number): Promise<string[]> {
  const org = await currentOrgId();
  const db = await createClient();
  let req = db.from("agencies").select("id").eq("organization_id", org).eq("active", true).order("id", { ascending: true }).limit(pageSize);
  if (cursor) req = req.gt("id", cursor);
  const { data } = await req;
  return ((data as Array<{ id: string }> | null) ?? []).map((r) => r.id);
}

/**
 * Run the knowledge-graph build job. Processes agencies in id order so it can be
 * resumed deterministically from `nextCursor`.
 */
export async function buildAgencyKnowledgeGraphJob(opts: AgencyGraphJobOptions = {}): Promise<AgencyGraphJobResult> {
  const pageSize = Math.max(1, Math.min(200, opts.pageSize ?? 25));
  const maxAgencies = Math.max(1, opts.maxAgencies ?? 500);
  const result = emptyResult();
  result.done = false;

  // Single-agency mode.
  if (opts.agencyId) {
    try {
      const r = await AgencyGraphService.updateAgencyGraph(opts.agencyId);
      result.agenciesScanned = 1;
      result.relationshipsCreated = r.created;
      result.relationshipsUpdated = r.updated;
      result.areasDetected = r.areasDetected;
      result.signalsCreated = r.signalsCreated;
      result.timelineEventsCreated = r.timelineEventsCreated;
    } catch (e) {
      result.errors.push({ agencyId: opts.agencyId, message: e instanceof Error ? e.message : String(e) });
    }
    result.done = true;
    result.nextCursor = null;
    logResult(result);
    return result;
  }

  // Paginated full-org mode.
  let cursor: string | null = opts.cursor ?? null;
  let processed = 0;
  while (processed < maxAgencies) {
    const page = await fetchAgencyPage(cursor, Math.min(pageSize, maxAgencies - processed));
    if (page.length === 0) { result.done = true; cursor = null; break; }

    for (const agencyId of page) {
      try {
        const r = await AgencyGraphService.updateAgencyGraph(agencyId);
        result.agenciesScanned++;
        result.relationshipsCreated += r.created;
        result.relationshipsUpdated += r.updated;
        result.areasDetected += r.areasDetected;
        result.signalsCreated += r.signalsCreated;
        result.timelineEventsCreated += r.timelineEventsCreated;
      } catch (e) {
        result.errors.push({ agencyId, message: e instanceof Error ? e.message : String(e) });
      }
      cursor = agencyId;
      processed++;
    }

    if (page.length < pageSize) { result.done = true; cursor = null; break; }
  }

  result.nextCursor = result.done ? null : cursor;
  logResult(result);
  return result;
}

function logResult(r: AgencyGraphJobResult): void {
  if (typeof console === "undefined") return;
  console.info("[agency-knowledge-graph-job]", {
    agenciesScanned: r.agenciesScanned,
    relationshipsCreated: r.relationshipsCreated,
    relationshipsUpdated: r.relationshipsUpdated,
    areasDetected: r.areasDetected,
    signalsCreated: r.signalsCreated,
    timelineEventsCreated: r.timelineEventsCreated,
    errors: r.errors.length,
    done: r.done,
    nextCursor: r.nextCursor,
  });
}
