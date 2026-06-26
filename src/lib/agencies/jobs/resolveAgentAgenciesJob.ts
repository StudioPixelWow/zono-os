// ============================================================================
// ZONO — PHASE 26.11: Agent → Agency resolution job (SERVER-ONLY).
// Safe, stored-data-only pass: re-processes PENDING agency resolution candidates
// (created by prior ingestion) through the existing resolver + auto-builder. No
// external scraping, no mock data. Idempotent — re-running resolves again and
// updates candidate status in place; never duplicates agencies.
// ============================================================================
import "server-only";
import { listCandidates } from "../resolver/candidateRepository";
import { resolveOrBuildAgency } from "../resolver/resolver-service";

export interface ResolveAgentAgenciesJobOptions { maxCandidates?: number }
export interface ResolveAgentAgenciesJobResult {
  candidatesProcessed: number;
  matched: number;
  created: number;
  enriched: number;
  rejected: number;
  errors: { rawText: string; message: string }[];
}

export async function resolveAgentAgenciesJob(opts: ResolveAgentAgenciesJobOptions = {}): Promise<ResolveAgentAgenciesJobResult> {
  const max = Math.max(1, Math.min(opts.maxCandidates ?? 100, 500));
  const out: ResolveAgentAgenciesJobResult = { candidatesProcessed: 0, matched: 0, created: 0, enriched: 0, rejected: 0, errors: [] };

  const pending = await listCandidates("pending", max);
  for (const c of pending) {
    out.candidatesProcessed++;
    try {
      const r = await resolveOrBuildAgency({ rawText: c.rawText, source: c.source ?? undefined, sourceRef: c.sourceRef ?? undefined });
      if (r.action === "matched") out.matched++;
      else if (r.action === "created") out.created++;
      else if (r.action === "enriched") out.enriched++;
      else out.rejected++;
    } catch (e) {
      out.errors.push({ rawText: c.rawText, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
