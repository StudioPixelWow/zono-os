"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { initializeOrganizationDecisionBrain } from "./service";
import { attentionRepository } from "./repository";

export interface DecisionActionState {
  error?: string;
}

export async function recalcDecisionBrainAction(): Promise<DecisionActionState> {
  try {
    await initializeOrganizationDecisionBrain();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[decision] recalc failed:", e);
    return { error: `חישוב מרכז הפיקוד נכשל: ${msg}` };
  }
  revalidatePath("/command");
  return {};
}

export async function setAttentionStatusAction(
  id: string,
  status: "snoozed" | "resolved",
): Promise<DecisionActionState> {
  try {
    await attentionRepository.setStatus(id, status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `עדכון הפריט נכשל: ${msg}` };
  }
  revalidatePath("/command");
  return {};
}

/** Turn a focus/queue/attention item into a task (suggest-only autonomy). */
export async function focusToTaskAction(
  entityType: string,
  entityId: string,
  title: string,
): Promise<DecisionActionState> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  try {
    const supabase = await createClient();
    const link = entityType === "property" ? { property_id: entityId } : entityType === "seller" ? { seller_id: entityId } : {};
    const { error } = await supabase.from("tasks").insert({
      org_id: profile.org_id,
      created_by: user.id,
      assignee_id: user.id,
      title,
      status: "todo",
      entity_type: entityType,
      entity_id: entityId,
      intelligence_source: "decision_brain",
      ...link,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `יצירת המשימה נכשלה: ${msg}` };
  }
  revalidatePath("/command");
  return {};
}
