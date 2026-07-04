// ============================================================================
// 🧠 ZONO — Calendar Intelligence™ · pure layer over Calendar OS. PHASE 43.1.
// RECOMMENDATION-ONLY. Never mutates events. EXTENDS the 43.0 engine — reuses
// buildDayPlan / optimizeRoute / proposeReschedule; adds no second planner.
// Everything here is a proposal the broker approves in the source system.
// ============================================================================
import { buildDayPlan, optimizeRoute } from "./engine";
import type { CalendarEvent, EntityKind, RouteStop, OptimizedRoute } from "./types";

// ── Entity signals fed by the service (heat / risk / score / journey) ────────
export interface EntitySignal { id: string; kind: EntityKind; heat?: number; risk?: number; score?: number; journeyStage?: string }
export type SignalMap = Map<string, EntitySignal>;
const sigOf = (m: SignalMap | undefined, e: CalendarEvent): EntitySignal | undefined => (e.entity.id ? m?.get(e.entity.id) : undefined);

// ── Work-day frame (office hours + lunch) ────────────────────────────────────
export interface WorkFrame { startHour: number; endHour: number; lunchStart: number; lunchEnd: number }
export const DEFAULT_FRAME: WorkFrame = { startHour: 9, endHour: 19, lunchStart: 13, lunchEnd: 14 };
const hourOf = (iso: string) => new Date(iso).getHours() + new Date(iso).getMinutes() / 60;

// ── STEP 1 — Next best actions ───────────────────────────────────────────────
export interface NextBestAction { kind: "call" | "drive" | "meeting" | "followup" | "reschedule" | "prep"; eventId: string | null; title: string; why: string; urgency: number; href: string | null }
export function nextBestActions(events: CalendarEvent[], signals: SignalMap | undefined, now = Date.now()): NextBestAction[] {
  const live = events.filter((e) => !e.done);
  const upcoming = live.filter((e) => Date.parse(e.start) >= now);
  const out: NextBestAction[] = [];

  const nextMeeting = upcoming.find((e) => e.type === "meeting" || e.type.includes("visit") || e.type === "seller_meeting");
  if (nextMeeting) out.push({ kind: nextMeeting.type.includes("visit") ? "drive" : "meeting", eventId: nextMeeting.id, title: nextMeeting.title, why: "הפגישה/הביקור הבא בלו״ז", urgency: Math.max(80, nextMeeting.urgency), href: nextMeeting.href });

  const overdue = live.filter((e) => Date.parse(e.start) < now && (e.source === "followup" || e.type === "phone_call" || e.source === "task"));
  overdue.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  if (overdue[0]) out.push({ kind: "followup", eventId: overdue[0].id, title: overdue[0].title, why: "מעקב/משימה באיחור", urgency: 100, href: overdue[0].href });

  // Hottest entity to call (buyer heat / seller risk / lead score high)
  const hot = upcoming
    .map((e) => ({ e, sig: sigOf(signals, e) }))
    .filter((x) => x.sig && ((x.sig.heat ?? 0) >= 70 || (x.sig.risk ?? 0) >= 70 || (x.sig.score ?? 0) >= 80))
    .sort((a, b) => (Math.max(b.sig!.heat ?? 0, b.sig!.risk ?? 0, b.sig!.score ?? 0)) - (Math.max(a.sig!.heat ?? 0, a.sig!.risk ?? 0, a.sig!.score ?? 0)))[0];
  if (hot) out.push({ kind: "call", eventId: hot.e.id, title: hot.e.title, why: (hot.sig!.risk ?? 0) >= 70 ? "מוכר בסיכון — ליצור קשר" : "לקוח חם — ליצור קשר", urgency: 90, href: hot.e.href });

  return dedupeActions(out).sort((a, b) => b.urgency - a.urgency).slice(0, 6);
}
function dedupeActions(a: NextBestAction[]): NextBestAction[] { const seen = new Set<string>(); return a.filter((x) => { const k = `${x.kind}:${x.eventId}`; if (seen.has(k)) return false; seen.add(k); return true; }); }

