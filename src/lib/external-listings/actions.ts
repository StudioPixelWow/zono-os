"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { buildMarketAnalysis, createAcquisitionTask, getExternalListingDetail, getImportDiagnostics, getSyncProgress, getListingPreview, promoteExternalListing, runImport, type ExternalListingDetail, type ImportDiagnostics, type ListingPreview, type SyncProgress, type SyncSummary, type SyncMode } from "./service";

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
