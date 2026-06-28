"use server";
// ============================================================================
// ZONO Brokerage Knowledge — server actions. Reads are RLS-scoped; the recompute
// + discovery review are owner-gated. Graph explorer fetch is read-only.
// ============================================================================
import { revalidatePath } from "next/cache";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { requireOwner } from "../permissions";
import { recomputeBrokerageKnowledge, getKnowledgeDashboard, type KnowledgeDashboard, type KnowledgeRefreshResult } from "./service";
import { knowledgeRepository } from "./repository";

export async function getKnowledgeDashboardAction(): Promise<KnowledgeDashboard | null> {
  try { return await getKnowledgeDashboard(); }
  catch (e) { console.error("[knowledge] dashboard failed:", e); return null; }
}

export async function getGraphAroundAction(entityType: "office" | "agent", entityId: string) {
  try { return await knowledgeRepository.graphAround(entityType, entityId); }
  catch (e) { console.error("[knowledge] graph fetch failed:", e); return { nodes: [], edges: [] }; }
}

export interface KnowledgeActionState { error?: string; message?: string; result?: KnowledgeRefreshResult }

/** Owner — recompute the whole knowledge layer now. */
export async function recomputeKnowledgeAction(): Promise<KnowledgeActionState> {
  try {
    await requireOwner();
    const result = await recomputeBrokerageKnowledge();
    revalidatePath("/brokerage-data");
    return { result, message: `ידע חושב מחדש: ${result.completenessRows} שלמות · ${result.clusters} אשכולות · ${result.marketRows} נתח שוק · ${result.discoveries} גילויים · בריאות ${result.healthScore}% (${result.ms}ms).` };
  } catch (e) { return { error: e instanceof Error ? e.message : "שגיאה בחישוב הידע" }; }
}

/** Owner — accept / dismiss a discovery, or a duplicate cluster decision. */
export async function reviewDiscoveryAction(id: string, decision: "accepted" | "dismissed"): Promise<KnowledgeActionState> {
  try {
    await requireOwner();
    const db = createServiceRoleClient();
    await db.from("brokerage_relationship_discoveries" as never).update({ status: decision, reviewed_at: new Date().toISOString() } as never).eq("id", id);
    revalidatePath("/brokerage-data");
    return { message: decision === "accepted" ? "הגילוי אומץ ✓" : "הגילוי נדחה" };
  } catch (e) { return { error: e instanceof Error ? e.message : "שגיאה" }; }
}

export async function resolveClusterAction(id: string, decision: "merged" | "dismissed"): Promise<KnowledgeActionState> {
  try {
    await requireOwner();
    const db = createServiceRoleClient();
    await db.from("brokerage_duplicate_clusters" as never).update({ status: decision, updated_at: new Date().toISOString() } as never).eq("id", id);
    revalidatePath("/brokerage-data");
    return { message: decision === "merged" ? "האשכול סומן כממוזג ✓" : "האשכול נדחה" };
  } catch (e) { return { error: e instanceof Error ? e.message : "שגיאה" }; }
}
