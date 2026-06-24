"use server";
// ============================================================================
// ZONO — Facebook Groups Distribution Engine — server actions.
// ============================================================================
import { revalidatePath } from "next/cache";
import {
  getGroupRegistry, addGroup, recomputeGroupScores, recommendGroups,
  recordGroupPost, recordGroupLead, getGroupsAnalytics,
  type GroupRow, type AddGroupInput, type PropertyGroupReco, type GroupsAnalytics,
  type RecordPostInput, type RecordLeadInput,
} from "./groups-service";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : "אירעה שגיאה." });

export async function getGroupRegistryAction(): Promise<Result<GroupRow[]>> {
  try { return { ok: true, data: await getGroupRegistry() }; } catch (e) { return fail(e); }
}
export async function getGroupsAnalyticsAction(): Promise<Result<GroupsAnalytics>> {
  try { return { ok: true, data: await getGroupsAnalytics() }; } catch (e) { return fail(e); }
}
export async function addGroupAction(input: AddGroupInput): Promise<Result<{ id: string }>> {
  try { const d = await addGroup(input); revalidatePath("/distribution/groups"); return { ok: true, data: d }; } catch (e) { return fail(e); }
}
export async function recomputeGroupScoresAction(): Promise<Result<{ groups: number }>> {
  try { const d = await recomputeGroupScores(); revalidatePath("/distribution/groups"); return { ok: true, data: d }; } catch (e) { return fail(e); }
}
export async function recommendGroupsAction(propertyId: string): Promise<Result<PropertyGroupReco>> {
  try { return { ok: true, data: await recommendGroups(propertyId) }; } catch (e) { return fail(e); }
}
export async function recordGroupPostAction(input: RecordPostInput): Promise<Result<{ id: string; duplicate: boolean; warnings: string[] }>> {
  try { const d = await recordGroupPost(input); revalidatePath("/distribution/groups"); return { ok: true, data: d }; } catch (e) { return fail(e); }
}
export async function recordGroupLeadAction(input: RecordLeadInput): Promise<Result<{ id: string }>> {
  try { const d = await recordGroupLead(input); revalidatePath("/distribution/groups"); return { ok: true, data: d }; } catch (e) { return fail(e); }
}
