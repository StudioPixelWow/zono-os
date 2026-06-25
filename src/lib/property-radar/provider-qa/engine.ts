// ============================================================================
// ZONO Property Radar™ — provider QA engine (orchestration, SAFE FALLBACK).
// Runs the full QA pass over a provider batch: field validation, normalization
// quality, cross-provider duplicates, schema-drift detection, batch statistics,
// and (optionally) persistence + admin alerting. NEVER throws and NEVER blocks
// the sync — on any internal error it returns a safe, partial result.
// ============================================================================
import { assembleListingQAReport } from "./report";
import { detectCrossProviderDuplicates } from "./duplicate";
import { buildSchemaFingerprint, detectSchemaChanges } from "./schema";
import { computeBatchStatistics, statusFromScore } from "./statistics";
import { QA_WARNING_SCORE } from "./types";
import type {
  ListingQAReport,
  ProviderQABatchResult,
  ProviderQADailyMetricsRow,
  ProviderQARepository,
  RunProviderQAInput,
  SchemaChange,
} from "./types";

const MAX_REPORTS_RETURNED = 50; // cap detail payload (stats use the full batch)

export interface ProviderQADeps {
  repo?: ProviderQARepository | null;
}

async function getDefaultRepo(): Promise<ProviderQARepository | null> {
  try { return (await import("./repository")).createProviderQARepository(); }
  catch { return null; }
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function errMsg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

/**
 * Validate + measure + (optionally) persist a provider batch. Returns the QA
 * verdict. Resolve the repo from deps; when absent (e.g. tests / non-server),
 * persistence is skipped silently.
 */
export async function runProviderQA(
  input: RunProviderQAInput,
  deps?: ProviderQADeps,
): Promise<ProviderQABatchResult> {
  const result: ProviderQABatchResult = {
    provider: input.provider,
    status: "ok",
    statistics: { scanned: 0, rejected: 0, normalizationErrors: 0, avgQualityScore: 100, avgFieldsCompleteness: 0, missingPhones: 0, missingImages: 0, duplicateCount: 0, duplicateRate: 0 },
    reports: [],
    schemaChanges: [],
    duplicates: [],
    degraded: false,
    adminAlert: false,
    errors: [],
  };

  // ── Pure analysis (must never throw) ──────────────────────────────────────
  let reports: ListingQAReport[] = [];
  try {
    reports = input.listings.map(assembleListingQAReport);
    result.duplicates = detectCrossProviderDuplicates(input.listings);
    result.statistics = computeBatchStatistics(reports, result.duplicates);
    result.status = statusFromScore(result.statistics.avgQualityScore);
    result.degraded = result.status === "degraded";
    result.adminAlert = result.statistics.scanned > 0 && result.statistics.avgQualityScore < QA_WARNING_SCORE;
    result.reports = reports.slice(0, MAX_REPORTS_RETURNED);
  } catch (e) {
    result.errors.push(`analysis: ${errMsg(e)}`);
    return result; // safe partial
  }

  // ── Persistence (best-effort; failure never affects the verdict) ──────────
  let repo: ProviderQARepository | null;
  try { repo = deps && "repo" in deps ? deps.repo ?? null : await getDefaultRepo(); }
  catch { repo = null; }

  if (repo && !input.dryRun && result.statistics.scanned > 0) {
    try {
      const rawPayloads = input.listings.map((l) => (l.rawMetadata ?? {}) as Record<string, unknown>);
      const fingerprint = buildSchemaFingerprint(rawPayloads);
      const previous = await repo.getSchemaFingerprint(input.provider).catch(() => null);
      const changes: SchemaChange[] = detectSchemaChanges(input.provider, previous, fingerprint);
      result.schemaChanges = changes;
      await repo.saveSchemaFingerprint(input.provider, fingerprint, rawPayloads.length).catch(() => {});
      for (const c of changes) {
        await repo.insertSchemaEvent({ provider: c.provider, field: c.field, previousType: c.previousType, newType: c.newType, severity: c.severity }).catch(() => {});
      }

      // Section 10 — admin alert / degraded marker.
      if (result.adminAlert) {
        await repo.insertSchemaEvent({
          provider: input.provider, field: "quality_score",
          previousType: null, newType: String(result.statistics.avgQualityScore),
          severity: result.degraded ? "urgent" : "high",
          metadata: { reason: "quality_below_threshold", status: result.status, marketAreaKey: input.marketAreaKey ?? null },
        }).catch(() => {});
      }

      const row: ProviderQADailyMetricsRow = {
        provider: input.provider, day: todayIso(),
        listings_scanned: result.statistics.scanned,
        listings_rejected: result.statistics.rejected,
        normalization_errors: result.statistics.normalizationErrors,
        avg_fields_completeness: result.statistics.avgFieldsCompleteness,
        avg_quality_score: result.statistics.avgQualityScore,
        avg_latency_ms: input.latencyMs ?? 0,
        missing_phones: result.statistics.missingPhones,
        missing_images: result.statistics.missingImages,
        duplicate_count: result.statistics.duplicateCount,
        duplicate_rate: result.statistics.duplicateRate,
        schema_warnings: changes.length,
        credits_used: input.creditsUsed ?? 0,
        credits_saved: input.creditsSaved ?? 0,
        status: result.status,
      };
      await repo.upsertDailyMetrics(row).catch((e) => result.errors.push(`metrics: ${errMsg(e)}`));
    } catch (e) {
      result.errors.push(`persist: ${errMsg(e)}`);
    }
  }

  return result;
}
