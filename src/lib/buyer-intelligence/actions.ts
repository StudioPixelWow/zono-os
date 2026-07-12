"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { createRelationship, logActivityEvent } from "@/lib/activity/service";
import { RELATIONSHIP_TYPES } from "@/lib/activity/types";
import {
  initializeBuyerIntelligence,
  recalculateBuyerIntelligence,
} from "./service";
import {
  buyerCommitmentRepository,
  buyerObjectionRepository,
  buyerRiskRepository,
  buyerTouchpointRepository,
} from "./repository";
import {
  TOUCHPOINT_IMPACTS,
  TOUCHPOINT_LABELS,
} from "./playbook";

export interface BuyerIntelActionState {
  error?: string;
}
const revalidate = (id: string) => {
  revalidatePath(`/buyers/${id}`);
  revalidatePath("/buyers");
};

export async function initializeBuyerIntelligenceAction(buyerId: string): Promise<BuyerIntelActionState> {
  try {
    await initializeBuyerIntelligence(buyerId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[buyer-intel] init failed:", e);
    return { error: `הפעלת מודיעין קונה נכשלה: ${msg}` };
  }
  revalidate(buyerId);
  return {};
}

export async function recalcBuyerIntelligenceAction(buyerId: string): Promise<BuyerIntelActionState> {
  try {
    await recalculateBuyerIntelligence(buyerId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `חישוב מחדש נכשל: ${msg}` };
  }
  revalidate(buyerId);
  return {};
}

/**
 * ⚠️ RETIRED — Batch 5.5 (Part 7).
 *
 * setBuyerStageAction() moved a buyer by writing buyer_intelligence_profiles.current_stage
 * and logging a timeline row. It never emitted a DOMAIN event, so the kernel's journey
 * subscriber never saw it and the canonical buyer journey never moved — the buyer's
 * lifecycle lived in an intelligence table while the spine sat still. That is the same
 * two-lifecycles defect 5.5E removed from the property cockpit.
 *
 * THE REPLACEMENT: requestEntityStageAction("buyer", id, stage) — lib/journey-cockpit/actions.
 * It emits `buyer.stage_changed`, which the subscriber (which has ALWAYS had a case for it)
 * projects into a canonical transition through buildTransition().
 *
 * buyer_intelligence_profiles.current_stage remains as INTELLIGENCE input — it is no longer
 * written from the cockpit, and it is no longer displayed as the buyer's lifecycle.
 */

export async function logBuyerTouchpointAction(
  buyerId: string,
  touchpointType: string,
  sentiment: string | null,
  note: string | null,
): Promise<BuyerIntelActionState> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  try {
    const impact = TOUCHPOINT_IMPACTS[touchpointType] ?? { trust: 2, engagement: 2 };
    await buyerTouchpointRepository.insert({
      org_id: profile.org_id, buyer_id: buyerId, touchpoint_type: touchpointType, direction: "outbound",
      title: TOUCHPOINT_LABELS[touchpointType] ?? touchpointType, description: note, sentiment,
      trust_impact: impact.trust, engagement_impact: impact.engagement, created_by_user_id: user.id,
    });
    await logActivityEvent({ eventType: "buyer.touchpoint_created", entityType: "buyer", entityId: buyerId, title: `קונה: ${TOUCHPOINT_LABELS[touchpointType] ?? touchpointType}`, sentiment });
    await recalculateBuyerIntelligence(buyerId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `תיעוד נקודת המגע נכשל: ${msg}` };
  }
  revalidate(buyerId);
  return {};
}

