"use server";

import { revalidatePath } from "next/cache";
import {
  createClientPortal, regeneratePortalContent, approvePortal, revokePortal, pausePortal,
  extendPortalExpiration, updatePortalSectionVisibility, updatePortalItemVisibility, type PortalType,
} from "./service";
import { logActivityEvent } from "@/lib/activity/service";

export interface PortalActionState { ok?: boolean; error?: string; message?: string; token?: string; portalId?: string }

function revalidate() {
  revalidatePath("/portals");
  revalidatePath("/");
}

// In a "use server" module every export must be an async function.
export async function createClientPortalAction(entityType: string, entityId: string, portalType: PortalType, visibility?: "minimal" | "curated" | "detailed"): Promise<PortalActionState> {
  try {
    const r = await createClientPortal({ entityType, entityId, portalType, visibility });
    revalidate();
    return { ok: true, portalId: r.portalId, token: r.token, message: "הפורטל נוצר — אשר אותו והעתק את הקישור" };
  } catch (e) { return { error: e instanceof Error ? e.message : "יצירת הפורטל נכשלה" }; }
}

export async function approvePortalAction(portalId: string): Promise<PortalActionState> {
  try { await approvePortal(portalId); revalidate(); return { ok: true, message: "הפורטל אושר והופעל" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "אישור נכשל" }; }
}
export async function revokePortalAction(portalId: string): Promise<PortalActionState> {
  try { await revokePortal(portalId); revalidate(); return { ok: true, message: "הפורטל בוטל" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "ביטול נכשל" }; }
}
export async function pausePortalAction(portalId: string): Promise<PortalActionState> {
  try { await pausePortal(portalId); revalidate(); return { ok: true, message: "הפורטל הושהה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "השהיה נכשלה" }; }
}
export async function extendPortalAction(portalId: string): Promise<PortalActionState> {
  try { await extendPortalExpiration(portalId, 30); revalidate(); return { ok: true, message: "התוקף הוארך ב-30 יום" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "הארכה נכשלה" }; }
}
export async function regeneratePortalAction(portalId: string): Promise<PortalActionState> {
  try { await regeneratePortalContent(portalId); revalidate(); return { ok: true, message: "התוכן עודכן" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון נכשל" }; }
}
export async function setSectionVisibilityAction(sectionId: string, isVisible: boolean): Promise<PortalActionState> {
  try { await updatePortalSectionVisibility(sectionId, isVisible); revalidate(); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון נכשל" }; }
}
export async function setItemVisibilityAction(itemId: string, isVisible: boolean): Promise<PortalActionState> {
  try { await updatePortalItemVisibility(itemId, isVisible); revalidate(); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון נכשל" }; }
}

/** Records a link-copied activity event (Part 14). */
export async function logPortalLinkCopiedAction(entityType: string, entityId: string): Promise<PortalActionState> {
  try { await logActivityEvent({ eventType: "client_portal.link_copied", entityType, entityId, title: "קישור פורטל הועתק" }); return { ok: true }; }
  catch (e) { return { error: e instanceof Error ? e.message : "" }; }
}