// ── STEP 2 — AI day optimizer (reuses buildDayPlan; adds frame + lunch) ──────
export interface DayBlock { start: string; end: string | null; kind: "event" | "lunch" | "free"; title: string; eventId: string | null; suggestion: string | null; rank: number | null }
export interface DayOptimization { date: string; blocks: DayBlock[]; warnings: string[]; note: string }
export function optimizeDay(events: CalendarEvent[], dateIso: string, frame: WorkFrame = DEFAULT_FRAME, now = Date.now()): DayOptimization {
  const plan = buildDayPlan(events, dateIso, now);               // REUSE — no second planner
  const blocks: DayBlock[] = plan.slots.map((sl) => ({
    start: sl.suggestedStart ?? sl.event.start, end: sl.event.end, kind: "event",
    title: sl.event.title, eventId: sl.event.id, suggestion: sl.reason || null, rank: sl.rank,
  }));
  const day = new Date(dateIso);
  const lunchStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), frame.lunchStart, 0).toISOString();
  const lunchEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), frame.lunchEnd, 0).toISOString();
  blocks.push({ start: lunchStart, end: lunchEnd, kind: "lunch", title: "הפסקת צהריים", eventId: null, suggestion: null, rank: null });
  blocks.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

  const warnings: string[] = [];
  const outside = plan.slots.filter((sl) => { const h = hourOf(sl.event.start); return h < frame.startHour || h > frame.endHour; });
  if (outside.length) warnings.push(`${outside.length} אירועים מחוץ לשעות העבודה (${frame.startHour}:00–${frame.endHour}:00)`);
  if (plan.summary.total > 8) warnings.push("יום עמוס מאוד — שקול לדחות אירועים פחות דחופים");
  if (plan.summary.overdue > 0) warnings.push(`${plan.summary.overdue} אירועים באיחור`);
  return { date: plan.date, blocks, warnings, note: "הצעה בלבד — שום דבר לא משתנה אוטומטית." };
}

// ── STEP 3 — Week planner (theme per day) ────────────────────────────────────
export type DayTheme = "follow_up" | "acquisition" | "marketing" | "photography" | "open_house" | "meetings" | "light";
export const THEME_HE: Record<DayTheme, string> = { follow_up: "יום מעקבים", acquisition: "יום גיוס", marketing: "יום שיווק", photography: "יום צילום", open_house: "יום בתים פתוחים", meetings: "יום פגישות", light: "יום קליל" };
export interface WeekDayPlan { date: string; theme: DayTheme; total: number; focus: string }
export function buildWeekPlan(events: CalendarEvent[], fromIso: string): WeekDayPlan[] {
  const days: WeekDayPlan[] = [];
  const base = new Date(fromIso);
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const evs = events.filter((e) => e.start.slice(0, 10) === key && !e.done);
    const count = (pred: (e: CalendarEvent) => boolean) => evs.filter(pred).length;
    const followups = count((e) => e.source === "followup" || e.type === "phone_call");
    const meetings = count((e) => e.type === "meeting" || e.type.includes("visit") || e.type === "seller_meeting");
    const photo = count((e) => e.type === "photo_day");
    const open = count((e) => e.type === "open_house");
    const marketing = count((e) => e.type === "marketing_campaign" || e.type === "facebook_publish");
    let theme: DayTheme = "light";
    if (open > 0) theme = "open_house"; else if (photo > 0) theme = "photography";
    else if (meetings >= 3) theme = "meetings"; else if (followups >= 3) theme = "follow_up";
    else if (marketing >= 2) theme = "marketing"; else if (evs.length <= 1) theme = "light"; else theme = "acquisition";
    days.push({ date: key, theme, total: evs.length, focus: THEME_HE[theme] });
  }
  return days;
}

// ── STEP 4 — Free slot engine ────────────────────────────────────────────────
export interface FreeSlot { start: string; end: string; minutes: number; suggestion: string }
export function findFreeSlots(events: CalendarEvent[], dateIso: string, frame: WorkFrame = DEFAULT_FRAME, minMinutes = 45): FreeSlot[] {
  const day = new Date(dateIso);
  const mk = (h: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(h), (h % 1) * 60).getTime();
  const timed = events.filter((e) => !e.done && !e.allDay && e.start.slice(0, 10) === dateIso.slice(0, 10))
    .map((e) => ({ s: Date.parse(e.start), e: Date.parse(e.end ?? e.start) + (e.end ? 0 : 30 * 60_000) }))
    .sort((a, b) => a.s - b.s);
  const slots: FreeSlot[] = [];
  let cursor = mk(frame.startHour);
  const dayEnd = mk(frame.endHour);
  const push = (from: number, to: number) => {
    const mins = Math.round((to - from) / 60_000);
    if (mins < minMinutes) return;
    const h = new Date(from).getHours();
    const suggestion = h < 11 ? "שיחות / מעקבים / גיוס" : h < 13 ? "פגישות קונים" : h < 16 ? "ביקורי נכסים" : "עבודת שיווק / סקירת מסמכים";
    slots.push({ start: new Date(from).toISOString(), end: new Date(to).toISOString(), minutes: mins, suggestion });
  };
  const lunchS = mk(frame.lunchStart), lunchE = mk(frame.lunchEnd);
  for (const b of timed) { if (b.s > cursor) { if (cursor < lunchS && b.s > lunchE) { push(cursor, lunchS); push(lunchE, b.s); } else push(cursor, b.s); } cursor = Math.max(cursor, b.e); }
  if (cursor < dayEnd) { if (cursor < lunchS) { push(cursor, lunchS); push(lunchE, dayEnd); } else push(Math.max(cursor, lunchE), dayEnd); }
  return slots;
}

