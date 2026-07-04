// ============================================================================
// 🗓️ ZONO — Calendar OS™ · pure engine. PHASE 43.0.
// Normalizers (source rows → CalendarEvent), dedup, AI day-planner, smart
// reschedule (proposal only), route optimization, availability. Pure &
// deterministic — no I/O. The server service feeds real rows in.
// ============================================================================
import type {
  CalendarEvent, EventType, EntityKind, DayPlan, PlannedSlot,
  RescheduleTrigger, RescheduleProposal, RouteStop, OptimizedRoute,
  BrokerAvailability, AvailabilityState, CalendarProviderStatus, ProviderId,
} from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => { const n = typeof v === "number" ? v : Number(v); return Number.isFinite(n) ? n : null; };
const iso = (v: unknown): string | null => { const t = s(v); if (!t) return null; const d = Date.parse(t); return Number.isFinite(d) ? new Date(d).toISOString() : null; };
const doneStatus = (st: string | null) => !!st && /done|completed|cancelled|closed|converted|sent/i.test(st);

// ── Entity resolution from a row's *_id columns ──────────────────────────────
function entityFrom(r: Row): { kind: EntityKind; id: string | null; name: string | null; propertyId: string | null } {
  const propertyId = s(r.property_id);
  if (s(r.buyer_id)) return { kind: "buyer", id: s(r.buyer_id), name: s(r.entity_name), propertyId };
  if (s(r.seller_id)) return { kind: "seller", id: s(r.seller_id), name: s(r.entity_name), propertyId };
  if (s(r.lead_id)) return { kind: "lead", id: s(r.lead_id), name: s(r.entity_name), propertyId };
  if (propertyId) return { kind: "property", id: propertyId, name: s(r.entity_name), propertyId };
  return { kind: null, id: null, name: s(r.entity_name), propertyId };
}
function hrefFor(kind: EntityKind, id: string | null, propertyId: string | null): string | null {
  if (kind === "buyer" && id) return `/buyers/${id}`;
  if (kind === "seller" && id) return `/sellers/${id}`;
  if (kind === "lead" && id) return `/leads/${id}`;
  if (kind === "property" && id) return `/properties/${id}`;
  if (propertyId) return `/properties/${propertyId}`;
  return null;
}

// ── Type classification ──────────────────────────────────────────────────────
function meetingType(rawType: string | null, kind: EntityKind): EventType {
  const t = (rawType ?? "").toLowerCase();
  if (/visit|showing|צפ|ביקור/.test(t)) return kind === "buyer" ? "buyer_visit" : "property_visit";
  if (/call|phone|טלפון/.test(t)) return "phone_call";
  if (/open.?house|בית פתוח/.test(t)) return "open_house";
  if (/photo|צילום/.test(t)) return "photo_day";
  if (/sign|חתימה/.test(t)) return "signature";
  if (kind === "seller") return "seller_meeting";
  return "meeting";
}
function planType(pt: string | null): EventType {
  const t = (pt ?? "").toLowerCase();
  if (/photo|צילום/.test(t)) return "photo_day";
  if (/open.?house|בית פתוח/.test(t)) return "open_house";
  if (/facebook|פייסבוק/.test(t)) return "facebook_publish";
  if (/market|קמפיין|שיווק/.test(t)) return "marketing_campaign";
  if (/doc|מסמך|חתימה|sign/.test(t)) return "document_deadline";
  if (/call|שיחה/.test(t)) return "phone_call";
  return "property_visit";
}

// ── urgency: closeness-to-due blended with priority ──────────────────────────
export function urgencyFor(startIso: string, priority: number, now: number): number {
  const t = Date.parse(startIso);
  if (!Number.isFinite(t)) return Math.round(priority * 0.6);
  const hours = (t - now) / 3_600_000;
  let proximity: number;
  if (hours < 0) proximity = 100;                    // overdue
  else if (hours <= 2) proximity = 95;
  else if (hours <= 24) proximity = 80;
  else if (hours <= 72) proximity = 55;
  else if (hours <= 168) proximity = 35;
  else proximity = 15;
  return Math.max(0, Math.min(100, Math.round(proximity * 0.6 + priority * 0.4)));
}

