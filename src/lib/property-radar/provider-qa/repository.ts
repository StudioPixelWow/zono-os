// ============================================================================
// ZONO Property Radar™ — provider QA repository (server-only, service-role).
// Reads/writes the three shared QA tables. Daily metrics ACCUMULATE within a day
// (weighted averages by listings scanned) so multiple syncs roll up correctly.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { PropertyProviderName } from "../types";
import type {
  InsertSchemaEventInput,
  ProviderQADailyMetricsRow,
  ProviderQARepository,
  SchemaFingerprint,
} from "./types";

const SCHEMA_EVENTS = "provider_schema_events";
const FINGERPRINTS = "provider_schema_fingerprints";
const METRICS = "provider_qa_daily_metrics";

type Db = ReturnType<typeof createServiceRoleClient>;

function weighted(prev: number, prevN: number, next: number, nextN: number): number {
  const total = prevN + nextN;
  if (total <= 0) return next;
  return Math.round((prev * prevN + next * nextN) / total);
}

export function createProviderQARepository(db: Db = createServiceRoleClient()): ProviderQARepository {
  return {
    async getSchemaFingerprint(provider: PropertyProviderName): Promise<SchemaFingerprint | null> {
      const { data, error } = await db
        .from(FINGERPRINTS as never)
        .select("fields")
        .eq("provider", provider)
        .maybeSingle();
      if (error) throw new Error(`getSchemaFingerprint failed: ${error.message}`);
      return (data as unknown as { fields: SchemaFingerprint } | null)?.fields ?? null;
    },

    async saveSchemaFingerprint(provider, fields, sampleCount): Promise<void> {
      const { error } = await db
        .from(FINGERPRINTS as never)
        .upsert({ provider, fields: fields as unknown as Record<string, unknown>, sample_count: sampleCount, updated_at: new Date().toISOString() } as never, { onConflict: "provider" });
      if (error) throw new Error(`saveSchemaFingerprint failed: ${error.message}`);
    },

    async insertSchemaEvent(input: InsertSchemaEventInput): Promise<void> {
      const { error } = await db.from(SCHEMA_EVENTS as never).insert({
        provider: input.provider, field: input.field, previous_type: input.previousType,
        new_type: input.newType, severity: input.severity, metadata: input.metadata ?? {},
      } as never);
      if (error) throw new Error(`insertSchemaEvent failed: ${error.message}`);
    },

    async upsertDailyMetrics(row: ProviderQADailyMetricsRow): Promise<void> {
      const { data: existing } = await db
        .from(METRICS as never)
        .select("*")
        .eq("provider", row.provider)
        .eq("day", row.day)
        .maybeSingle();
      const prev = existing as unknown as ProviderQADailyMetricsRow | null;

      const merged: ProviderQADailyMetricsRow = prev
        ? {
            provider: row.provider, day: row.day,
            listings_scanned: prev.listings_scanned + row.listings_scanned,
            listings_rejected: prev.listings_rejected + row.listings_rejected,
            normalization_errors: prev.normalization_errors + row.normalization_errors,
            avg_fields_completeness: weighted(prev.avg_fields_completeness, prev.listings_scanned, row.avg_fields_completeness, row.listings_scanned),
            avg_quality_score: weighted(prev.avg_quality_score, prev.listings_scanned, row.avg_quality_score, row.listings_scanned),
            avg_latency_ms: weighted(prev.avg_latency_ms, prev.listings_scanned, row.avg_latency_ms, row.listings_scanned),
            missing_phones: prev.missing_phones + row.missing_phones,
            missing_images: prev.missing_images + row.missing_images,
            duplicate_count: prev.duplicate_count + row.duplicate_count,
            duplicate_rate: weighted(prev.duplicate_rate, prev.listings_scanned, row.duplicate_rate, row.listings_scanned),
            schema_warnings: prev.schema_warnings + row.schema_warnings,
            credits_used: prev.credits_used + row.credits_used,
            credits_saved: prev.credits_saved + row.credits_saved,
            status: row.status, // latest verdict wins
          }
        : row;

      const { error } = await db
        .from(METRICS as never)
        .upsert({ ...merged, updated_at: new Date().toISOString() } as never, { onConflict: "provider,day" });
      if (error) throw new Error(`upsertDailyMetrics failed: ${error.message}`);
    },

    async getLatestDailyMetrics(): Promise<ProviderQADailyMetricsRow[]> {
      const { data, error } = await db
        .from(METRICS as never)
        .select("*")
        .order("day", { ascending: false })
        .limit(60);
      if (error) throw new Error(`getLatestDailyMetrics failed: ${error.message}`);
      const rows = (data ?? []) as unknown as ProviderQADailyMetricsRow[];
      const seen = new Set<string>();
      const latest: ProviderQADailyMetricsRow[] = [];
      for (const r of rows) { if (!seen.has(r.provider)) { seen.add(r.provider); latest.push(r); } }
      return latest;
    },

    async getRecentSchemaEvents(limit = 30) {
      const { data, error } = await db
        .from(SCHEMA_EVENTS as never)
        .select("provider, field, previous_type, new_type, severity, detected_at")
        .order("detected_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`getRecentSchemaEvents failed: ${error.message}`);
      return (data ?? []) as unknown as { provider: string; field: string; previous_type: string | null; new_type: string | null; severity: string; detected_at: string }[];
    },
  };
}