// ── STEP 5 — Smart routing (reuse optimizeRoute + cluster) ───────────────────
export interface RouteCluster { city: string; count: number; suggestion: string }
export interface SmartRoute { route: OptimizedRoute; clusters: RouteCluster[]; merges: string[]; note: string }
export function smartRouting(events: CalendarEvent[]): SmartRoute {
  const stops: RouteStop[] = events.filter((e) => !e.done).map((e) => ({ eventId: e.id, title: e.title, lat: e.lat, lng: e.lng, city: e.city }));
  const route = optimizeRoute(stops);                             // REUSE
  const byCity = new Map<string, number>();
  for (const st of stops) { const c = st.city ?? "לא ידוע"; byCity.set(c, (byCity.get(c) ?? 0) + 1); }
  const clusters: RouteCluster[] = [...byCity.entries()].filter(([c]) => c !== "לא ידוע").map(([city, count]) => ({ city, count, suggestion: count >= 2 ? `אשכל ${count} אירועים ב${city} לרצף אחד` : `אירוע יחיד ב${city}` }));
  const merges = clusters.filter((c) => c.count >= 2).map((c) => `מזג ${c.count} עצירות ב${c.city} → פחות זמן נסיעה`);
  return { route, clusters, merges, note: "הצעה בלבד — לא משנה את הלו״ז." };
}

// ── STEP 6 — Calendar health ─────────────────────────────────────────────────
export interface CalendarHealth {
  busyPct: number; travelPct: number; meetingsPct: number; followupsPct: number;
  overloadedDays: string[]; underutilizedDays: string[]; lateResponses: number; missedOpportunities: number;
  calendarScore: number; grade: string;
}
export function calendarHealth(events: CalendarEvent[], signals: SignalMap | undefined, fromIso: string, days = 7, frame: WorkFrame = DEFAULT_FRAME, now = Date.now()): CalendarHealth {
  const live = events.filter((e) => !e.done);
  const total = live.length || 1;
  const meetings = live.filter((e) => e.type === "meeting" || e.type.includes("visit") || e.type === "seller_meeting").length;
  const travel = live.filter((e) => e.type.includes("visit") || e.type === "open_house").length;
  const followups = live.filter((e) => e.source === "followup" || e.type === "phone_call").length;
  const workHoursPerDay = frame.endHour - frame.startHour;

  const base = new Date(fromIso); const overloaded: string[] = []; const under: string[] = [];
  let bookedHours = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i); const key = d.toISOString().slice(0, 10);
    const dow = d.getDay(); if (dow === 6) continue;             // skip Saturday (IL weekend)
    const evs = live.filter((e) => e.start.slice(0, 10) === key);
    bookedHours += evs.reduce((t, e) => t + (e.end ? (Date.parse(e.end) - Date.parse(e.start)) / 3_600_000 : 0.5), 0);
    if (evs.length >= 8) overloaded.push(key); else if (evs.length <= 1) under.push(key);
  }
  const busyPct = Math.min(100, Math.round((bookedHours / (workHoursPerDay * Math.max(1, days - 1))) * 100));
  const lateResponses = live.filter((e) => (e.source === "followup" || e.source === "task") && Date.parse(e.start) < now).length;
  const upcomingIds = new Set(live.filter((e) => Date.parse(e.start) >= now && e.entity.id).map((e) => e.entity.id));
  let missed = 0; if (signals) for (const sig of signals.values()) { if (((sig.heat ?? 0) >= 75 || (sig.risk ?? 0) >= 75) && !upcomingIds.has(sig.id)) missed++; }

  const calendarScore = Math.max(0, Math.min(100, Math.round(
    60 + (busyPct >= 40 && busyPct <= 85 ? 20 : busyPct > 85 ? -10 : -5) - lateResponses * 4 - overloaded.length * 5 - missed * 3
  )));
  const grade = calendarScore >= 80 ? "מצוין" : calendarScore >= 60 ? "טוב" : calendarScore >= 40 ? "בינוני" : "דורש שיפור";
  return {
    busyPct, travelPct: Math.round((travel / total) * 100), meetingsPct: Math.round((meetings / total) * 100), followupsPct: Math.round((followups / total) * 100),
    overloadedDays: overloaded, underutilizedDays: under, lateResponses, missedOpportunities: missed, calendarScore, grade,
  };
}

