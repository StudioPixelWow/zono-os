// ============================================================================
// ZONO — BI repository (server-only). bi_snapshots + bi_reports persistence and
// snapshot history reads (for benchmarks). Strictly org-scoped.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { BiSnapshotPayload } from "./types";
import type { ReportPayload } from "./exports";

type Db = ReturnType<typeof createServiceRoleClient>;
const SNAP = "bi_snapshots";
const REP = "bi_reports";

export function createBiRepository(db: Db) {
  return {
    async saveSnapshot(orgId: string, payload: BiSnapshotPayload): Promise<void> {
      await db.from(SNAP as never).upsert({
        org_id: orgId, snapshot_date: new Date().toISOString().slice(0, 10),
        kpis: payload.kpis, forecast: payload.forecast, pipeline: payload.pipeline, health: payload.health,
        roi: payload.roi, revenue: payload.revenue, risk: payload.risk, benchmarks: payload.benchmarks,
      } as never, { onConflict: "org_id,snapshot_date" });
    },

    /** Snapshot history (most recent first) for benchmark comparison. */
    async snapshotHistory(orgId: string, limit = 30): Promise<{ snapshot_date: string; kpis: unknown; health: unknown; revenue: unknown }[]> {
      const { data } = await db.from(SNAP as never).select("snapshot_date, kpis, health, revenue").eq("org_id", orgId).order("snapshot_date", { ascending: false }).limit(limit);
      return (data ?? []) as never;
    },

    async createReport(orgId: string, userId: string, r: { reportType: string; title: string; format: string; periodFrom: string | null; periodTo: string | null; payload: ReportPayload }): Promise<string | null> {
      const { data } = await db.from(REP as never).insert({
        org_id: orgId, report_type: r.reportType, title: r.title, format: r.format,
        period_from: r.periodFrom, period_to: r.periodTo, payload: r.payload, created_by: userId,
      } as never).select("id").maybeSingle();
      return (data as { id: string } | null)?.id ?? null;
    },

    async listReports(orgId: string, limit = 30): Promise<{ id: string; report_type: string; title: string | null; format: string; created_at: string }[]> {
      const { data } = await db.from(REP as never).select("id, report_type, title, format, created_at").eq("org_id", orgId).order("created_at", { ascending: false }).limit(limit);
      return (data ?? []) as never;
    },
  };
}

export type BiRepository = ReturnType<typeof createBiRepository>;
