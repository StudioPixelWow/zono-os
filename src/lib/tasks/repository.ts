/**
 * Property Tasks repository — RLS-scoped task management linked to a property.
 *
 * Reuses the existing public.tasks table (property_id FK). Creating/closing a
 * task touches the property journey's last-activity timestamp and logs an
 * activity, so task work counts toward keeping a property "fresh".
 *
 * Server-only.
 */
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import type { Database, TaskPriority, TaskStatus } from "@/lib/supabase/types";
import { touchJourney } from "@/lib/journey/repository";
import { logTaskCompleted, logTaskCreated } from "@/lib/activity/service";

export type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];

export interface NewTaskInput {
  title: string;
  dueAt?: string | null;
  priority?: TaskPriority;
}

/** Open tasks first, then by due date, then newest. */
export async function listPropertyTasks(propertyId: string): Promise<TaskRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("property_id", propertyId)
    .order("completed_at", { ascending: true, nullsFirst: true })
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(100);
  return data ?? [];
}

export async function createPropertyTask(
  propertyId: string,
  input: NewTaskInput,
): Promise<TaskRow> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("not authenticated");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      org_id: profile.org_id,
      created_by: user.id,
      assignee_id: user.id,
      property_id: propertyId,
      title: input.title.trim(),
      priority: input.priority ?? "medium",
      due_at: input.dueAt || null,
      status: "todo",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  await supabase.from("activities").insert({
    org_id: profile.org_id,
    actor_id: user.id,
    type: "task",
    direction: "internal",
    subject: `משימה חדשה: ${input.title.trim()}`,
    property_id: propertyId,
    occurred_at: new Date().toISOString(),
  });
  await touchJourney(propertyId);
  await logTaskCreated(data);
  return data;
}

export async function setTaskStatus(
  taskId: string,
  status: TaskStatus,
): Promise<void> {
  const supabase = await createClient();
  const done = status === "done";
  const { data, error } = await supabase
    .from("tasks")
    .update({ status, completed_at: done ? new Date().toISOString() : null })
    .eq("id", taskId)
    .select("id,title,property_id,buyer_id,seller_id")
    .single();
  if (error) throw new Error(error.message);
  if (data?.property_id) await touchJourney(data.property_id);
  if (done && data) await logTaskCompleted(data);
}
