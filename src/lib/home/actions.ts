"use server";
// ============================================================================
// ZONO — Home control-center server actions. Toggling a task's done state from
// the compact "today's tasks" card. Reuses the canonical setTaskStatus (which
// touches the property journey + logs activity) and revalidates the home route.
// ============================================================================
import { revalidatePath } from "next/cache";
import { setTaskStatus } from "@/lib/tasks/repository";

export async function setHomeTaskDoneAction(taskId: string, done: boolean): Promise<{ ok: boolean; error?: string }> {
  try {
    await setTaskStatus(taskId, done ? "done" : "todo");
    revalidatePath("/");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "שגיאה" };
  }
}
