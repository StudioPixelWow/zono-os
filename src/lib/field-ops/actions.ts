// ============================================================================
// 📱 ZONO Mobile Field Operations™ — server actions (thin delegators). 41.0.
// Every creation REUSES an existing approval-gated action — no duplicated logic.
// Quick Actions FAB + Meeting Mode call these clean field-scoped wrappers.
// ============================================================================
"use server";
import { getVisitMode } from "./service";
import { createPropertyTaskAction } from "@/lib/tasks/actions";
import { logCommunicationAction } from "@/lib/communication/actions";
import { createDraftAction, createFollowupAction } from "@/lib/whatsapp/actions";
import { askBrokerZonoAction } from "@/lib/broker-workspace/actions";
import type { VisitMode } from "./types";

export async function getVisitModeAction(propertyId: string): Promise<{ ok: boolean; result?: VisitMode; error?: string }> {
  if (!propertyId) return { ok: false, error: "missing id" };
  try { const v = await getVisitMode(propertyId); return v ? { ok: true, result: v } : { ok: false, error: "not found" }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : "failed" }; }
}

/** Create a task on a property — reuses the existing task action. */
export async function fieldCreateTaskAction(propertyId: string, title: string): Promise<{ ok: boolean; message?: string }> {
  const r = await createPropertyTaskAction(propertyId, title, null, "medium");
  return { ok: !("error" in r && r.error), message: ("error" in r && r.error) ? r.error : "משימה נוצרה" };
}

/** Log a field note — reuses logCommunication (channel: note). */
export async function fieldLogNoteAction(entityType: string, entityId: string, title: string, body: string): Promise<{ ok: boolean; message?: string }> {
  if (!title.trim()) return { ok: false, message: "נא להזין כותרת." };
  const r = await logCommunicationAction({ entityType, entityId, channel: "note", direction: "outbound", title, body });
  return { ok: !("error" in r && r.error), message: ("error" in r && r.error) ? r.error : "הערה נשמרה" };
}

/** Save a meeting note + optional follow-up — reuses logCommunication (channel: meeting). */
export async function fieldLogMeetingAction(entityType: string, entityId: string, title: string, body: string, followupDueAt: string | null): Promise<{ ok: boolean; message?: string }> {
  const r = await logCommunicationAction({ entityType, entityId, channel: "meeting", direction: "outbound", title: title || "פגישה", body, followupTitle: followupDueAt ? "מעקב לאחר פגישה" : null, followupDueAt, createTask: !!followupDueAt });
  return { ok: !("error" in r && r.error), message: ("error" in r && r.error) ? r.error : "סיכום הפגישה נשמר" };
}

/** Draft a message — reuses the approval-gated WhatsApp draft action. */
export async function fieldCreateDraftAction(body: string): Promise<{ ok: boolean; message?: string }> {
  if (!body.trim()) return { ok: false, message: "נא להזין תוכן." };
  const r = await createDraftAction({ body });
  return { ok: !("error" in r && r.error), message: ("message" in r && r.message) ? r.message : ("error" in r && r.error) ? r.error : "טיוטה נוצרה" };
}

/** Schedule a follow-up — reuses the existing follow-up action. */
export async function fieldFollowupAction(body: string, dueAt: string): Promise<{ ok: boolean; message?: string }> {
  const r = await createFollowupAction({ body, dueAt });
  return { ok: !("error" in r && r.error), message: ("message" in r && r.message) ? r.message : ("error" in r && r.error) ? r.error : "מעקב נקבע" };
}

/** Ask ZONO in the field — reuses the broker-scoped Ask. */
export async function askFieldAction(query: string): Promise<{ ok: boolean; answer?: string; limitations?: string | null }> {
  const r = await askBrokerZonoAction(query);
  return { ok: r.ok, answer: r.result?.answer, limitations: r.result?.limitations ?? null };
}