// ── STEP 9 — After-meeting suggestions (proposal only) ───────────────────────
export interface AfterMeetingSuggestion { kind: "mission" | "workflow" | "followup" | "whatsapp_draft" | "email_draft" | "reminder" | "calendar_event"; label: string; href: string | null }
export function afterMeetingSuggestions(event: CalendarEvent, signal?: EntitySignal): AfterMeetingSuggestion[] {
  const href = event.href;
  const out: AfterMeetingSuggestion[] = [
    { kind: "followup", label: "קבע מעקב ל-48 שעות", href },
    { kind: "whatsapp_draft", label: "טיוטת WhatsApp סיכום פגישה", href: "/whatsapp/inbox" },
    { kind: "mission", label: "צור משימה מהפגישה", href },
    { kind: "calendar_event", label: "קבע פגישת המשך", href: "/calendar" },
  ];
  if (event.entity.kind === "seller" || (signal?.risk ?? 0) >= 60) out.unshift({ kind: "workflow", label: "הפעל תהליך שימור מוכר", href });
  if (event.entity.kind === "buyer" || (signal?.heat ?? 0) >= 60) out.unshift({ kind: "email_draft", label: "טיוטת אימייל עם נכסים מתאימים", href });
  return out.slice(0, 6);
}

// ── STEP 13 — Manager workload ───────────────────────────────────────────────
export interface BrokerLoad { brokerId: string; name: string | null; events: number; state: "free" | "balanced" | "overloaded"; meetings: number }
export interface ManagerView { brokers: BrokerLoad[]; freeBrokers: number; overloadedBrokers: number; coveragePct: number; avgEventsPerBroker: number; note: string }
export function managerWorkload(perBroker: { brokerId: string; name: string | null; events: CalendarEvent[] }[]): ManagerView {
  const brokers: BrokerLoad[] = perBroker.map((b) => {
    const live = b.events.filter((e) => !e.done);
    const meetings = live.filter((e) => e.type === "meeting" || e.type.includes("visit")).length;
    const state: BrokerLoad["state"] = live.length >= 8 ? "overloaded" : live.length <= 1 ? "free" : "balanced";
    return { brokerId: b.brokerId, name: b.name, events: live.length, meetings, state };
  });
  const free = brokers.filter((b) => b.state === "free").length;
  const over = brokers.filter((b) => b.state === "overloaded").length;
  const withEvents = brokers.filter((b) => b.events > 0).length;
  const avg = brokers.length ? Math.round((brokers.reduce((t, b) => t + b.events, 0) / brokers.length) * 10) / 10 : 0;
  return { brokers, freeBrokers: free, overloadedBrokers: over, coveragePct: brokers.length ? Math.round((withEvents / brokers.length) * 100) : 0, avgEventsPerBroker: avg, note: over > 0 && free > 0 ? "ניתן לאזן עומסים בין ברוקרים" : "העומס מאוזן" };
}

// ── STEP 12 — Ask intents (routing helper; the service composes the answer) ──
export type CalIntent = "organize" | "move" | "waste" | "overdue" | "prioritize" | "cancel" | "next" | "general";
export function classifyCalendarIntent(q: string): CalIntent {
  const t = q.toLowerCase();
  if (/organize|לארגן|לסדר את היום/.test(t)) return "organize";
  if (/move|לדחות|להזיז|reschedule/.test(t)) return "move";
  if (/waste|מבזבז|זמן מת|לא יעיל/.test(t)) return "waste";
  if (/overdue|באיחור|התעכב|לא חזרתי/.test(t)) return "overdue";
  if (/priorit|עדיפות|קודם/.test(t)) return "prioritize";
  if (/cancel|לבטל|למחוק/.test(t)) return "cancel";
  if (/next|הבא|הבאה/.test(t)) return "next";
  return "general";
}

