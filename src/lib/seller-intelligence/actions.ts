"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { logActivityEvent } from "@/lib/activity/service";
import {
  initializeSellerIntelligence,
  recalculateSellerIntelligence,
} from "./service";
import {
  sellerCommitmentRepository,
  sellerRiskRepository,
  sellerTouchpointRepository,
} from "./repository";
import { TOUCHPOINT_IMPACTS, TOUCHPOINT_LABELS } from "./playbook";

export interface SellerActionState {
  error?: string;
}

const revalidate = (id: string) => {
  revalidatePath(`/sellers/${id}`);
  revalidatePath("/sellers");
};

export async function initializeSellerIntelligenceAction(sellerId: string): Promise<SellerActionState> {
  try {
    await initializeSellerIntelligence(sellerId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[seller] init failed:", e);
    return { error: `הפעלת מודיעין מוכר נכשלה: ${msg}` };
  }
  revalidate(sellerId);
  return {};
}

export async function recalcSellerIntelligenceAction(sellerId: string): Promise<SellerActionState> {
  try {
    await recalculateSellerIntelligence(sellerId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `חישוב מחדש נכשל: ${msg}` };
  }
  revalidate(sellerId);
  return {};
}

export async function logSellerTouchpointAction(
  sellerId: string,
  touchpointType: string,
  sentiment: string | null,
  note: string | null,
): Promise<SellerActionState> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  try {
    const impact = TOUCHPOINT_IMPACTS[touchpointType] ?? { trust: 2, engagement: 2 };
    await sellerTouchpointRepository.insert({
      org_id: profile.org_id,
      seller_id: sellerId,
      touchpoint_type: touchpointType,
      direction: "outbound",
      title: TOUCHPOINT_LABELS[touchpointType] ?? touchpointType,
      description: note,
      sentiment,
      trust_impact: impact.trust,
      engagement_impact: impact.engagement,
      created_by_user_id: user.id,
    });
    const eventType = touchpointType === "report_sent" ? "seller.report_sent" : touchpointType === "report_opened" ? "seller.report_opened" : "seller.touchpoint_created";
    await logActivityEvent({
      eventType,
      entityType: "seller",
      entityId: sellerId,
      title: `מוכר: ${TOUCHPOINT_LABELS[touchpointType] ?? touchpointType}`,
      sentiment,
    });
    await recalculateSellerIntelligence(sellerId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[seller] touchpoint failed:", e);
    return { error: `תיעוד נקודת המגע נכשל: ${msg}` };
  }
  revalidate(sellerId);
  return {};
}

export async function createSellerCommitmentAction(
  sellerId: string,
  title: string,
  dueDate: string | null,
): Promise<SellerActionState> {
  if (!title.trim()) return { error: "נא להזין תיאור התחייבות." };
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  try {
    await sellerCommitmentRepository.insert({
      org_id: profile.org_id,
      seller_id: sellerId,
      title: title.trim(),
      due_date: dueDate,
      status: "open",
      created_by_user_id: user.id,
    });
    await logActivityEvent({ eventType: "seller.commitment_created", entityType: "seller", entityId: sellerId, title: `התחייבות חדשה: ${title.trim()}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `יצירת ההתחייבות נכשלה: ${msg}` };
  }
  revalidate(sellerId);
  return {};
}

export async function setSellerCommitmentStatusAction(
  sellerId: string,
  commitmentId: string,
  status: "fulfilled" | "broken",
): Promise<SellerActionState> {
  try {
    await sellerCommitmentRepository.setStatus(commitmentId, status);
    await logActivityEvent({
      eventType: status === "fulfilled" ? "seller.commitment_fulfilled" : "seller.commitment_broken",
      entityType: "seller",
      entityId: sellerId,
      title: status === "fulfilled" ? "התחייבות מולאה" : "התחייבות לא קוימה",
      sentiment: status === "fulfilled" ? "positive" : "negative",
    });
    await recalculateSellerIntelligence(sellerId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `עדכון ההתחייבות נכשל: ${msg}` };
  }
  revalidate(sellerId);
  return {};
}

export async function resolveSellerRiskAction(sellerId: string, riskId: string): Promise<SellerActionState> {
  try {
    await sellerRiskRepository.resolve(riskId);
    await recalculateSellerIntelligence(sellerId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `טיפול בסיכון נכשל: ${msg}` };
  }
  revalidate(sellerId);
  return {};
}

/** Turn a recommended action into a task linked to the seller. */
export async function sellerActionToTaskAction(sellerId: string, title: string): Promise<SellerActionState> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tasks").insert({
      org_id: profile.org_id,
      created_by: user.id,
      assignee_id: user.id,
      seller_id: sellerId,
      title,
      status: "todo",
      entity_type: "seller",
      entity_id: sellerId,
      intelligence_source: "seller_intelligence",
    });
    if (error) throw new Error(error.message);
    await logActivityEvent({ eventType: "task.created", entityType: "seller", entityId: sellerId, title: `נוצרה משימה: ${title}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `יצירת המשימה נכשלה: ${msg}` };
  }
  revalidate(sellerId);
  return {};
}
