"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { createSeller, type NewSellerInput } from "./repository";
import { initializeSellerIntelligence } from "@/lib/seller-intelligence/service";

export interface SellerCrudState {
  error?: string;
}

export async function createSellerAction(input: NewSellerInput): Promise<SellerCrudState> {
  if (!input.fullName?.trim()) return { error: "נא להזין שם מלא." };
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  let id: string;
  try {
    const seller = await createSeller(input, profile.org_id, user.id);
    id = seller.id;
    // Spin up the seller digital twin immediately.
    await initializeSellerIntelligence(id).catch((e) => console.error("[seller] auto-init failed:", e));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[seller] create failed:", e);
    return { error: `יצירת המוכר נכשלה: ${msg}` };
  }
  revalidatePath("/sellers");
  redirect(`/sellers/${id}`);
}
