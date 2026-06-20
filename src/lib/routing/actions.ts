"use server";

import { revalidatePath } from "next/cache";
import { assignLead, recomputeAgentTwinsForOrg, routeUnassignedLeads } from "./service";
import { initializeOrganizationDecisionBrain } from "@/lib/decision-intelligence/service";

export interface RoutingActionState { error?: string; ok?: boolean; message?: string }

function revalidate() { revalidatePath("/routing"); revalidatePath("/command"); }

export async function recomputeRoutingAction(): Promise<RoutingActionState> {
  try {
    const t = await recomputeAgentTwinsForOrg();
    const r = await routeUnassignedLeads();
    try { await initializeOrganizationDecisionBrain(); } catch (e) { console.error("[routing] decision recalc failed:", e); }
    revalidate();
    return { ok: true, message: `${t.agents} סוכנים · ${r.routed} לידים נותבו` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "חישוב הניתוב נכשל" };
  }
}

export async function assignLeadAction(leadId: string, agentId: string): Promise<RoutingActionState> {
  try { await assignLead(leadId, agentId); revalidate(); return { ok: true, message: "הליד הוקצה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "ההקצאה נכשלה" }; }
}