// ── Normalizers (each returns null if it has no usable date) ──────────────────
export function normalizeMeeting(r: Row, now = Date.now()): CalendarEvent | null {
  const start = iso(r.start_at); if (!start) return null;
  const e = entityFrom(r); const priority = 70;
  const type = meetingType(s(r.type), e.kind);
  const status = s(r.status);
  return {
    id: `meeting:${s(r.id)}`, source: "meeting", type, title: s(r.title) ?? "פגישה", detail: e.name,
    start, end: iso(r.end_at), allDay: false, status, done: doneStatus(status),
    priority, urgency: urgencyFor(start, priority, now), entity: { kind: e.kind, id: e.id, name: e.name },
    propertyId: e.propertyId, city: s(r.city), lat: num(r.lat), lng: num(r.lng),
    href: hrefFor(e.kind, e.id, e.propertyId), locked: true,
  };
}
export function normalizeTask(r: Row, now = Date.now()): CalendarEvent | null {
  const start = iso(r.due_at); if (!start) return null;
  const e = entityFrom(r); const priority = num(r.priority) ?? 50;
  const status = s(r.status);
  return {
    id: `task:${s(r.id)}`, source: "task", type: "task", title: s(r.title) ?? "משימה", detail: e.name,
    start, end: null, allDay: false, status, done: doneStatus(status),
    priority, urgency: urgencyFor(start, priority, now), entity: { kind: e.kind, id: e.id, name: e.name },
    propertyId: e.propertyId, city: null, lat: null, lng: null, href: hrefFor(e.kind, e.id, e.propertyId), locked: true,
  };
}
export function normalizeMission(r: Row, now = Date.now()): CalendarEvent | null {
  const start = iso(r.due_at); if (!start) return null;
  const kind = (s(r.entity_type) as EntityKind) ?? null;
  const id = s(r.entity_id); const priority = num(r.priority) ?? 60;
  const status = s(r.status);
  return {
    id: `mission:${s(r.id)}`, source: "mission", type: "mission", title: s(r.entity_name) ? `${s(r.mission_type) ?? "משימה"} · ${s(r.entity_name)}` : (s(r.mission_type) ?? "משימת AI"),
    detail: s(r.entity_name), start, end: null, allDay: false, status, done: doneStatus(status),
    priority, urgency: urgencyFor(start, priority, now), entity: { kind, id, name: s(r.entity_name) },
    propertyId: kind === "property" ? id : null, city: null, lat: null, lng: null,
    href: hrefFor(kind, id, kind === "property" ? id : null), locked: true,
  };
}
export function normalizeFollowup(r: Row, kind: "communication" | "whatsapp" | "social" | "radar", now = Date.now()): CalendarEvent | null {
  const start = iso(r.due_at ?? r.scheduled_at); if (!start) return null;
  const e = entityFrom(r); const priority = num(r.priority) ?? 55;
  const type: EventType = kind === "whatsapp" ? "whatsapp_followup" : kind === "social" ? "phone_call" : "reminder";
  const status = s(r.status);
  const title = s(r.title) ?? (kind === "whatsapp" ? "מעקב וואטסאפ" : kind === "radar" ? (s(r.action) ?? "מעקב מוכר") : "מעקב");
  return {
    id: `followup:${kind}:${s(r.id)}`, source: "followup", type, title, detail: s(r.reason) ?? e.name,
    start, end: null, allDay: false, status, done: doneStatus(status),
    priority, urgency: urgencyFor(start, priority, now), entity: { kind: e.kind, id: e.id, name: e.name },
    propertyId: e.propertyId, city: null, lat: null, lng: null, href: hrefFor(e.kind, e.id, e.propertyId), locked: true,
  };
}
export function normalizePropertyPlan(r: Row, now = Date.now()): CalendarEvent | null {
  const start = iso(r.suggested_date); if (!start) return null;
  const pid = s(r.property_id); const priority = num(r.priority) ?? 45;
  const status = s(r.status);
  return {
    id: `property_plan:${s(r.id)}`, source: "property_plan", type: planType(s(r.plan_type)),
    title: s(r.title) ?? "אירוע נכס", detail: s(r.description), start, end: null, allDay: true,
    status, done: doneStatus(status), priority, urgency: urgencyFor(start, priority, now),
    entity: { kind: "property", id: pid, name: null }, propertyId: pid,
    city: null, lat: null, lng: null, href: pid ? `/properties/${pid}` : null, locked: true,
  };
}

