// ============================================================================
// ZONO — Home control-center data (server-only). Additive: reads the EXISTING
// tables via the session (RLS org-isolation) — no new engine, no schema. Feeds
// the redesigned home with the two KPI extras (today's tasks / this week's
// viewings) and the compact "today's tasks" list. Everything is best-effort:
// a failing read returns an honest empty/zero, never a fabricated number.
// ============================================================================
/* eslint-disable @typescript-eslint/no-explicit-any */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

// Open task statuses — mirrors src/lib/today/work-queue.ts (single source of truth
// for what "open" means on the tasks table).
const TASK_OPEN = ["todo", "in_progress", "pending", "open"];

export interface HomeTaskItem {
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
  priority: string | null;
}

export interface HomeKpiExtras {
  tasksToday: number;
  toursThisWeek: number;
}

function todayBounds() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  return { startIso: s.toISOString(), endIso: e.toISOString() };
}

/** [now, +7 days] window for "this week's" viewings. */
function weekBounds() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(s); e.setDate(e.getDate() + 7); e.setHours(23, 59, 59, 999);
  return { startIso: s.toISOString(), endIso: e.toISOString() };
}

/** KPI extras not already computed on the home page: today's open tasks count and
 *  viewings/meetings scheduled in the next 7 days. Org-scoped, best-effort. */
export async function getHomeKpiExtras(): Promise<HomeKpiExtras> {
  const empty: HomeKpiExtras = { tasksToday: 0, toursThisWeek: 0 };
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return empty;
    const orgId = profile.org_id;
    const supabase = (await createClient()) as any;
    const { startIso, endIso } = todayBounds();
    const week = weekBounds();

    const safeCount = async (p: any): Promise<number> => {
      try { const { count } = await p; return count ?? 0; } catch { return 0; }
    };

    const [tasksToday, toursThisWeek] = await Promise.all([
      safeCount(
        supabase.from("tasks").select("id", { count: "exact", head: true })
          .eq("org_id", orgId).in("status", TASK_OPEN)
          .gte("due_at", startIso).lte("due_at", endIso),
      ),
      safeCount(
        supabase.from("meetings").select("id", { count: "exact", head: true })
          .eq("org_id", orgId)
          .gte("start_at", week.startIso).lte("start_at", week.endIso)
          .not("status", "in", "(cancelled,completed,no_show)"),
      ),
    ]);
    return { tasksToday, toursThisWeek };
  } catch {
    return empty;
  }
}

/** Compact "today's tasks" list: open tasks due today or overdue, soonest first.
 *  Org-scoped (RLS). Returns [] on any failure. */
export async function listTodayTasks(limit = 6): Promise<HomeTaskItem[]> {
  try {
    const { profile } = await getSessionContext();
    if (!profile?.org_id) return [];
    const supabase = (await createClient()) as any;
    const { endIso } = todayBounds();
    const { data } = await supabase
      .from("tasks")
      .select("id,title,due_at,status,priority")
      .eq("org_id", profile.org_id)
      .in("status", TASK_OPEN)
      .not("due_at", "is", null)
      .lte("due_at", endIso)
      .order("due_at", { ascending: true })
      .limit(limit);
    const rows = (data ?? []) as { id: string; title: string; due_at: string | null; status: string; priority: string | null }[];
    return rows.map((r) => ({ id: r.id, title: r.title, dueAt: r.due_at, status: r.status, priority: r.priority }));
  } catch {
    return [];
  }
}
