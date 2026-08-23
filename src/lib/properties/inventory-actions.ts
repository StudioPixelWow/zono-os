"use server";
// ============================================================================
// ZONO — Properties inventory ROW + BULK actions (real, persisted, audited).
// Every action mutates the canonical DB via the org-scoped, role-gated repository
// writers, records an audit_log entry, and revalidates the inventory route. No
// optimistic-only / client-only state: the UI reflects real persisted data after
// router.refresh(). Manager-gating on reassignment mirrors the office board.
// ============================================================================
import { revalidatePath } from "next/cache";
import { setPropertyStatus, archiveProperty, assignPropertyAgent } from "./repository";
import { logAudit } from "@/lib/audit/service";
import { PROPERTY_STATUS_LABELS } from "./labels";
import type { PropertyStatus } from "@/lib/supabase/types";

export interface InventoryActionState { ok?: boolean; error?: string }
export interface BulkResult { ok: boolean; updated: number; failed: number; errors: string[] }

function revalidate() {
  revalidatePath("/my-properties");
  revalidatePath("/office-inventory");
}

export async function setPropertyStatusInlineAction(id: string, status: PropertyStatus): Promise<InventoryActionState> {
  try {
    await setPropertyStatus(id, status);
    await logAudit({ action: "property.status_changed", category: "configuration", entityType: "property", entityId: id, summary: `סטטוס נכס עודכן ל"${PROPERTY_STATUS_LABELS[status] ?? status}"`, metadata: { status } });
    revalidate();
    return { ok: true };
  } catch (e) { return { error: e instanceof Error ? e.message : "עדכון הסטטוס נכשל" }; }
}

export async function archivePropertyInlineAction(id: string): Promise<InventoryActionState> {
  try {
    await archiveProperty(id);
    await logAudit({ action: "property.archived", category: "configuration", entityType: "property", entityId: id, summary: "נכס הועבר לארכיון" });
    revalidate();
    return { ok: true };
  } catch (e) { return { error: e instanceof Error ? e.message : "העברה לארכיון נכשלה" }; }
}

export async function assignPropertyAgentAction(id: string, agentUserId: string | null): Promise<InventoryActionState> {
  try {
    await assignPropertyAgent(id, agentUserId);
    await logAudit({ action: agentUserId ? "property.agent_assigned" : "property.agent_unassigned", category: "assignment", entityType: "property", entityId: id, summary: agentUserId ? "נכס שויך לסוכן" : "שיוך הסוכן הוסר", metadata: { agentUserId } });
    revalidate();
    return { ok: true };
  } catch (e) { return { error: e instanceof Error ? e.message : "שיוך הסוכן נכשל" }; }
}

/** Bulk apply one operation to many properties. Each item is independent — a
 *  single failure never aborts the batch; the caller sees updated/failed counts. */
export async function bulkPropertyAction(
  ids: string[],
  op: { kind: "status"; status: PropertyStatus } | { kind: "archive" } | { kind: "assign"; agentUserId: string | null },
): Promise<BulkResult> {
  const errors: string[] = [];
  let updated = 0;
  for (const id of ids.slice(0, 200)) {
    try {
      if (op.kind === "status") await setPropertyStatus(id, op.status);
      else if (op.kind === "archive") await archiveProperty(id);
      else await assignPropertyAgent(id, op.agentUserId);
      updated++;
    } catch (e) { errors.push(e instanceof Error ? e.message : "שגיאה"); }
  }
  const failed = Math.min(ids.length, 200) - updated;
  try {
    await logAudit({
      action: `property.bulk_${op.kind}`, category: op.kind === "assign" ? "assignment" : "configuration",
      entityType: "property", summary: `פעולה קבוצתית על ${updated} נכסים${failed ? ` (${failed} נכשלו)` : ""}`,
      metadata: { op, updated, failed, ids: ids.slice(0, 200) },
    });
  } catch { /* audit best-effort */ }
  revalidate();
  return { ok: failed === 0, updated, failed, errors: [...new Set(errors)].slice(0, 5) };
}
