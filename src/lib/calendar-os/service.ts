// ============================================================================
// 🗓️ ZONO — Calendar OS™ · server service (server-only). PHASE 43.0.
// The SINGLE scheduling aggregator. READS existing tables (meetings, tasks,
// zono_missions, *_followups, property_calendar_plans) and NORMALIZES them to
// one CalendarEvent stream. Enriches property-linked events with geo for route
// optimization. Reuses compute-cache. NO new table, NO writes, NO auto-change.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { getCache, setCache } from "@/lib/platform-persistence/compute-cache";
import {
  normalizeMeeting, normalizeTask, normalizeMission, normalizeFollowup, normalizePropertyPlan,
  dedupeEvents, buildDayPlan, proposeReschedule, optimizeRoute, availabilityFor, providerStatuses,
} from "./engine";
import { classifyCalendarIntent, calendarHealth, nextBestActions } from "./intelligence";
import type {
  CalendarEvent, DayPlan, RescheduleProposal, RescheduleTrigger, OptimizedRoute,
  BrokerAvailability, EntityKind, RouteStop, CalendarProviderStatus,
} from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const rows = (d: unknown): Row[] => (Array.isArray(d) ? (d as Row[]) : []);

async function ctx() {
  const sc = await getSessionContext();
  const db = await createClient();
  return { db, orgId: sc.profile?.org_id ?? sc.organization?.id ?? null, userId: sc.user?.id ?? null };
}

export interface CalendarQuery { brokerId?: string | null; startIso: string; endIso: string; entity?: { kind: EntityKind; id: string } }

/** Aggregate + normalize every source into one deduped, range-filtered stream. */
export async function getCalendarEvents(q: CalendarQuery): Promise<CalendarEvent[]> {
  const { db, orgId } = await ctx();
  if (!orgId) return [];
  const now = Date.now();
  const events: CalendarEvent[] = [];

  const safe = async (fn: () => Promise<void>) => { try { await fn(); } catch { /* degrade per-source */ } };

  await Promise.all([
    safe(async () => {
      let m = db.from("meetings").select("id,title,status,start_at,end_at,type,buyer_id,seller_id,lead_id,property_id").eq("org_id", orgId).gte("start_at", q.startIso).lte("start_at", q.endIso);
      if (q.brokerId) m = m.eq("organizer_id", q.brokerId);
      const { data } = await m.limit(500);
      for (const r of rows(data)) { const e = normalizeMeeting(r, now); if (e) events.push(e); }
    }),
    safe(async () => {
      let t = db.from("tasks").select("id,title,status,due_at,priority,buyer_id,seller_id,lead_id,property_id").eq("org_id", orgId).gte("due_at", q.startIso).lte("due_at", q.endIso).neq("status", "done");
      if (q.brokerId) t = t.eq("assignee_id", q.brokerId);
      const { data } = await t.limit(500);
      for (const r of rows(data)) { const e = normalizeTask(r, now); if (e) events.push(e); }
    }),
    safe(async () => {
      const { data } = await db.from("zono_missions" as never).select("id,entity_type,entity_id,entity_name,mission_type,status,due_at,priority").eq("organization_id" as never, orgId as never).gte("due_at" as never, q.startIso as never).lte("due_at" as never, q.endIso as never).limit(500);
      for (const r of rows(data)) { const e = normalizeMission(r, now); if (e) events.push(e); }
    }),
    safe(async () => {
      const { data } = await db.from("communication_followups").select("id,title,due_at,status,priority,entity_type,entity_id").eq("org_id", orgId).gte("due_at", q.startIso).lte("due_at", q.endIso).limit(300);
      for (const r of rows(data)) { const e = normalizeFollowup(r, "communication", now); if (e) events.push(e); }
    }),
    safe(async () => {
      const { data } = await db.from("whatsapp_followups" as never).select("id,due_at,status,conversation_id").eq("organization_id" as never, orgId as never).gte("due_at" as never, q.startIso as never).lte("due_at" as never, q.endIso as never).limit(300);
      for (const r of rows(data)) { const e = normalizeFollowup(r, "whatsapp", now); if (e) events.push(e); }
    }),
    safe(async () => {
      const { data } = await db.from("property_calendar_plans" as never).select("id,property_id,title,description,plan_type,suggested_date,status,priority").eq("org_id" as never, orgId as never).gte("suggested_date" as never, q.startIso as never).lte("suggested_date" as never, q.endIso as never).limit(300);
      for (const r of rows(data)) { const e = normalizePropertyPlan(r, now); if (e) events.push(e); }
    }),
  ]);

  // Enrich property-linked events with geo (for route optimization).
  const pids = [...new Set(events.map((e) => e.propertyId).filter((x): x is string => !!x))];
  if (pids.length) {
    try {
      const { data } = await db.from("properties").select("id,city,latitude,longitude").in("id", pids.slice(0, 200));
      const geo = new Map(rows(data).map((r) => [s(r.id), { city: s(r.city), lat: typeof r.latitude === "number" ? r.latitude : null, lng: typeof r.longitude === "number" ? r.longitude : null }]));
      for (const e of events) { const g = e.propertyId ? geo.get(e.propertyId) : null; if (g) { e.city = e.city ?? g.city; e.lat = e.lat ?? g.lat; e.lng = e.lng ?? g.lng; } }
    } catch { /* geo optional */ }
  }

  let out = dedupeEvents(events);
  if (q.entity?.id) out = out.filter((e) => (e.entity.kind === q.entity!.kind && e.entity.id === q.entity!.id) || (q.entity!.kind === "property" && e.propertyId === q.entity!.id));
  return out;
}

