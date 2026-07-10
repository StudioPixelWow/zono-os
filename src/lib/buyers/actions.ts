"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { TaskStatus } from "@/lib/supabase/types";
import { createBuyer, updateBuyer, markBuyerContacted } from "./repository";
import type { BuyerInput } from "./types";

export interface BuyerActionState {
  error?: string;
}

function validate(input: BuyerInput): string | null {
  if (!input.fullName?.trim()) return "נא להזין שם מלא.";
  if (
    input.budgetMin != null &&
    input.budgetMax != null &&
    input.budgetMin > input.budgetMax
  )
    return "תקציב מינימום גבוה מהמקסימום.";
  return null;
}

export async function createBuyerAction(
  input: BuyerInput,
): Promise<BuyerActionState> {
  const err = validate(input);
  if (err) return { error: err };
  let id: string;
  try {
    const created = await createBuyer(input);
    id = created.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[buyers] create failed:", e);
    return { error: `יצירת הקונה נכשלה: ${msg}` };
  }
  // Spin up the buyer digital twin immediately (best-effort).
  try {
    const { logActivityEvent } = await import("@/lib/activity/service");
    await logActivityEvent({ eventType: "buyer.created", entityType: "buyer", entityId: id, title: "נוצר קונה חדש" });
    const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
    await emitBusinessEvent({ type: DOMAIN_EVENTS.buyerCreated, entityType: "buyer", entityId: id });
    const { initializeBuyerIntelligence } = await import("@/lib/buyer-intelligence/service");
    await initializeBuyerIntelligence(id);
    // Open the buyer's customer journey from this real buyer row (idempotent).
    const { ensureJourney } = await import("@/lib/journey-intelligence/service");
    await ensureJourney("buyer", id);
  } catch (e) {
    console.error("[buyers] intelligence auto-init failed:", e);
  }
  revalidatePath("/buyers");
  redirect(`/buyers/${id}?created=buyer`);
}

export async function updateBuyerAction(
  id: string,
  input: BuyerInput,
): Promise<BuyerActionState> {
  const err = validate(input);
  if (err) return { error: err };
  try {
    await updateBuyer(id, input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[buyers] update failed:", e);
    return { error: `עדכון הקונה נכשל: ${msg}` };
  }
  // STABILIZATION: emit buyer.updated with the salient facts so canonical memory
  // ingests budget / preferred area / must-haves (the salience gate keys on these).
  try {
    const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
    const mustHaves = [
      input.mustHaveElevator ? "מעלית" : null,
      input.mustHaveParking ? "חניה" : null,
      input.mustHaveSafeRoom ? 'ממ"ד' : null,
    ].filter(Boolean).join(", ");
    await emitBusinessEvent({
      type: DOMAIN_EVENTS.buyerUpdated, entityType: "buyer", entityId: id,
      payload: {
        budget: input.budgetMax ?? undefined,
        preferred_area: input.preferredAreas?.[0] ?? undefined,
        must_have: mustHaves || undefined,
      },
    });
  } catch (e) { console.error("[buyers] update emit failed:", e); }
  revalidatePath(`/buyers/${id}`);
  revalidatePath("/buyers");
  redirect(`/buyers/${id}`);
}

/** Stamp the buyer as contacted now — used by the "סמן כטופל" quick action. */
export async function markBuyerContactedAction(
  id: string,
): Promise<BuyerActionState> {
  try {
    await markBuyerContacted(id);
    // Best-effort activity log so the timeline reflects the touch.
    try {
      const { logActivityEvent } = await import("@/lib/activity/service");
      await logActivityEvent({
        eventType: "buyer.contacted",
        entityType: "buyer",
        entityId: id,
        title: "סומן כטופל",
      });
    } catch {
      /* activity logging is non-critical */
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[buyers] mark contacted failed:", e);
    return { error: `עדכון נכשל: ${msg}` };
  }
  revalidatePath("/buyers");
  revalidatePath(`/buyers/${id}`);
  return {};
}

// ── Buyer tasks (for the Tasks tab) ──────────────────────────────────────────
export async function createBuyerTaskAction(
  buyerId: string,
  title: string,
  dueAt: string | null,
): Promise<BuyerActionState> {
  if (!title.trim()) return { error: "נא להזין כותרת למשימה." };
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tasks").insert({
      org_id: profile.org_id,
      created_by: user.id,
      assignee_id: user.id,
      buyer_id: buyerId,
      title: title.trim(),
      due_at: dueAt || null,
      status: "todo",
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[buyers] task create failed:", e);
    return { error: `יצירת המשימה נכשלה: ${msg}` };
  }
  revalidatePath(`/buyers/${buyerId}`);
  return {};
}

/** Add a note to a buyer (first real writer of the notes table) + timeline. */
export async function addBuyerNoteAction(buyerId: string, body: string): Promise<BuyerActionState> {
  if (!body.trim()) return { error: "נא להזין הערה." };
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("notes").insert({
      org_id: profile.org_id, author_id: user.id, buyer_id: buyerId, body: body.trim(),
    });
    if (error) throw new Error(error.message);
    const { logActivityEvent } = await import("@/lib/activity/service");
    await logActivityEvent({ eventType: "note.created", entityType: "buyer", entityId: buyerId, title: "נוספה הערה" });
  } catch (e) {
    console.error("[buyers] note create failed:", e);
    return { error: e instanceof Error ? e.message : "שמירת ההערה נכשלה." };
  }
  revalidatePath(`/buyers/${buyerId}`);
  return {};
}

export async function setBuyerTaskStatusAction(
  buyerId: string,
  taskId: string,
  status: TaskStatus,
): Promise<BuyerActionState> {
  try {
    const supabase = await createClient();
    const done = status === "done";
    const { error } = await supabase
      .from("tasks")
      .update({ status, completed_at: done ? new Date().toISOString() : null })
      .eq("id", taskId);
    if (error) throw new Error(error.message);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[buyers] task status failed:", e);
    return { error: `עדכון המשימה נכשל: ${msg}` };
  }
  revalidatePath(`/buyers/${buyerId}`);
  return {};
}
