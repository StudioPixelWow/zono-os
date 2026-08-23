"use server";
// ============================================================================
// ZONO — People directory actions (real, persisted, audited).
// ----------------------------------------------------------------------------
// Assigning a person to an agent re-points owner_id on every underlying role
// record (buyer/seller/lead) belonging to that person. Each write goes through
// the manager-gated, org-scoped repository; the whole operation is recorded in
// audit_log and the /people route is revalidated so the UI reflects real
// persisted state after router.refresh(). No optimistic-only / client state.
// ============================================================================
import { revalidatePath } from "next/cache";
import { setContactOwner, type ContactRole } from "./repository";
import { logAudit } from "@/lib/audit/service";

export interface PeopleActionState { ok?: boolean; error?: string }
export interface PeopleBulkResult { ok: boolean; updated: number; failed: number; errors: string[] }

export interface AssignTarget { type: ContactRole; id: string }

function revalidate() { revalidatePath("/people"); }

/** Assign one person (all their role records) to an agent, or clear (null). */
export async function assignPersonOwnerAction(targets: AssignTarget[], agentUserId: string | null): Promise<PeopleActionState> {
  try {
    if (!targets.length) return { error: "אין רשומות לשיוך" };
    const errors: string[] = [];
    for (const t of targets.slice(0, 50)) {
      try { await setContactOwner(t.type, t.id, agentUserId); }
      catch (e) { errors.push(e instanceof Error ? e.message : "שגיאה"); }
    }
    await logAudit({
      action: agentUserId ? "person.owner_assigned" : "person.owner_cleared",
      category: "assignment", entityType: "person",
      summary: agentUserId ? `איש קשר שויך לסוכן (${targets.length} רשומות)` : `שיוך הסוכן הוסר (${targets.length} רשומות)`,
      metadata: { targets: targets.slice(0, 50), agentUserId },
    });
    revalidate();
    if (errors.length) return { error: [...new Set(errors)][0] };
    return { ok: true };
  } catch (e) { return { error: e instanceof Error ? e.message : "שיוך נכשל" }; }
}

/** Bulk assign many people at once. Each person is independent; a single
 *  failure never aborts the batch. Returns updated/failed people counts. */
export async function bulkAssignPeopleOwnerAction(people: AssignTarget[][], agentUserId: string | null): Promise<PeopleBulkResult> {
  const errors: string[] = [];
  let updated = 0;
  let failed = 0;
  for (const targets of people.slice(0, 200)) {
    let personFailed = false;
    for (const t of targets.slice(0, 50)) {
      try { await setContactOwner(t.type, t.id, agentUserId); }
      catch (e) { personFailed = true; errors.push(e instanceof Error ? e.message : "שגיאה"); }
    }
    if (personFailed) failed++; else updated++;
  }
  try {
    await logAudit({
      action: "person.bulk_owner_assigned", category: "assignment", entityType: "person",
      summary: `שיוך קבוצתי של ${updated} אנשים לסוכן${failed ? ` (${failed} נכשלו)` : ""}`,
      metadata: { agentUserId, updated, failed, count: people.length },
    });
  } catch { /* audit best-effort */ }
  revalidate();
  return { ok: failed === 0, updated, failed, errors: [...new Set(errors)].slice(0, 5) };
}
