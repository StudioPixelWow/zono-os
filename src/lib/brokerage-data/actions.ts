"use server";
// ============================================================================
// ZONO Core Data — Brokerage Data server actions. Reads are RLS-scoped; owner-
// only management actions are gated via requireOwner().
// ============================================================================
import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import { requireOwner } from "./permissions";
import {
  getBrokerageCommandCenter, resolveBrokerageLinksForOrg, reviewIdentityMatch,
  resolveDataConflict, decideListingLink, recordRefreshRequest,
  type BrokerageCommandCenter, type ResolveStats,
} from "./service";

export async function getBrokerageCommandCenterAction(opts: { city?: string | null; search?: string | null } = {}): Promise<BrokerageCommandCenter | null> {
  try { return await getBrokerageCommandCenter(opts); }
  catch (e) { console.error("[brokerage-data] command center failed:", e); return null; }
}

export interface BrokerageActionState { error?: string; message?: string; stats?: ResolveStats }

/** Run Broker Identity Resolution across the org's external listings now. */
export async function resolveBrokerageNowAction(): Promise<BrokerageActionState> {
  try {
    await requireOwner();
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return { error: "not authenticated" };
    const stats = await resolveBrokerageLinksForOrg(profile.org_id);
    revalidatePath("/brokerage-data");
    return {
      stats,
      message: `זוהו ${stats.linked} קישורים אוטומטיים · ${stats.review} לבדיקה · ${stats.candidates} מועמדים (מתוך ${stats.scanned} מודעות).`,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה בזיהוי" };
  }
}

export async function requestBrokerageRefreshAction(params: Record<string, unknown>): Promise<BrokerageActionState> {
  try {
    await requireOwner();
    await recordRefreshRequest(params);
    revalidatePath("/brokerage-data");
    return { message: "בקשת רענון נרשמה ✓" };
  } catch (e) { return { error: e instanceof Error ? e.message : "שגיאה" }; }
}

export async function reviewMatchAction(matchId: string, decision: "approve" | "reject"): Promise<BrokerageActionState> {
  try {
    await requireOwner();
    await reviewIdentityMatch(matchId, decision);
    revalidatePath("/brokerage-data");
    return { message: decision === "approve" ? "ההתאמה אושרה ✓" : "ההתאמה נדחתה" };
  } catch (e) { return { error: e instanceof Error ? e.message : "שגיאה" }; }
}

export async function resolveConflictAction(conflictId: string, resolution: "resolved" | "ignored"): Promise<BrokerageActionState> {
  try {
    await requireOwner();
    await resolveDataConflict(conflictId, resolution);
    revalidatePath("/brokerage-data");
    return { message: resolution === "resolved" ? "הקונפליקט נפתר ✓" : "הקונפליקט הוסתר" };
  } catch (e) { return { error: e instanceof Error ? e.message : "שגיאה" }; }
}

export async function decideLinkAction(linkId: string, decision: "confirmed" | "rejected"): Promise<BrokerageActionState> {
  try {
    await requireOwner();
    await decideListingLink(linkId, decision);
    revalidatePath("/brokerage-data");
    return { message: decision === "confirmed" ? "הקישור אושר ✓" : "הקישור נדחה" };
  } catch (e) { return { error: e instanceof Error ? e.message : "שגיאה" }; }
}