/** The AI-planned day (cached 5 min per broker+date). */
export async function getDayPlan(dateIso: string, brokerId?: string | null): Promise<DayPlan> {
  const { orgId, userId } = await ctx();
  const broker = brokerId ?? userId;
  const key = [broker, dateIso.slice(0, 10)];
  if (orgId) { const hit = await getCache<DayPlan>(orgId, "calendar_day", key); if (hit) return hit.value; }
  const day = new Date(dateIso);
  const startIso = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0).toISOString();
  const endIso = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59).toISOString();
  const events = await getCalendarEvents({ brokerId: broker, startIso, endIso });
  const plan = buildDayPlan(events, dateIso);
  if (orgId) await setCache(orgId, "calendar_day", key, plan as unknown as Parameters<typeof setCache>[3], { ttlSeconds: 300 });
  return plan;
}

/** The chronological calendar for one entity (property / buyer / seller / lead). */
export async function getEntityCalendar(kind: EntityKind, id: string, months = 3): Promise<CalendarEvent[]> {
  const now = new Date();
  const startIso = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const endIso = new Date(now.getFullYear(), now.getMonth() + months, 0).toISOString();
  return getCalendarEvents({ startIso, endIso, entity: { kind, id } });
}

/** Office-wide calendar (all brokers) for a range. */
export async function getOfficeCalendar(startIso: string, endIso: string): Promise<CalendarEvent[]> {
  return getCalendarEvents({ startIso, endIso });
}

/** Team availability today (per broker in the org). */
export async function getTeamAvailability(): Promise<BrokerAvailability[]> {
  const { db, orgId } = await ctx();
  if (!orgId) return [];
  const dayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
  const dayEnd = new Date(new Date().setHours(23, 59, 59, 999)).toISOString();
  const { data: usersData } = await db.from("users").select("id,full_name").eq("org_id", orgId).limit(100);
  const users = rows(usersData);
  if (!users.length) return [];
  // Per-broker availability from today's meetings (organizer_id → events).
  const byBroker = new Map<string, CalendarEvent[]>();
  try {
    const { data } = await db.from("meetings").select("id,title,organizer_id,start_at,end_at,type,status,property_id").eq("org_id", orgId).gte("start_at", dayStart).lte("start_at", dayEnd).limit(500);
    for (const r of rows(data)) {
      const bid = s(r.organizer_id); if (!bid) continue;
      const e = normalizeMeeting(r); if (!e) continue;
      const list = byBroker.get(bid) ?? [];
      list.push(e); byBroker.set(bid, list);
    }
  } catch { /* no meetings */ }
  return users.map((u) => availabilityFor(s(u.id) ?? "", s(u.full_name), byBroker.get(s(u.id) ?? "") ?? []));
}

/** Smart reschedule — proposal only, never mutates. */
export async function proposeRescheduleFor(trigger: RescheduleTrigger, brokerId?: string | null, dateIso?: string): Promise<RescheduleProposal> {
  const d = dateIso ? new Date(dateIso) : new Date();
  const startIso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString();
  const endIso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
  const events = await getCalendarEvents({ brokerId, startIso, endIso });
  return proposeReschedule(events, trigger);
}

