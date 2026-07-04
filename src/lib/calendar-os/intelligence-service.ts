// ============================================================================
// 🧠 ZONO — Calendar Intelligence™ · server service (server-only). PHASE 43.1.
// Feeds REAL data into the pure intelligence layer. Reuses Calendar OS reads
// (getCalendarEvents / getEntityCalendar / getTeamAvailability), existing agent
// scorecards (buyer/seller/lead heat·risk·score), field-ops getVisitMode for
// visit prep, and compute-cache. READ-ONLY — recommendation output only.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getCache, setCache } from "@/lib/platform-persistence/compute-cache";
import { getCalendarEvents, getEntityCalendar } from "./service";
import { normalizeMeeting } from "./engine";
import {
  nextBestActions, optimizeDay, buildWeekPlan, findFreeSlots, smartRouting, calendarHealth,
  afterMeetingSuggestions, managerWorkload, type SignalMap, type EntitySignal,
  type DayOptimization, type FreeSlot, type SmartRoute, type CalendarHealth, type WeekDayPlan,
  type NextBestAction, type ManagerView, type AfterMeetingSuggestion,
} from "./intelligence";
import { getBuyerAgentScorecards } from "@/lib/buyer-agent/service";
import { getSellerAgentScorecards } from "@/lib/seller-agent/service";
import { getLeadAgentScorecards } from "@/lib/lead-agent/service";
import { getVisitMode } from "@/lib/field-ops/service";
import type { CalendarEvent, EntityKind } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const rows = (d: unknown): Row[] => (Array.isArray(d) ? (d as Row[]) : []);
/** First finite number found in a (nested) object — a robust signal magnitude. */
function firstNum(o: unknown, depth = 0): number | null {
  if (typeof o === "number" && Number.isFinite(o)) return o;
  if (depth > 2 || !o || typeof o !== "object") return null;
  for (const v of Object.values(o as Row)) { const n = firstNum(v, depth + 1); if (n != null && n >= 0 && n <= 100) return n; }
  return null;
}
async function ctx() { const sc = await getSessionContext(); return { orgId: sc.profile?.org_id ?? sc.organization?.id ?? null, userId: sc.user?.id ?? null }; }

/** Build the heat/risk/score signal map from existing agent scorecards (best-effort). */
export async function buildSignals(orgId: string | null): Promise<SignalMap> {
  const map = new Map<string, EntitySignal>();
  const [b, se, l] = await Promise.all([
    getBuyerAgentScorecards(orgId).catch(() => null),
    getSellerAgentScorecards(orgId).catch(() => null),
    getLeadAgentScorecards(orgId).catch(() => null),
  ]);
  const cards = (o: unknown): Row[] => rows((o as { scorecards?: unknown })?.scorecards);
  for (const c of cards(b)) { const id = s(c.id); if (id) map.set(id, { id, kind: "buyer", heat: firstNum(c.health) ?? undefined, journeyStage: s(c.lifecycleStage) ?? undefined }); }
  for (const c of cards(se)) { const id = s(c.id); if (id) map.set(id, { id, kind: "seller", risk: firstNum(c.health) ?? undefined, journeyStage: s(c.lifecycleStage) ?? undefined }); }
  for (const c of cards(l)) { const id = s(c.id); if (id) map.set(id, { id, kind: "lead", score: firstNum(c.health) ?? undefined, journeyStage: s(c.lifecycleStage) ?? undefined }); }
  return map;
}

function dayRange(dateIso: string) {
  const d = new Date(dateIso);
  return { startIso: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString(), endIso: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString() };
}

export interface DayIntelligence {
  date: string; nextBest: NextBestAction[]; optimization: DayOptimization;
  freeSlots: FreeSlot[]; health: CalendarHealth; routing: SmartRoute;
}
/** STEP 1/2/4/5/6 for a single day (cached 5 min). */
export async function getDayIntelligence(dateIso: string, brokerId?: string | null): Promise<DayIntelligence> {
  const { orgId, userId } = await ctx();
  const broker = brokerId ?? userId;
  const key = [broker, dateIso.slice(0, 10)];
  if (orgId) { const hit = await getCache<DayIntelligence>(orgId, "calendar_intel_day", key); if (hit) return hit.value; }
  const { startIso, endIso } = dayRange(dateIso);
  const [events, signals] = await Promise.all([getCalendarEvents({ brokerId: broker, startIso, endIso }), buildSignals(orgId)]);
  const out: DayIntelligence = {
    date: dateIso.slice(0, 10),
    nextBest: nextBestActions(events, signals),
    optimization: optimizeDay(events, dateIso),
    freeSlots: findFreeSlots(events, dateIso),
    health: calendarHealth(events, signals, dateIso, 1),
    routing: smartRouting(events),
  };
  if (orgId) await setCache(orgId, "calendar_intel_day", key, out as unknown as Parameters<typeof setCache>[3], { ttlSeconds: 300 });
  return out;
}

