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

  try {
    await saveDraft(id, { ...input, status: "published" });
    await markPublished(id, input.primaryImageUrl ?? null);
  } catch (e) {
    console.error("[properties] publish failed:", e);
    return { error: "פרסום הנכס נכשל. נסה/י שוב." };
  }
  revalidatePath("/properties");
  redirect(`/properties/${id}`);
}
