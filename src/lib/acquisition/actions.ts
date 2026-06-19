"use server";

import { revalidatePath } from "next/cache";
import {
  createAcquisitionTask, getAcquisitionDetail, openAcquisitionForListing, promoteFromAcquisition,
  recomputeAcquisitionForOrg, setAcquisitionStatus, type AcquisitionDetail,
} from "./service";
import { initializeOrganizationDecisionBrain } from "@/lib/decision-intelligence/service";

export interface AcquisitionActionState { error?: string; ok?: boolean; message?: string; profileId?: string }

function revalidate() {
  revalidatePath("/acquisition");
  revalidatePath("/properties");
  revalidatePath("/command");
}

export async function recomputeAcquisitionAction(): Promise<AcquisitionActionState> {
  try {
    const s = await recomputeAcquisitionForOrg();
    try { await initializeOrganizationDecisionBrain(); } catch (e) { console.error("[acq] decision recalc failed:", e); }
    revalidate();
    return { ok: true, message: `${s.profiles} הזדמנויות · ${s.qualified} איכותיות · ${s.needsReview} לבדיקה` };
  } catch (e) { return { error: e instanceof Error ? e.message : "חישוב ההזדמנויות נכשל" }; }
}

export async function openAcquisitionAction(listingId: string): Promise<AcquisitionActionState> {
  try { const id = await openAcquisitionForListing(listingId); revalidate(); return { ok: true, profileId: id }; }
  catch (e) { return { error: e instanceof Error ? e.message : "פתיחת ההזדמנות נכשלה" }; }
}

export async function setAcquisitionStatusAction(profileId: string, status: string): Promise<AcquisitionActionState> {
  try { await setAcquisitionStatus(profileId, status); revalidate(); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון הסטטוס נכשל" }; }
}

export async function createAcquisitionTaskAction(profileId: string): Promise<AcquisitionActionState> {
  try { await createAcquisitionTask(profileId); revalidate(); return { ok: true, message: "נוצרה משימת גיוס" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "יצירת המשימה נכשלה" }; }
}

export async function promoteAcquisitionAction(profileId: string): Promise<AcquisitionActionState> {
  try { await promoteFromAcquisition(profileId); revalidate(); return { ok: true, message: "קודם ל-CRM" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הקידום נכשל" }; }
}

export async function getAcquisitionDetailAction(profileId: string): Promise<AcquisitionDetail | null> {
  return getAcquisitionDetail(profileId);
}
