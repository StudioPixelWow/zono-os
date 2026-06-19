"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { logActivityEvent } from "@/lib/activity/service";
import { generateMatchesForOrg } from "./service";
import {
  matchIntelligenceRepository,
  matchObjectionRepository,
  matchRiskRepository,
} from "./repository";
import { STAGE_LABELS, type MatchStage } from "./playbook";

export interface MatchActionState {
  error?: string;
}
const revalidate = (id?: string) => {
  revalidatePath("/matches");
  revalidatePath("/command");
  if (id) revalidatePath(`/matches/${id}`);
};

const STAGE_EVENT: Record<string, string> = {
  recommended: "match.recommended",
  file_sent: "match.file_sent",
  visit_scheduled: "match.visit_scheduled",
  visit_completed: "match.visit_completed",
  feedback_received: "match.feedback_received",
  negotiation: "match.negotiation_started",
  offer_submitted: "match.offer_created",
  contract: "match.contract_created",
  closed: "match.closed",
  lost: "match.lost",
};

export async function recalcMatchesAction(): Promise<MatchActionState> {
  try {
    await generateMatchesForOrg();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[matching] recalc failed:", e);
    return { error: `חישוב ההתאמות נכשל: ${msg}` };
  }
  revalidate();
  return {};
}

export async function setMatchStageAction(matchId: string, stage: MatchStage): Promise<MatchActionState> {
  try {
    await matchIntelligenceRepository.update(matchId, { match_stage: stage, match_status: stage === "lost" ? "lost" : stage === "closed" ? "won" : "active" });
    await logActivityEvent({ eventType: STAGE_EVENT[stage] ?? "match.score_changed", entityType: "match", entityId: matchId, title: `שלב ההתאמה: ${STAGE_LABELS[stage]}`, status: stage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `עדכון השלב נכשל: ${msg}` };
  }
  revalidate(matchId);
  return {};
}

export async function resolveMatchRiskAction(matchId: string, riskId: string): Promise<MatchActionState> {
  try {
    await matchRiskRepository.resolve(riskId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `טיפול בסיכון נכשל: ${msg}` };
  }
  revalidate(matchId);
  return {};
}

export async function addMatchObjectionAction(matchId: string, objectionType: string, note: string | null): Promise<MatchActionState> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  try {
    await matchObjectionRepository.insert({ org_id: profile.org_id, match_id: matchId, objection_type: objectionType, description: note, resolved: false, created_by_user_id: user.id });
    await logActivityEvent({ eventType: "match.score_changed", entityType: "match", entityId: matchId, title: "תועדה התנגדות בעסקה", sentiment: "negative" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `תיעוד ההתנגדות נכשל: ${msg}` };
  }
  revalidate(matchId);
  return {};
}

export async function resolveMatchObjectionAction(matchId: string, objectionId: string, action: string | null): Promise<MatchActionState> {
  try {
    await matchObjectionRepository.resolve(objectionId, action);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `טיפול בהתנגדות נכשל: ${msg}` };
  }
  revalidate(matchId);
  return {};
}

/** Turn a deal action into a task (suggest-only autonomy). */
export async function matchActionToTaskAction(matchId: string, buyerId: string, propertyId: string, title: string): Promise<MatchActionState> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) return { error: "לא מחובר/ת." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("tasks").insert({
      org_id: profile.org_id, created_by: user.id, assignee_id: user.id, buyer_id: buyerId, property_id: propertyId,
      title, status: "todo", entity_type: "match", entity_id: matchId, intelligence_source: "matching_intelligence",
    });
    if (error) throw new Error(error.message);
    await logActivityEvent({ eventType: "task.created", entityType: "match", entityId: matchId, title: `נוצרה משימה: ${title}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    return { error: `יצירת המשימה נכשלה: ${msg}` };
  }
  revalidate(matchId);
  return {};
}