// ── Dedup + sort (single source of truth) ────────────────────────────────────
export function dedupeEvents(events: CalendarEvent[]): CalendarEvent[] {
  const byId = new Map<string, CalendarEvent>();
  for (const e of events) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export function inRange(events: CalendarEvent[], startIso: string, endIso: string): CalendarEvent[] {
  const a = Date.parse(startIso), b = Date.parse(endIso);
  return events.filter((e) => { const t = Date.parse(e.start); return t >= a && t <= b; });
}

// ── AI day planner ───────────────────────────────────────────────────────────
export function buildDayPlan(events: CalendarEvent[], dateIso: string, now = Date.now()): DayPlan {
  const day = new Date(dateIso); const y = day.getFullYear(), m = day.getMonth(), d = day.getDate();
  const dayStart = new Date(y, m, d, 0, 0, 0).toISOString();
  const dayEnd = new Date(y, m, d, 23, 59, 59).toISOString();
  const todays = inRange(events, dayStart, dayEnd).filter((e) => !e.done);

  const scored = todays.map((event) => {
    const score = Math.round(event.urgency * 0.5 + event.priority * 0.3 + (event.type === "meeting" || event.type.includes("visit") ? 20 : event.source === "mission" ? 12 : 6));
    const reasons: string[] = [];
    if (event.urgency >= 80) reasons.push("דחיפות גבוהה");
    if (event.type === "meeting" || event.type.includes("visit")) reasons.push("פגישה/ביקור מתוזמן");
    if (event.entity.kind === "seller") reasons.push("מוכר");
    if (event.entity.kind === "buyer") reasons.push("קונה");
    return { event, score, reason: reasons.join(" · ") || "לפי סדר היום" };
  }).sort((a, b) => (b.score - a.score) || (Date.parse(a.event.start) - Date.parse(b.event.start)));

  const slots: PlannedSlot[] = scored.map((x, i) => ({ event: x.event, rank: i + 1, score: x.score, reason: x.reason, suggestedStart: x.event.start }));
  const meetings = todays.filter((e) => e.type === "meeting" || e.type.includes("visit") || e.type === "seller_meeting").length;
  const tasks = todays.filter((e) => e.source === "task" || e.source === "mission" || e.source === "followup").length;
  const overdue = todays.filter((e) => Date.parse(e.start) < now && !e.done).length;
  const lastEnd = todays.map((e) => Date.parse(e.end ?? e.start)).sort((a, b) => b - a)[0];
  return { date: dateIso.slice(0, 10), slots, summary: { total: todays.length, meetings, tasks, overdue, freeAfter: lastEnd ? new Date(lastEnd).toISOString() : null } };
}

// ── Smart reschedule — PROPOSAL ONLY, never mutates ──────────────────────────
export function proposeReschedule(events: CalendarEvent[], trigger: RescheduleTrigger, now = Date.now()): RescheduleProposal {
  const candidates = events.filter((e) => !e.done && Date.parse(e.start) >= now)
    .sort((a, b) => (a.urgency - b.urgency) || (a.priority - b.priority));
  const lowFirst = candidates.slice(0, 3); // least urgent get bumped
  const moved = lowFirst.map((e) => ({
    eventId: e.id, title: e.title, from: e.start,
    toSuggested: new Date(Date.parse(e.start) + 24 * 3_600_000).toISOString(),
    why: trigger === "new_hot_lead" ? "פינוי זמן לליד חם" : trigger === "seller_at_risk" ? "עדיפות למוכר בסיכון" : trigger === "traffic" ? "עומס תנועה — דחיית פגישה פחות דחופה" : trigger === "meeting_cancelled" ? "ניצול חלון שהתפנה" : "אופטימיזציה של היום",
  }));
  return { trigger, moved, note: "הצעה בלבד — שום דבר לא שונה אוטומטית. דורש אישור." };
}

// ── Route optimization (nearest-neighbour, haversine) ────────────────────────
function km(a: RouteStop, b: RouteStop): number {
  if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) return 0;
  const R = 6371, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 10) / 10;
}
export function optimizeRoute(stops: RouteStop[]): OptimizedRoute {
  const located = stops.filter((s2) => s2.lat != null && s2.lng != null);
  const unlocated = stops.filter((s2) => s2.lat == null || s2.lng == null);
  if (located.length <= 1) return { order: located, totalKm: 0, legs: [], unlocated };
  const remaining = [...located]; const order: RouteStop[] = [remaining.shift()!];
  while (remaining.length) {
    const last = order[order.length - 1];
    let bi = 0, bd = Infinity;
    remaining.forEach((cand, i) => { const d = km(last, cand); if (d < bd) { bd = d; bi = i; } });
    order.push(remaining.splice(bi, 1)[0]);
  }
  const legs = order.slice(1).map((stop, i) => ({ fromTitle: order[i].title, toTitle: stop.title, km: km(order[i], stop) }));
  const totalKm = Math.round(legs.reduce((t, l) => t + l.km, 0) * 10) / 10;
  return { order, totalKm, legs, unlocated };
}

// ── Team availability (derived from a broker's events) ───────────────────────
export function availabilityFor(brokerId: string, name: string | null, events: CalendarEvent[], now = Date.now()): BrokerAvailability {
  const todayStart = new Date(new Date(now).setHours(0, 0, 0, 0)).getTime();
  const todayEnd = todayStart + 86_400_000;
  const today = events.filter((e) => { const t = Date.parse(e.start); return t >= todayStart && t < todayEnd; });
  const activeNow = today.find((e) => { const st = Date.parse(e.start), en = Date.parse(e.end ?? e.start) + (e.end ? 0 : 30 * 60_000); return st <= now && now <= en && !e.done; });
  let state: AvailabilityState = "free";
  if (activeNow) state = activeNow.type.includes("visit") || activeNow.type === "property_visit" ? "field" : "meeting";
  else if (today.some((e) => !e.done && Date.parse(e.start) >= now)) state = "busy";
  const nextFree = today.filter((e) => !e.done && Date.parse(e.end ?? e.start) >= now).map((e) => Date.parse(e.end ?? e.start) + (e.end ? 0 : 30 * 60_000)).sort((a, b) => a - b)[0];
  return { brokerId, name, state, nextFreeAt: nextFree ? new Date(nextFree).toISOString() : null, todayEvents: today.length };
}

// ── Provider registry (interface-only; nothing connected in foundation) ──────
export function providerStatuses(): CalendarProviderStatus[] {
  const mk = (id: ProviderId, label: string): CalendarProviderStatus => ({ id, label, connected: false, note: "מוכן לחיבור עתידי — לא מחובר." });
  return [mk("google", "Google Calendar"), mk("microsoft", "Outlook / Microsoft 365"), mk("ical", "iCal")];
}
