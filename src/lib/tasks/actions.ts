"use server";

import { revalidatePath } from "next/cache";
import type { TaskPriority, TaskStatus } from "@/lib/supabase/types";
import { createPropertyTask, setTaskStatus } from "./repository";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

// ── Generic task creation (Command Center quick action) ───────────────────────
// Generalizes createPropertyTask over the shared `tasks` table: optional single
// related-entity ref, session org/owner scope, no workflow auto-creation.
export const TASK_PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"] as const;
export type TaskEntityKind = "property" | "buyer" | "seller" | "lead" | "deal";

export interface NewTaskInput {
  title: string;
  dueAt?: string | null;         // ISO, or null for "no date"
  priority?: string;             // low|medium|high|urgent
  entity?: { kind: TaskEntityKind; id: string } | null;
  assigneeId?: string | null;
  notes?: string | null;
}

export async function createTaskAction(input: NewTaskInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) return { ok: false, error: "אין הרשאה — התחבר מחדש." };
  const title = input.title?.trim();
  if (!title) return { ok: false, error: "יש להזין כותרת למשימה." };

  const priority = (TASK_PRIORITY_OPTIONS as readonly string[]).includes(input.priority ?? "") ? input.priority : "medium";
  const payload: Record<string, unknown> = {
    org_id: profile.org_id,
    created_by: user.id,
    assignee_id: input.assigneeId || user.id,
    title,
    description: input.notes?.trim() || null,
    priority,
    due_at: input.dueAt || null,
    status: "todo",
  };
  if (input.entity) payload[`${input.entity.kind}_id`] = input.entity.id; // property_id/buyer_id/seller_id/lead_id/deal_id

  const db = await createClient();
  const { data, error } = await db.from("tasks").insert(payload as never).select("id").single();
  if (error || !data) return { ok: false, error: error?.message ?? "יצירת המשימה נכשלה." };
  try { revalidatePath("/today"); } catch { /* noop */ }
  return { ok: true, id: (data as { id: string }).id };
}

export interface TaskActionState {
  error?: string;
}

export async function createPropertyTaskAction(
  propertyId: string,
  title: string,
  dueAt: string | null,
  priority: TaskPriority,
): Promise<TaskActionState> {
  if (!title.trim()) return { error: "נא להזין כותרת למשימה." };
  try {
    await createPropertyTask(propertyId, { title, dueAt, priority });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[tasks] create failed:", e);
    return { error: `יצירת המשימה נכשלה: ${msg}` };
  }
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/properties");
  return {};
}

export async function setTaskStatusAction(
  propertyId: string,
  taskId: string,
  status: TaskStatus,
): Promise<TaskActionState> {
  try {
    await setTaskStatus(taskId, status);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "שגיאה לא ידועה";
    console.error("[tasks] status update failed:", e);
    return { error: `עדכון המשימה נכשל: ${msg}` };
  }
  revalidatePath(`/properties/${propertyId}`);
  revalidatePath("/properties");
  return {};
}
