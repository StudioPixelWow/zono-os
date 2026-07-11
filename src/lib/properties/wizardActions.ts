"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createDraftProperty,
  discardDraft,
  markPublished,
  saveDraft,
} from "./repository";
import type { PropertyInput } from "./types";

export interface WizardActionState {
  error?: string;
}

/** Create an empty draft on wizard entry; returns the new id. */
export async function createDraftPropertyAction(): Promise<{ id: string }> {
  const draft = await createDraftProperty();
  return { id: draft.id };
}

/** Debounced autosave of the whole form into the draft. */
export async function saveDraftAction(
  id: string,
  input: PropertyInput,
): Promise<WizardActionState> {
  try {
    await saveDraft(id, input);
  } catch (e) {
    console.error("[properties] autosave failed:", e);
    return { error: "השמירה האוטומטית נכשלה." };
  }
  return {};
}

/** Cancel: discard the draft and return to the list. */
export async function discardDraftAction(id: string): Promise<void> {
  try {
    await discardDraft(id);
  } catch (e) {
    console.error("[properties] discard failed:", e);
  }
  revalidatePath("/properties");
  redirect("/properties");
}

/** Final publish: save everything, mark published, go to the property page. */
export async function publishPropertyAction(
  id: string,
  input: PropertyInput,
): Promise<WizardActionState> {
  if (!input.title?.trim()) return { error: "נא להזין כותרת לפני פרסום." };
  if (!input.price || input.price <= 0) return { error: "נא להזין מחיר לפני פרסום." };

  // Seller readiness gate: a property cannot be published without a linked
  // seller + a decision-maker/signer + a contact method.
  try {
    const { validatePropertySellerReadiness } = await import("@/lib/sellers/propertySellers");
    const readiness = await validatePropertySellerReadiness(id);
    if (!readiness.ready) {
      return { error: "כדי לפרסם נכס, יש לקשר לפחות מוכר אחד ולקבוע מי מקבל החלטות." };
    }
  } catch (e) {
    console.error("[properties] seller readiness check failed:", e);
  }

  try {
    await saveDraft(id, { ...input, status: "published" });
    await markPublished(id, input.primaryImageUrl ?? null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[properties] publish failed:", e);
    return { error: `פרסום הנכס נכשל: ${msg}` };
  }

  // ── Event Kernel ──────────────────────────────────────────────────────────
  // Publish is the moment a draft becomes a real listing — the canonical
  // business fact. Emit it here, because THIS is the path the property wizard
  // actually uses; createPropertyAction (properties/actions.ts) emits too but is
  // not reachable from the new-property UI, so without this the kernel never saw
  // a single property. Best-effort by contract: emit never breaks publishing.
  // A draft (createDraft/saveDraft) is deliberately NOT an event — it is not yet
  // a business fact, and emitting on every autosave keystroke would flood the outbox.
  try {
    const { emitBusinessEvent, DOMAIN_EVENTS } = await import("@/lib/kernel");
    await emitBusinessEvent({
      type: DOMAIN_EVENTS.propertyCreated,
      entityType: "property",
      entityId: id,
      payload: { title: input.title ?? null, price: input.price ?? null, city: input.city ?? null, status: "published" },
      // One published-property event per property, even if publish is retried.
      idempotencyKey: `property.created:${id}`,
    });
  } catch (e) {
    console.error("[kernel] property publish emit failed:", e);
  }

  // Best-effort: initialize the property's intelligence on publish. Never
  // blocks publishing — the Command Center also has a manual activate button.
  try {
    const { initializePropertyIntelligence } = await import(
      "@/lib/intelligence/service"
    );
    await initializePropertyIntelligence(id);
  } catch (e) {
    console.error("[intelligence] auto-init on publish failed:", e);
  }

  revalidatePath("/properties");
  redirect(`/properties/${id}?created=property`);
}
