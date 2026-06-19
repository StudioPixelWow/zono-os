"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { promoteExternalListing, runImport } from "./service";

export interface ExternalActionState {
  error?: string;
  imported?: number;
}

async function doImport(provider: string): Promise<ExternalActionState> {
  try {
    const r = await runImport(provider);
    revalidatePath("/properties");
    return { imported: r.imported };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[external] import failed:", e);
    return { error: `ייבוא נכשל: ${msg}` };
  }
}

export const importYad2Action = () => doImport("yad2");
export const importMadlanAction = () => doImport("madlan");
export async function importAllAction(): Promise<ExternalActionState> {
  const a = await doImport("yad2");
  const b = await doImport("madlan");
  if (a.error || b.error) return { error: a.error ?? b.error };
  return { imported: (a.imported ?? 0) + (b.imported ?? 0) };
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
