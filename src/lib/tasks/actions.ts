"use server";

import { revalidatePath } from "next/cache";
import type { TaskPriority, TaskStatus } from "@/lib/supabase/types";
import { createPropertyTask, setTaskStatus } from "./repository";

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
