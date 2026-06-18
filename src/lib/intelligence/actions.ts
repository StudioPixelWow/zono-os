"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import {
  initializePropertyIntelligence,
  recalculatePropertyIntelligence,
} from "./service";
import {
  propertyCalendarPlanRepository,
  propertyLeverRepository,
  propertyRiskRepository,
} from "./repository";

export interface IntelActionState {
  error?: string;
}

const revalidate = (id: string) => {
  revalidatePath(`/properties/${id}`);
  revalidatePath("/properties");
};

export async function initializeIntelligenceAction(
  propertyId: string,
): Promise<IntelActionState> {
  try {
    await initializePropertyIntelligence(propertyId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[intelligence] init failed:", e);
    return { error: `הפעלת ZONO Intelligence נכשלה: ${msg}` };
  }
  revalidate(propertyId);
  return {};
}

export async function recalcIntelligenceAction(
  propertyId: string,
): Promise<IntelActionState> {
  try {
    await recalculatePropertyIntelligence(propertyId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[intelligence] recalc failed:", e);
    return { error: `חישוב מחדש נכשל: ${msg}` };
  }
  revalidate(propertyId);
  return {};
}

/** Turn a recommended lever into a real task and link them. */
export async function leverToTaskAction(
  propertyId: string,
  leverId: string,
): Promise<IntelActionState> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  try {
    const lever = await propertyLeverRepository.getById(leverId);
    if (!lever) return { error: "המנוף לא נמצא." };
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        org_id: profile.org_id,
        created_by: user.id,
        assignee_id: user.id,
        property_id: propertyId,
        title: lever.title,
        description: lever.expected_impact,
        priority: lever.urgency_score >= 70 ? "high" : "medium",
        status: "todo",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await propertyLeverRepository.setStatus(leverId, "in_progress", data.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[intelligence] lever→task failed:", e);
    return { error: `יצירת המשימה נכשלה: ${msg}` };
  }
  revalidate(propertyId);
  return {};
}

export async function markLeverDoneAction(
  propertyId: string,
  leverId: string,
): Promise<IntelActionState> {
  try {
    await propertyLeverRepository.setStatus(leverId, "done");
    await recalculatePropertyIntelligence(propertyId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `עדכון המנוף נכשל: ${msg}` };
  }
  revalidate(propertyId);
  return {};
}

export async function resolveRiskAction(
  propertyId: string,
  riskId: string,
): Promise<IntelActionState> {
  try {
    await propertyRiskRepository.resolve(riskId);
    await recalculatePropertyIntelligence(propertyId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `טיפול בסיכון נכשל: ${msg}` };
  }
  revalidate(propertyId);
  return {};
}

/** Calendar CTA — no external calendar yet: create a task + mark the plan scheduled. */
export async function scheduleCalendarPlanAction(
  propertyId: string,
  planId: string,
  title: string,
  suggestedDate: string | null,
): Promise<IntelActionState> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tasks").insert({
      org_id: profile.org_id,
      created_by: user.id,
      assignee_id: user.id,
      property_id: propertyId,
      title,
      due_at: suggestedDate,
      status: "todo",
    });
    if (error) throw new Error(error.message);
    await propertyCalendarPlanRepository.setStatus(planId, "scheduled");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `שיבוץ נכשל: ${msg}` };
  }
  revalidate(propertyId);
  return {};
}