// ── Self-check ───────────────────────────────────────────────────────────────
export interface ICheck { name: string; pass: boolean }
export interface ISelfCheck { ok: boolean; total: number; passed: number; checks: ICheck[] }
export function runIntelSelfCheck(): ISelfCheck {
  const checks: ICheck[] = []; const add = (n: string, p: boolean) => checks.push({ name: n, pass: p });
  const NOW = Date.parse("2026-07-06T07:00:00.000Z"); // Monday
  const at = (h: number, day = 0) => new Date(2026, 6, 6 + day, h, 0).toISOString();
  const mk = (over: Partial<CalendarEvent>): CalendarEvent => ({ id: over.id ?? "e", source: "meeting", type: "meeting", title: "פגישה", detail: null, start: over.start ?? at(10), end: over.end ?? at(11), allDay: false, status: null, done: false, priority: 60, urgency: 70, entity: over.entity ?? { kind: null, id: null, name: null }, propertyId: null, city: null, lat: null, lng: null, href: null, locked: true, ...over });

  const events: CalendarEvent[] = [
    mk({ id: "m1", type: "meeting", start: at(10), end: at(11), entity: { kind: "buyer", id: "b1", name: "יוסי" }, href: "/buyers/b1" }),
    mk({ id: "v1", type: "property_visit", start: at(15), end: at(16), city: "חיפה", lat: 32.79, lng: 34.99, propertyId: "p1", href: "/properties/p1" }),
    mk({ id: "v2", type: "property_visit", start: at(16.5), end: at(17), city: "חיפה", lat: 32.80, lng: 34.98, propertyId: "p2", href: "/properties/p2" }),
    mk({ id: "f1", source: "followup", type: "phone_call", start: at(6, -1), end: null, entity: { kind: "seller", id: "s1", name: "דנה" }, href: "/sellers/s1" }), // overdue yesterday
  ];
  const signals: SignalMap = new Map([["b1", { id: "b1", kind: "buyer", heat: 85 }], ["s1", { id: "s1", kind: "seller", risk: 80 }]]);

  const nba = nextBestActions(events, signals, NOW);
  add("next-best: returns actions, overdue urgency 100", nba.length > 0 && nba.some((a) => a.urgency === 100 && a.kind === "followup"));
  add("next-best: hot/risk entity → call", nba.some((a) => a.kind === "call"));

  const opt = optimizeDay(events, at(9), DEFAULT_FRAME, NOW);
  add("optimizer: reuses plan + inserts lunch block", opt.blocks.some((b) => b.kind === "lunch") && opt.blocks.some((b) => b.kind === "event"));
  add("optimizer: proposal-only note", /לא משתנה אוטומטית/.test(opt.note));

  const week = buildWeekPlan(events, at(9));
  add("week: 7 days themed", week.length === 7 && week.every((d) => !!d.theme));

  const free = findFreeSlots(events, at(9), DEFAULT_FRAME, 45);
  add("free-slots: finds gaps ≥45m with suggestion", free.length > 0 && free.every((s) => s.minutes >= 45 && !!s.suggestion));

  const route = smartRouting(events);
  add("routing: reuses optimizeRoute + clusters Haifa (2)", route.clusters.some((c) => c.city === "חיפה" && c.count === 2) && route.merges.length >= 1);

  const health = calendarHealth(events, signals, at(9), 7, DEFAULT_FRAME, NOW);
  add("health: score + grade + late responses counted", health.calendarScore >= 0 && health.calendarScore <= 100 && !!health.grade && health.lateResponses >= 1);

  const ams = afterMeetingSuggestions(events[0], signals.get("b1"));
  add("after-meeting: suggestions incl. followup, proposal-only kinds", ams.length > 0 && ams.some((x) => x.kind === "followup"));

  const mgr = managerWorkload([{ brokerId: "a", name: "א", events }, { brokerId: "b", name: "ב", events: [] }]);
  add("manager: classifies free/balanced + coverage", mgr.brokers.length === 2 && mgr.freeBrokers === 1);

  add("ask intents: classify organize/move/waste/overdue/prioritize/cancel", classifyCalendarIntent("איך לארגן את היום") === "organize" && classifyCalendarIntent("מה לבטל") === "cancel" && classifyCalendarIntent("איפה אני מבזבז זמן") === "waste");

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
