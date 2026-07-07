"use server";

// ============================================================================
// ZONO — Distribution Center server actions. Every create/update/delete writes
// to Supabase through the org-scoped repository, then revalidates the center.
// Returns { error } on failure (UI shows a toast). No mock writes.
// ============================================================================
import { revalidatePath } from "next/cache";
import { distributionRepo } from "./repository";
import type { DistGroupStatus, DistCampaignStatus, DistLeadStatus } from "./db-types";

const PATH = "/distribution";
const ok = () => { revalidatePath(PATH); return {}; };
const fail = (msg: string) => ({ error: msg });

// ── Groups ───────────────────────────────────────────────────────────────────
export async function createGroupAction(input: { name: string; url?: string; city?: string; area?: string; category?: string; membersCount?: number; notes?: string; propertyType?: string }): Promise<{ error?: string }> {
  if (!input.name?.trim()) return fail("שם הקבוצה חסר");
  const row = await distributionRepo.createGroup(input);
  return row ? ok() : fail("יצירת הקבוצה נכשלה");
}
export async function updateGroupStatusAction(input: { id: string; status: DistGroupStatus }): Promise<{ error?: string }> {
  const done = await distributionRepo.updateGroup(input.id, { status: input.status });
  return done ? ok() : fail("עדכון הקבוצה נכשל");
}
export async function deleteGroupAction(input: { id: string }): Promise<{ error?: string }> {
  const done = await distributionRepo.deleteGroup(input.id);
  return done ? ok() : fail("מחיקת הקבוצה נכשלה");
}

// ── Campaigns (CREATE CAMPAIGN FLOW) ─────────────────────────────────────────
export async function createCampaignAction(input: { name: string; propertyId?: string; targetCity?: string; targetAudience?: string; campaignGoal?: string }): Promise<{ error?: string; campaignId?: string }> {
  if (!input.name?.trim()) return fail("שם הקמפיין חסר");
  const row = await distributionRepo.createCampaign(input);
  if (!row) return fail("יצירת הקמפיין נכשלה");
  revalidatePath(PATH);
  return { campaignId: row.id };
}
export async function updateCampaignStatusAction(input: { id: string; status: DistCampaignStatus }): Promise<{ error?: string }> {
  const done = await distributionRepo.updateCampaign(input.id, { status: input.status });
  return done ? ok() : fail("עדכון הקמפיין נכשל");
}
export async function deleteCampaignAction(input: { id: string }): Promise<{ error?: string }> {
  const done = await distributionRepo.deleteCampaign(input.id);
  return done ? ok() : fail("מחיקת הקמפיין נכשלה");
}

// ── Group selection (GROUP SELECTION FLOW) ───────────────────────────────────
export async function selectGroupsAction(input: { campaignId: string; groupIds: string[] }): Promise<{ error?: string; selected?: number }> {
  if (!input.campaignId) return fail("קמפיין חסר");
  const n = await distributionRepo.selectGroups(input.campaignId, input.groupIds);
  revalidatePath(PATH);
  return { selected: n };
}
export async function removeCampaignGroupAction(input: { campaignId: string; groupId: string }): Promise<{ error?: string }> {
  const done = await distributionRepo.removeCampaignGroup(input.campaignId, input.groupId);
  return done ? ok() : fail("הסרת הקבוצה נכשלה");
}

// ── Leads ────────────────────────────────────────────────────────────────────
export async function createLeadAction(input: { name?: string; phone?: string; source?: string; campaignId?: string; intentScore?: number; notes?: string }): Promise<{ error?: string }> {
  const row = await distributionRepo.createLead(input);
  return row ? ok() : fail("יצירת הליד נכשלה");
}
export async function updateLeadStatusAction(input: { id: string; status: DistLeadStatus; notes?: string }): Promise<{ error?: string }> {
  const done = await distributionRepo.updateLead(input.id, { status: input.status, notes: input.notes });
  return done ? ok() : fail("עדכון הליד נכשל");
}

// ── Automations ──────────────────────────────────────────────────────────────
export async function createAutomationAction(input: { name: string; automationType: string; campaignId?: string }): Promise<{ error?: string }> {
  if (!input.name?.trim()) return fail("שם האוטומציה חסר");
  const row = await distributionRepo.createAutomation(input);
  return row ? ok() : fail("יצירת האוטומציה נכשלה");
}
export async function toggleAutomationAction(input: { id: string; enabled: boolean }): Promise<{ error?: string }> {
  const done = await distributionRepo.toggleAutomation(input.id, input.enabled);
  return done ? ok() : fail("עדכון האוטומציה נכשל");
}
