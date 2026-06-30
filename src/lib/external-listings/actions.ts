"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { buildMarketAnalysis, createAcquisitionTask, geocodeBacklogForSessionOrg, getExternalListingDetail, getImportDiagnostics, getSyncProgress, getListingPreview, promoteExternalListing, runImport, startSyncJob, runSyncChunk, finishSyncJob, type ExternalListingDetail, type ImportDiagnostics, type ListingPreview, type SyncProgress, type SyncSummary, type SyncMode, type SyncPlan, type ChunkResult } from "./service";

export interface ExternalActionState {
  error?: string;
  summary?: SyncSummary;
}

async function doSync(opts: { sources?: string[]; localityId?: string | null; mode?: SyncMode }): Promise<ExternalActionState> {
  try {
    const summary = await runImport(opts);
    revalidatePath("/properties");
    return { summary };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[external] sync failed:", e);
    return { error: `ייבוא נכשל: ${msg}` };
  }
}

export async function importYad2Action(): Promise<ExternalActionState> {
  return doSync({ sources: ["yad2"] });
}
export async function importMadlanAction(): Promise<ExternalActionState> {
  return doSync({ sources: ["madlan"] });
}
export async function importAllAction(): Promise<ExternalActionState> {
  return doSync({});
}
export async function syncNowAction(
  localityId?: string | null,
  source?: string | null,
  mode?: SyncMode,
): Promise<ExternalActionState> {
  return doSync({ localityId: localityId || null, sources: source ? [source] : undefined, mode });
}

// ── Chunked sync actions (browser drives one Apify run per request) ──────────
export async function startSyncJobAction(
  localityId?: string | null,
  source?: string | null,
  mode?: SyncMode,
): Promise<{ plan?: SyncPlan; error?: string }> {
  try {
    const plan = await startSyncJob({ localityId: localityId || null, sources: source ? [source] : undefined, mode });
    return { plan };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה בהפעלת הסנכרון" };
  }
}

export async function runSyncChunkAction(jobId: string, city: string, source: string, perCity: number): Promise<ChunkResult> {
  try {
    return await runSyncChunk(jobId, city, source, perCity);
  } catch (e) {
    return { found: 0, inserted: 0, updated: 0, error: e instanceof Error ? e.message : "שגיאה" };
  }
}

export async function finishSyncJobAction(jobId: string, cities: string[], errorCount = 0): Promise<ExternalActionState> {
  try {
    const summary = await finishSyncJob(jobId, cities, errorCount);
    revalidatePath("/properties");
    // Fire-and-forget: learn the brokerage market for each synced city if it's
    // new/weak/stale. Never awaited; throttled/deduped; never fails the sync.
    try {
      const { getSessionContext } = await import("@/lib/auth/session");
      const { triggerCityLearning } = await import("@/lib/brokerage-data/city-learning-trigger");
      const { profile } = await getSessionContext().catch(() => ({ profile: null as { org_id?: string } | null }));
      const orgId = profile?.org_id ?? null;
      for (const city of [...new Set(cities)].slice(0, 20)) void triggerCityLearning(orgId, city, "external_listing_city_detected").catch(() => {});
    } catch (e) { console.error("[external-listings] city learning trigger skipped:", e); }
    return { summary };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה בסיום הסנכרון" };
  }
}

export async function promoteExternalListingAction(listingId: string): Promise<ExternalActionState> {
  let propertyId: string;
  try {
    propertyId = await promoteExternalListing(listingId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `קידום הנכס נכשל: ${msg}` };
  }
  revalidatePath("/properties");
  redirect(`/properties/${propertyId}`);
}

export async function getImportDiagnosticsAction(): Promise<ImportDiagnostics> {
  return getImportDiagnostics();
}

export interface GeocodeBacklogState {
  result?: { attempted: number; success: number; failed: number; skipped: number };
  error?: string;
}
/** Manually drain the geocode backlog for this org (so scraped listings get
 *  coordinates and appear on the map without waiting for the hourly cron). */
export async function geocodeBacklogNowAction(): Promise<GeocodeBacklogState> {
  try {
    const result = await geocodeBacklogForSessionOrg();
    revalidatePath("/properties");
    return { result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[external] manual geocode failed:", e);
    return { error: `גיאוקודינג נכשל: ${msg}` };
  }
}

/** Lightweight live progress for the running sync — polled by the UI. */
export async function getSyncProgressAction(): Promise<SyncProgress> {
  return getSyncProgress();
}

export async function getExternalListingDetailAction(listingId: string): Promise<ExternalListingDetail | null> {
  try {
    return await getExternalListingDetail(listingId);
  } catch (e) {
    console.error("[external] detail failed:", e);
    return null;
  }
}

export async function getListingPreviewAction(listingId: string): Promise<ListingPreview | null> {
  try {
    return await getListingPreview(listingId);
  } catch (e) {
    console.error("[external] preview failed:", e);
    return null;
  }
}

export async function createAcquisitionTaskAction(listingId: string): Promise<ExternalActionState> {
  try {
    await createAcquisitionTask(listingId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `יצירת משימת הגיוס נכשלה: ${msg}` };
  }
  revalidatePath("/properties");
  return {};
}

export interface AnalysisState {
  text?: string;
  error?: string;
}
export async function buildMarketAnalysisAction(): Promise<AnalysisState> {
  try {
    const a = await buildMarketAnalysis();
    return { text: a.summaryText };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `בניית ניתוח נכשלה: ${msg}` };
  }
}
