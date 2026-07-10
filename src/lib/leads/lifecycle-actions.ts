"use server";
// ============================================================================
// 📇 ZONO OS 2.0 — Stage 0.5 · Lead lifecycle + conversion actions.
// Thin approval-gated adapters over the canonical lead service. Each revalidates
// the lead surfaces (and buyers/sellers on conversion).
// ============================================================================
import { revalidatePath } from "next/cache";
import {
  setLeadStage, setLeadScore, assignLead, markLeadContacted, markLeadLost, convertLead,
  type LeadStage, type LeadResult, type ConvertLeadInput,
} from "./service";

function revalidateLead(leadId: string) {
  revalidatePath("/leads");
  revalidatePath(`/leads/${leadId}`);
}

export async function setLeadStageAction(leadId: string, stage: LeadStage): Promise<LeadResult> {
  const r = await setLeadStage(leadId, stage);
  if (r.ok) revalidateLead(leadId);
  return r;
}
export async function setLeadScoreAction(leadId: string, score: number): Promise<LeadResult> {
  const r = await setLeadScore(leadId, score);
  if (r.ok) revalidateLead(leadId);
  return r;
}
export async function assignLeadAction(leadId: string, ownerId: string): Promise<LeadResult> {
  const r = await assignLead(leadId, ownerId);
  if (r.ok) revalidateLead(leadId);
  return r;
}
export async function markLeadContactedAction(leadId: string): Promise<LeadResult> {
  const r = await markLeadContacted(leadId);
  if (r.ok) revalidateLead(leadId);
  return r;
}
export async function markLeadLostAction(leadId: string, reason?: string | null): Promise<LeadResult> {
  const r = await markLeadLost(leadId, reason);
  if (r.ok) revalidateLead(leadId);
  return r;
}
export async function convertLeadAction(leadId: string, input?: ConvertLeadInput): Promise<LeadResult> {
  const r = await convertLead(leadId, input ?? {});
  if (r.ok) { revalidateLead(leadId); revalidatePath("/buyers"); revalidatePath("/sellers"); }
  return r;
}