export interface WeekIntelligence { week: WeekDayPlan[]; health: CalendarHealth }
/** STEP 3/6 for the week (cached 10 min). */
export async function getWeekIntelligence(fromIso?: string): Promise<WeekIntelligence> {
  const { orgId } = await ctx();
  const from = fromIso ?? new Date().toISOString();
  const start = new Date(from); const startIso = new Date(start.getFullYear(), start.getMonth(), start.getDate()).toISOString();
  const endIso = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7, 23, 59, 59).toISOString();
  const key = [startIso.slice(0, 10)];
  if (orgId) { const hit = await getCache<WeekIntelligence>(orgId, "calendar_intel_week", key); if (hit) return hit.value; }
  const [events, signals] = await Promise.all([getCalendarEvents({ startIso, endIso }), buildSignals(orgId)]);
  const out: WeekIntelligence = { week: buildWeekPlan(events, startIso), health: calendarHealth(events, signals, startIso, 7) };
  if (orgId) await setCache(orgId, "calendar_intel_week", key, out as unknown as Parameters<typeof setCache>[3], { ttlSeconds: 600 });
  return out;
}

// ── STEP 7 — Property visit intelligence (reuses field-ops getVisitMode) ─────
export interface VisitPrep {
  propertyId: string; visitMode: Awaited<ReturnType<typeof getVisitMode>>;
  timeline: CalendarEvent[]; recommendedQuestions: string[]; nextStep: string;
}
export async function getVisitPrep(propertyId: string): Promise<VisitPrep | null> {
  const [visitMode, timeline] = await Promise.all([
    getVisitMode(propertyId).catch(() => null),
    getEntityCalendar("property", propertyId).catch(() => [] as CalendarEvent[]),
  ]);
  if (!visitMode) return null;
  const recommendedQuestions = [
    "מה מצב הנכס ותחזוקתו?", "האם יש גמישות במחיר?", "מהו לוח הזמנים למכירה?",
    "האם היו הצעות קודמות?", "מה מייחד את הנכס לקונים?",
  ];
  const nextStep = "לאחר הביקור: לעדכן סטטוס, לקבוע מעקב ולשקול התאמת קונים.";
  return { propertyId, visitMode, timeline, recommendedQuestions, nextStep };
}

// ── STEP 8/9 — Meeting preparation + after-meeting suggestions ───────────────
export interface MeetingPrep {
  entity: { kind: EntityKind; id: string }; timeline: CalendarEvent[]; signal: EntitySignal | null;
  talkingPoints: string[]; riskLevel: number; opportunityLevel: number; afterMeeting: AfterMeetingSuggestion[];
}
export async function getMeetingPrep(kind: EntityKind, id: string): Promise<MeetingPrep> {
  const { orgId } = await ctx();
  const [timeline, signals] = await Promise.all([getEntityCalendar(kind, id).catch(() => [] as CalendarEvent[]), buildSignals(orgId)]);
  const signal = signals.get(id) ?? null;
  const risk = signal?.risk ?? 0; const heat = signal?.heat ?? signal?.score ?? 0;
  const talkingPoints = kind === "seller"
    ? ["עדכון על פעילות שיווקית", "משוב מצפיות אחרונות", "בדיקת ציפיות מחיר", "תכנית להאצת המכירה"]
    : ["הבנת צרכים מעודכנת", "הצגת נכסים מתאימים", "בדיקת יכולת מימון", "קביעת צפיות הבאות"];
  const upcoming = timeline.find((e) => !e.done);
  return {
    entity: { kind, id }, timeline, signal, talkingPoints, riskLevel: risk, opportunityLevel: heat,
    afterMeeting: afterMeetingSuggestions(upcoming ?? ({ id: "", href: kind === "buyer" ? `/buyers/${id}` : kind === "seller" ? `/sellers/${id}` : `/leads/${id}`, entity: { kind, id, name: null } } as CalendarEvent), signal ?? undefined),
  };
}

// ── STEP 13 — Manager view (per-broker workload today) ───────────────────────
export async function getManagerView(): Promise<ManagerView> {
  const { orgId } = await ctx();
  if (!orgId) return { brokers: [], freeBrokers: 0, overloadedBrokers: 0, coveragePct: 0, avgEventsPerBroker: 0, note: "" };
  const db = await createClient();
  const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const dayEnd = new Date(new Date().setHours(23, 59, 59, 999)).toISOString();
  const { data: usersData } = await db.from("users").select("id,full_name").eq("org_id", orgId).limit(100);
  const users = rows(usersData);
  const byBroker = new Map<string, CalendarEvent[]>();
  try {
    const { data } = await db.from("meetings").select("id,title,organizer_id,start_at,end_at,type,status,property_id,buyer_id,seller_id,lead_id").eq("org_id", orgId).gte("start_at", dayStart).lte("start_at", dayEnd).limit(600);
    for (const r of rows(data)) { const bid = s(r.organizer_id); if (!bid) continue; const e = normalizeMeeting(r); if (!e) continue; const list = byBroker.get(bid) ?? []; list.push(e); byBroker.set(bid, list); }
  } catch { /* none */ }
  return managerWorkload(users.map((u) => ({ brokerId: s(u.id) ?? "", name: s(u.full_name), events: byBroker.get(s(u.id) ?? "") ?? [] })));
}
