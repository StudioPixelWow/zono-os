"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { buildMarketAnalysis, promoteExternalListing, runImport, type SyncSummary } from "./service";

export interface ExternalActionState {
  error?: string;
  summary?: SyncSummary;
}

async function doSync(opts: { sources?: string[]; localityId?: string | null }): Promise<ExternalActionState> {
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

export const importYad2Action = () => doSync({ sources: ["yad2"] });
export const importMadlanAction = () => doSync({ sources: ["madlan"] });
export const importAllAction = () => doSync({});
export const syncNowAction = (localityId?: string | null, source?: string | null) =>
  doSync({ localityId: localityId || null, sources: source ? [source] : undefined });

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