/** Record a buyer↔property interaction (viewed / liked / rejected / visited). */
export async function logBuyerPropertyInteractionAction(
  buyerId: string,
  propertyId: string,
  kind: "viewed" | "liked" | "rejected" | "visited",
): Promise<BuyerIntelActionState> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  const relType = kind === "viewed" ? RELATIONSHIP_TYPES.buyerViewedProperty : kind === "liked" ? RELATIONSHIP_TYPES.buyerLikedProperty : kind === "rejected" ? RELATIONSHIP_TYPES.buyerRejectedProperty : RELATIONSHIP_TYPES.buyerVisitedProperty;
  const eventType = kind === "viewed" ? "buyer.property_viewed" : kind === "liked" ? "buyer.property_liked" : kind === "rejected" ? "buyer.property_rejected" : "buyer.visit_completed";
  const tpType = kind === "visited" ? "property_visit" : kind === "viewed" ? "property_viewed" : null;
  try {
    await createRelationship({ sourceType: "buyer", sourceId: buyerId, targetType: "property", targetId: propertyId, relationshipType: relType, strengthScore: kind === "visited" ? 80 : kind === "liked" ? 60 : kind === "rejected" ? 10 : 40 });
    if (tpType) {
      const impact = TOUCHPOINT_IMPACTS[tpType] ?? { trust: 1, engagement: 6 };
      await buyerTouchpointRepository.insert({ org_id: profile.org_id, buyer_id: buyerId, property_id: propertyId, touchpoint_type: tpType, direction: "inbound", title: TOUCHPOINT_LABELS[tpType] ?? tpType, trust_impact: impact.trust, engagement_impact: impact.engagement, created_by_user_id: user.id });
    }
    await logActivityEvent({ eventType, entityType: "buyer", entityId: buyerId, relatedEntityType: "property", relatedEntityId: propertyId, title: `קונה ${kind === "liked" ? "אהב" : kind === "rejected" ? "דחה" : kind === "visited" ? "ביקר ב" : "צפה ב"}נכס` });
    await recalculateBuyerIntelligence(buyerId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `תיעוד האינטראקציה נכשל: ${msg}` };
  }
  revalidate(buyerId);
  return {};
}

export async function createBuyerCommitmentAction(buyerId: string, title: string, dueDate: string | null): Promise<BuyerIntelActionState> {
  if (!title.trim()) return { error: "נא להזין תיאור התחייבות." };
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  try {
    await buyerCommitmentRepository.insert({ org_id: profile.org_id, buyer_id: buyerId, title: title.trim(), due_date: dueDate, status: "open", created_by_user_id: user.id });
    await logActivityEvent({ eventType: "buyer.commitment_created", entityType: "buyer", entityId: buyerId, title: `התחייבות חדשה: ${title.trim()}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `יצירת ההתחייבות נכשלה: ${msg}` };
  }
  revalidate(buyerId);
  return {};
}

export async function setBuyerCommitmentStatusAction(buyerId: string, commitmentId: string, status: "fulfilled" | "broken"): Promise<BuyerIntelActionState> {
  try {
    await buyerCommitmentRepository.setStatus(commitmentId, status);
    await logActivityEvent({ eventType: "buyer.commitment_completed", entityType: "buyer", entityId: buyerId, title: status === "fulfilled" ? "התחייבות מולאה" : "התחייבות לא קוימה", sentiment: status === "fulfilled" ? "positive" : "negative" });
    await recalculateBuyerIntelligence(buyerId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `עדכון ההתחייבות נכשל: ${msg}` };
  }
  revalidate(buyerId);
  return {};
}

export async function addBuyerObjectionAction(buyerId: string, objectionType: string, note: string | null): Promise<BuyerIntelActionState> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  try {
    await buyerObjectionRepository.insert({ org_id: profile.org_id, buyer_id: buyerId, objection_type: objectionType, description: note, resolved: false, created_by_user_id: user.id });
    await logActivityEvent({ eventType: "buyer.touchpoint_created", entityType: "buyer", entityId: buyerId, title: "תועדה התנגדות", sentiment: "negative" });
    await recalculateBuyerIntelligence(buyerId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `תיעוד ההתנגדות נכשל: ${msg}` };
  }
  revalidate(buyerId);
  return {};
}

export async function resolveBuyerObjectionAction(buyerId: string, objectionId: string): Promise<BuyerIntelActionState> {
  try {
    await buyerObjectionRepository.resolve(objectionId);
    await recalculateBuyerIntelligence(buyerId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `טיפול בהתנגדות נכשל: ${msg}` };
  }
  revalidate(buyerId);
  return {};
}

export async function resolveBuyerRiskAction(buyerId: string, riskId: string): Promise<BuyerIntelActionState> {
  try {
    await buyerRiskRepository.resolve(riskId);
    await recalculateBuyerIntelligence(buyerId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `טיפול בסיכון נכשל: ${msg}` };
  }
  revalidate(buyerId);
  return {};
}

export async function buyerActionToTaskAction(buyerId: string, title: string): Promise<BuyerIntelActionState> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tasks").insert({
      org_id: profile.org_id, created_by: user.id, assignee_id: user.id, buyer_id: buyerId, title, status: "todo",
      entity_type: "buyer", entity_id: buyerId, intelligence_source: "buyer_intelligence",
    });
    if (error) throw new Error(error.message);
    await logActivityEvent({ eventType: "task.created", entityType: "buyer", entityId: buyerId, title: `נוצרה משימה: ${title}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `יצירת המשימה נכשלה: ${msg}` };
  }
  revalidate(buyerId);
  return {};
}
