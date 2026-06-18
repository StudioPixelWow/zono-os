"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PropertyStatus } from "@/lib/supabase/types";
import {
  archiveProperty,
  createProperty,
  setPropertyStatus,
  updateProperty,
  type PropertyInput,
} from "./repository";

export interface PropertyActionState {
  error?: string;
}

function validate(input: PropertyInput): string | null {
  if (!input.title?.trim()) return "נא להזין כותרת לנכס.";
  if (input.price == null || Number.isNaN(input.price) || input.price < 0)
    return "נא להזין מחיר תקין.";
  return null;
}

export async function createPropertyAction(
  input: PropertyInput,
): Promise<PropertyActionState> {
  const err = validate(input);
  if (err) return { error: err };

  let id: string;
  try {
    const created = await createProperty(input);
    id = created.id;
  } catch (e) {
    console.error("[properties] create failed:", e);
    return { error: "יצירת הנכס נכשלה. נסה/י שוב." };
  }
  revalidatePath("/properties");
  redirect(`/properties/${id}`);
}

export async function updatePropertyAction(
  id: string,
  input: PropertyInput,
): Promise<PropertyActionState> {
  const err = validate(input);
  if (err) return { error: err };

  try {
    await updateProperty(id, input);
  } catch (e) {
    console.error("[properties] update failed:", e);
    return { error: "עדכון הנכס נכשל. נסה/י שוב." };
  }
  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
  redirect(`/properties/${id}`);
}

export async function setPropertyStatusAction(
  id: string,
  status: PropertyStatus,
): Promise<PropertyActionState> {
  try {
    await setPropertyStatus(id, status);
  } catch (e) {
    console.error("[properties] status change failed:", e);
    return { error: "שינוי הסטטוס נכשל." };
  }
  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
  return {};
}

export async function archivePropertyAction(
  id: string,
): Promise<PropertyActionState> {
  try {
    await archiveProperty(id);
  } catch (e) {
    console.error("[properties] archive failed:", e);
    return { error: "העברה לארכיון נכשלה." };
  }
  revalidatePath("/properties");
  redirect("/properties");
}
