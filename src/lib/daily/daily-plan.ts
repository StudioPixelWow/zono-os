/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Agent Daily Autopilot · server selector (server-only). Composes the
// EXISTING deterministic Daily Command Center (the single source of prioritized
// actions — leads, replies, sellers, deals, publishing, marketing, tasks) with
// today's HARD-TIME meetings/viewings from the canonical meetings table, and feeds
// them to the pure daily-plan core. It re-derives NOTHING: priorities come from the
// command center, times from meetings. Read-derived (no stale snapshot) so it
// replans every load as the day changes. Org- + role-scoped, bounded, resilient.
// ============================================================================
import "server-only";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getDailyCommandCenter } from "./command-center";
import {
  buildDailyPlan, type DailyPlan, type DailyActionInput, type DailyMeetingInput,
} from "./daily-plan-core";
import type { DailyCommandCenter } from "./priority";

const israelDay = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" }) : null;

/** Today's meetings/viewings (hard-time anchors), agent-scoped by organizer. */
async function listTodayMeetings(supabase: any, orgId: string, opts: { userId: string | null; isManager: boolean }): Promise<DailyMeetingInput[]> {
  const nowMs = Date.now();
  const todayIsrael = israelDay(new Date(nowMs).toISOString());
  const fromIso = new Date(nowMs - 12 * 3_600_000).toISOString();
  const toIso = new Date(nowMs + 20 * 3_600_000).toISOString();
  try {
    let q = supabase.from("meetings")
      .select("id,type,title,status,start_at,end_at,buyer_id,property_id,organizer_id")
      .eq("org_id", orgId).gte("start_at", fromIso).lte("start_at", toIso)
      .not("status", "in", "(cancelled,no_show)").order("start_at", { ascending: true }).limit(40);
    if (!opts.isManager && opts.userId) q = q.eq("organizer_id", opts.userId);
    const { data } = await q;
    const rows = ((data ?? []) as any[]).filter((m) => israelDay(m.start_at) === todayIsrael);
    if (!rows.length) return [];

    // Enrich property titles + buyer names (bounded batch lookups).
    const propIds = [...new Set(rows.map((r) => r.property_id).filter(Boolean))] as string[];
    const buyerIds = [...new Set(rows.map((r) => r.buyer_id).filter(Boolean))] as string[];
    const propTitle = new Map<string, string>();
    const buyerName = new Map<string, string>();
    if (propIds.length) { const { data: pr } = await supabase.from("properties").select("id,title").in("id", propIds).eq("org_id", orgId); for (const p of (pr ?? []) as any[]) if (p.title) propTitle.set(p.id, p.title); }
    if (buyerIds.length) { const { data: br } = await supabase.from("buyers").select("id,full_name").in("id", buyerIds); for (const b of (br ?? []) as any[]) if (b.full_name) buyerName.set(b.id, b.full_name); }

    return rows.map((m) => ({
      id: m.id, type: m.type, title: m.title, startAt: m.start_at, endAt: m.end_at,
      buyerName: m.buyer_id ? buyerName.get(m.buyer_id) ?? null : null,
      propertyTitle: m.property_id ? propTitle.get(m.property_id) ?? null : null,
      propertyId: m.property_id ?? null,
      href: m.property_id ? `/properties/${m.property_id}` : (m.type === "viewing" || m.type === "open_house") ? "/viewings" : "/today",
      status: m.status,
    }));
  } catch { return []; }
}

export interface AgentDailyPlanView {
  plan: DailyPlan;
  rail: {
    marketing: DailyCommandCenter["marketing"];
    hero: DailyCommandCenter["hero"];
    team: DailyCommandCenter["team"];
    pipeline: DailyCommandCenter["pipeline"];
    isManager: boolean;
    userFirstName: string;
  };
}

/** The agent's one daily operating plan (or null when no active org). */
export async function getAgentDailyPlan(opts?: { capacityMinutes?: number }): Promise<AgentDailyPlanView | null> {
  const { user, organization } = await getSessionContext();
  if (!organization) return null;
  const orgId = organization.id;
  const userId = user?.id ?? null;
  const supabase = await createClient();

  const cc = await getDailyCommandCenter();
  if (!cc) return null;

  const meetings = await listTodayMeetings(supabase, orgId, { userId, isManager: cc.isManager });

  // The command center's ranked actions ARE the priority truth — mapped structurally.
  const actions: DailyActionInput[] = cc.priorityActions.map((a) => ({
    id: a.id, kind: a.kind, priority: a.priority as DailyActionInput["priority"], urgency: a.urgency,
    title: a.title, reason: a.reason, href: a.href, cta: a.cta, icon: a.icon, entity: a.entity,
  }));

  const nowMs = Date.now();
  const plan = buildDailyPlan({
    actions, meetings, doneToday: cc.completedToday, role: cc.role, nowMs,
    date: israelDay(new Date(nowMs).toISOString()) ?? new Date(nowMs).toISOString().slice(0, 10),
    capacityMinutes: opts?.capacityMinutes,
  });

  return {
    plan,
    rail: { marketing: cc.marketing, hero: cc.hero, team: cc.team, pipeline: cc.pipeline, isManager: cc.isManager, userFirstName: cc.userFirstName },
  };
}

/** Deterministic ZI summary of the day (facts from the same plan; never invented). */
export async function summarizeDailyPlanForZi(): Promise<string | null> {
  const v = await getAgentDailyPlan();
  if (!v) return null;
  const p = v.plan;
  if (p.quiet) return "הכול בשליטה להיום ✓ — אין פעולות דחופות. אם בא לך, אפשר להתקדם על הזדמנויות שיווק או לחזור ללקוחות פושרים.";
  const lines: string[] = [`📅 ${p.headline}`];
  const top = [...p.buckets.needsAttention, ...p.buckets.fixedTime.filter((m) => m.status !== "done"), ...p.buckets.shouldToday].slice(0, 5);
  top.forEach((it, i) => {
    const when = it.dueAt ? new Date(it.dueAt).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" }) + " · " : "";
    lines.push(`${i + 1}. ${when}${it.title} — ${it.reason}`);
  });
  const fixed = p.buckets.fixedTime.filter((m) => m.status !== "done").length;
  const later = p.buckets.ifTime.length;
  const tail: string[] = [];
  if (fixed) tail.push(`${fixed} פגישות קבועות`);
  if (later) tail.push(`${later} פעולות שאפשר להשאיר לאחר הצהריים`);
  if (tail.length) lines.push("יש גם " + tail.join(" ו-") + ".");
  lines.push("פתח את היום שלי: /today/plan");
  return lines.join("\n");
}
