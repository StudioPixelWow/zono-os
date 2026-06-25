"use server";
// ============================================================================
// ZONO Property Radar™ — provider QA admin actions (admin-only).
// Powers /admin/provider-qa: the Provider Health dashboard + the manual QA
// screen (scan a small sample → raw/normalized/validation/score/errors).
// Strictly admin-gated; reads shared QA tables via the service role.
// ============================================================================
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getPropertyProvider } from "../providers/registry";
import type { PropertyProviderName } from "../types";
import { createProviderQARepository } from "./repository";
import { runProviderQA } from "./engine";
import { assembleListingQAReport } from "./report";
import type { ListingQAReport, ProviderQABatchResult, ProviderQADailyMetricsRow } from "./types";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה." };
}

const ROLE_RANK: Record<string, number> = { owner: 100, admin: 80, manager: 60, agent: 40, viewer: 20 };

/** Throw unless the caller is an admin (rank ≥ admin). */
async function requireAdmin(): Promise<{ db: ReturnType<typeof createServiceRoleClient> }> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("אין הרשאה.");
  const db = createServiceRoleClient();
  let roleKey = "agent";
  if (profile.role_id) {
    const { data } = await db.from("roles").select("key").eq("id", profile.role_id).maybeSingle();
    roleKey = (data as { key: string } | null)?.key ?? "agent";
  }
  if ((ROLE_RANK[roleKey] ?? 0) < ROLE_RANK.admin) throw new Error("עמוד זה זמין למנהלים בלבד.");
  return { db };
}

export interface ProviderQADashboard {
  metrics: ProviderQADailyMetricsRow[];
  schemaEvents: { provider: string; field: string; previous_type: string | null; new_type: string | null; severity: string; detected_at: string }[];
}

export async function getProviderQADashboardAction(): Promise<Result<ProviderQADashboard>> {
  try {
    const { db } = await requireAdmin();
    const repo = createProviderQARepository(db);
    const [metrics, schemaEvents] = await Promise.all([repo.getLatestDailyMetrics(), repo.getRecentSchemaEvents(40)]);
    return { ok: true, data: { metrics, schemaEvents } };
  } catch (e) {
    return fail(e);
  }
}

export interface ManualProviderQAResult {
  provider: PropertyProviderName;
  batch: ProviderQABatchResult;
  reports: ListingQAReport[];
}

/**
 * Run a one-off QA pass against a small live sample (admin tool). Uses a cheap
 * metadata scan, caps the sample, and does NOT persist (dryRun).
 */
export async function runManualProviderQAAction(
  provider: PropertyProviderName,
  city: string,
  sampleSize = 10,
): Promise<Result<ManualProviderQAResult>> {
  try {
    await requireAdmin();
    if (!city.trim()) throw new Error("יש להזין עיר.");
    const impl = getPropertyProvider(provider); // throws if provider unknown
    const scan = await impl.scanAreaMetadata({ city: city.trim(), provider });
    const sample = scan.listings.slice(0, Math.max(1, Math.min(25, sampleSize)));
    const batch = await runProviderQA({ provider, listings: sample, latencyMs: 0, dryRun: true }, { repo: null });
    const reports = sample.map(assembleListingQAReport);
    return { ok: true, data: { provider, batch, reports } };
  } catch (e) {
    return fail(e);
  }
}