/** Route optimization for a day's located stops. */
export async function optimizeRouteFor(dateIso: string, brokerId?: string | null): Promise<OptimizedRoute> {
  const d = new Date(dateIso);
  const startIso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString();
  const endIso = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
  const events = (await getCalendarEvents({ brokerId, startIso, endIso })).filter((e) => !e.done);
  const stops: RouteStop[] = events.map((e) => ({ eventId: e.id, title: e.title, lat: e.lat, lng: e.lng, city: e.city }));
  return optimizeRoute(stops);
}

export function getProviderStatuses(): CalendarProviderStatus[] { return providerStatuses(); }

// ── Ask ZONO helpers (scheduling Q&A over the unified stream) ─────────────────
export interface CalendarAsk { answer: string; events: { id: string; title: string; at: string; href: string | null }[] }
export async function answerCalendarQuestion(question: string): Promise<CalendarAsk> {
  const now = new Date();
  const startIso = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
  const endIso = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59).toISOString();
  const events = (await getCalendarEvents({ startIso, endIso })).filter((e) => !e.done);
  const upcoming = events.filter((e) => Date.parse(e.start) >= now.getTime());
  const q = question.toLowerCase();
  const pick = (list: CalendarEvent[], label: string): CalendarAsk => ({
    answer: list.length ? label : "אין אירועים מתאימים בשבוע הקרוב.",
    events: list.slice(0, 8).map((e) => ({ id: e.id, title: e.title, at: e.start, href: e.href })),
  });
  if (/next meeting|פגישה הבאה|הפגישה הבאה/.test(q)) { const m = upcoming.find((e) => e.type === "meeting" || e.type.includes("visit")); return pick(m ? [m] : [], "הפגישה הבאה שלך:"); }
  if (/call now|להתקשר|שיחה|who.*call/.test(q)) return pick(upcoming.filter((e) => e.type === "phone_call" || e.source === "followup").sort((a, b) => b.urgency - a.urgency), "כדאי להתקשר עכשיו:");
  if (/drive|נסיעה|לאן/.test(q)) return pick(upcoming.filter((e) => e.lat != null), "יעדים לנסיעה (לפי סדר):");
  if (/ignored|התעלמ|לא חזרתי/.test(q)) return pick(events.filter((e) => Date.parse(e.start) < now.getTime() && !e.done), "אירועים שעברו וטרם טופלו:");
  if (/free|פנוי|מתי אני/.test(q)) { const p = buildDayPlan(events, startIso); return { answer: p.summary.freeAfter ? `אתה פנוי אחרי ${new Date(p.summary.freeAfter).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}.` : "היום פנוי.", events: [] }; }
  if (/move|לשנות|לדחות|reschedule/.test(q)) { const r = proposeReschedule(events, "manual"); return { answer: r.moved.length ? `הצעה לדחות ${r.moved.length} אירועים פחות דחופים (דורש אישור).` : "אין מה לשנות.", events: r.moved.map((m) => ({ id: m.eventId, title: m.title, at: m.toSuggested ?? "", href: null })) }; }
  // STEP 12 (43.1) — intelligence intents, reusing the pure layer.
  const intent = classifyCalendarIntent(question);
  if (intent === "organize" || intent === "prioritize") { const nb = nextBestActions(events, undefined, now.getTime()); return { answer: nb.length ? "כך כדאי לארגן את היום (לפי עדיפות):" : "היום פנוי — זמן לגיוס ומעקבים.", events: nb.map((a) => ({ id: a.eventId ?? a.title, title: `${a.title} — ${a.why}`, at: "", href: a.href })) }; }
  if (intent === "waste") { const h = calendarHealth(events, undefined, startIso, 1); return { answer: h.busyPct < 40 ? `ניצול נמוך (${h.busyPct}%) — יש זמן פנוי לגיוס/מעקבים.` : h.travelPct > 40 ? `זמן נסיעה גבוה (${h.travelPct}%) — כדאי לאשכל ביקורים גיאוגרפית.` : "היום מנוצל היטב.", events: [] }; }
  if (intent === "overdue") return pick(events.filter((e) => Date.parse(e.start) < now.getTime() && !e.done), "מה שבאיחור:");
  if (intent === "cancel") { const r = proposeReschedule(events, "manual"); return { answer: r.moved.length ? "מועמדים לביטול/דחייה (הפחות דחופים, דורש אישור):" : "אין אירועים לבטל.", events: r.moved.map((m) => ({ id: m.eventId, title: m.title, at: m.toSuggested ?? "", href: null })) }; }
  return pick(upcoming, "האירועים הקרובים שלך:");
}
