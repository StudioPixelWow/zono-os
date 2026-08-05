/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Today · Agent work-queue (server-only, Epic 3 hardening · Part 2)
// ----------------------------------------------------------------------------
// The "09:00" surface: an explicit, prioritized rollup of what actually needs
// action right now — overdue/today tasks, meetings today, offers awaiting a
// response, documents awaiting signature, commissions awaiting approval, and
// overdue collections. Additive: reads the existing tables (no new model, no
// second queue engine); the ranked recommendation queue stays as-is alongside.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

export type QueueSeverity = "critical" | "high" | "normal";
export interface WorkQueueCategory {
  key: string; label: string; icon: string; count: number; severity: QueueSeverity; href: string;
  items: { title: string; meta: string | null }[];
}
export interface AgentWorkQueue { categories: WorkQueueCategory[]; totalOpen: number; generatedAtLabel: string }

const TASK_OPEN = ["todo", "in_progress", "pending", "open"];
function todayBounds() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  return { startIso: s.toISOString(), endIso: e.toISOString(), startMs: s.getTime(), endMs: e.getTime() };
}

export async function getAgentWorkQueue(): Promise<AgentWorkQueue> {
  const { user, profile } = await getSessionContext();
  if (!user || !profile?.org_id) throw new Error("לא מחובר/ת");
  const orgId = profile.org_id;
  const db = (await createClient()) as any;
  const { startIso, endIso } = todayBounds();
  const nowIso = new Date().toISOString();
  const todayDate = new Date().toISOString().slice(0, 10);

  const safe = async <T,>(p: Promise<{ data: T[] | null }>): Promise<T[]> => { try { const { data } = await p; return (data ?? []) as T[]; } catch { return []; } };

  const [overdueTasks, todayTasks, meetings, offers, documents, commissions, collections] = await Promise.all([
    safe<any>(db.from("tasks").select("id,title,due_at,status").eq("org_id", orgId).in("status", TASK_OPEN).lt("due_at", nowIso).not("due_at", "is", null).order("due_at", { ascending: true }).limit(50)),
    safe<any>(db.from("tasks").select("id,title,due_at,status").eq("org_id", orgId).in("status", TASK_OPEN).gte("due_at", startIso).lte("due_at", endIso).limit(50)),
    safe<any>(db.from("meetings").select("id,title,start_at,status,type").eq("org_id", orgId).gte("start_at", startIso).lte("start_at", endIso).not("status", "in", "(cancelled,completed,no_show)").order("start_at", { ascending: true }).limit(50)),
    safe<any>(db.from("offers").select("id,amount,status,current_responder").eq("org_id", orgId).in("status", ["submitted", "countered"]).limit(50)),
    safe<any>(db.from("documents").select("id,title,signature_status").eq("org_id", orgId).in("signature_status", ["pending_signature", "partially_signed"]).limit(50)),
    safe<any>(db.from("commissions").select("id,gross_amount,status").eq("org_id", orgId).eq("status", "pending_approval").limit(50)),
    safe<any>(db.from("collections").select("id,amount_due,amount_collected,payment_status,due_date").eq("org_id", orgId).neq("payment_status", "paid").limit(100)),
  ]);

  const ils = (n: number | null | undefined) => (n == null ? "" : `₪${Number(n).toLocaleString("he-IL")}`);
  const overdueCollections = collections.filter((c) => c.payment_status === "overdue" || (c.due_date && c.due_date < todayDate));

  const categories: WorkQueueCategory[] = [
    {
      key: "overdue_tasks", label: "משימות באיחור", icon: "AlertTriangle", severity: "critical", href: "/action-center",
      count: overdueTasks.length, items: overdueTasks.slice(0, 4).map((t) => ({ title: t.title as string, meta: t.due_at ? `יעד ${new Date(t.due_at).toLocaleDateString("he-IL")}` : null })),
    },
    {
      key: "meetings_today", label: "פגישות וצפיות היום", icon: "Calendar", severity: "high", href: "/viewings",
      count: meetings.length, items: meetings.slice(0, 4).map((m) => ({ title: m.title as string, meta: new Date(m.start_at as string).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) })),
    },
    {
      key: "today_tasks", label: "משימות להיום", icon: "ListChecks", severity: "high", href: "/action-center",
      count: todayTasks.length, items: todayTasks.slice(0, 4).map((t) => ({ title: t.title as string, meta: null })),
    },
    {
      key: "offers_waiting", label: "הצעות ממתינות לתשובה", icon: "Send", severity: "high", href: "/offers",
      count: offers.length, items: offers.slice(0, 4).map((o) => ({ title: ils(o.amount) || "הצעה", meta: o.current_responder === "seller" ? "ממתין למוכר" : o.current_responder === "buyer" ? "ממתין לקונה" : null })),
    },
    {
      key: "documents_waiting", label: "מסמכים לחתימה", icon: "FileText", severity: "normal", href: "/documents",
      count: documents.length, items: documents.slice(0, 4).map((d) => ({ title: d.title as string, meta: d.signature_status === "partially_signed" ? "נחתם חלקית" : "ממתין לחתימה" })),
    },
    {
      key: "commissions_waiting", label: "עמלות לאישור", icon: "TrendingDown", severity: "normal", href: "/commissions",
      count: commissions.length, items: commissions.slice(0, 4).map((c) => ({ title: ils(c.gross_amount) || "עמלה", meta: "ממתין לאישור מנהל" })),
    },
    {
      key: "collections_overdue", label: "גבייה בפיגור", icon: "TrendingDown", severity: "critical", href: "/commissions",
      count: overdueCollections.length, items: overdueCollections.slice(0, 4).map((c) => ({ title: `${ils(c.amount_collected)}/${ils(c.amount_due)}`, meta: c.due_date ? `יעד ${new Date(c.due_date as string).toLocaleDateString("he-IL")}` : "פיגור" })),
    },
  ];

  const active = categories.filter((c) => c.count > 0);
  const order: Record<QueueSeverity, number> = { critical: 0, high: 1, normal: 2 };
  active.sort((a, b) => order[a.severity] - order[b.severity] || b.count - a.count);

  return {
    categories: active,
    totalOpen: active.reduce((s, c) => s + c.count, 0),
    generatedAtLabel: new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }),
  };
}
