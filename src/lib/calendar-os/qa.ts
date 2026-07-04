// ============================================================================
// 🗓️ ZONO — Calendar OS™ · pure self-check (offline). PHASE 43.0.
// Proves: no duplicated events, no orphan events (every event has a date),
// planner ordering, reschedule is proposal-only, route ordering.
// ============================================================================
import {
  normalizeMeeting, normalizeTask, normalizeMission, normalizeFollowup, normalizePropertyPlan,
  dedupeEvents, buildDayPlan, proposeReschedule, optimizeRoute, availabilityFor, providerStatuses,
} from "./engine";
import type { CalendarEvent, RouteStop } from "./types";

export interface CCheck { name: string; pass: boolean; detail: string }
export interface CSelfCheck { ok: boolean; total: number; passed: number; checks: CCheck[] }

export function runSelfCheck(): CSelfCheck {
  const checks: CCheck[] = [];
  const add = (n: string, p: boolean, d = "") => checks.push({ name: n, pass: p, detail: d });
  const NOW = Date.parse("2026-07-04T08:00:00.000Z");
  const inH = (h: number) => new Date(NOW + h * 3_600_000).toISOString();

  // Normalizers
  const meeting = normalizeMeeting({ id: "m1", title: "פגישת קונה", start_at: inH(2), end_at: inH(3), type: "visit", buyer_id: "b1", property_id: "p1", status: "scheduled" }, NOW);
  add("meeting: normalized to buyer_visit + href", !!meeting && meeting.type === "buyer_visit" && meeting.href === "/buyers/b1" && meeting.source === "meeting");
  const task = normalizeTask({ id: "t1", title: "להתקשר למוכר", due_at: inH(1), priority: 80, seller_id: "s1", status: "open" }, NOW);
  add("task: normalized + urgency high (soon+priority)", !!task && task.type === "task" && task.urgency >= 70 && task.href === "/sellers/s1");
  const mission = normalizeMission({ id: "mi1", entity_type: "property", entity_id: "p9", entity_name: "רחוב הרצל", mission_type: "גיוס", due_at: inH(5), priority: 60, status: "active" }, NOW);
  add("mission: normalized + property href", !!mission && mission.source === "mission" && mission.href === "/properties/p9");
  const fu = normalizeFollowup({ id: "f1", due_at: inH(4), status: "pending", lead_id: "l1" }, "whatsapp", NOW);
  add("followup(whatsapp): normalized", !!fu && fu.type === "whatsapp_followup" && fu.href === "/leads/l1");
  const plan = normalizePropertyPlan({ id: "pp1", property_id: "p1", title: "יום צילום", plan_type: "photo", suggested_date: inH(26), status: "pending" }, NOW);
  add("property plan: photo_day allDay", !!plan && plan.type === "photo_day" && plan.allDay === true);

  // Orphan safety — an event with no date returns null (never becomes an orphan)
  add("orphan-safe: no date → null", normalizeMeeting({ id: "x", title: "z", start_at: null }, NOW) === null && normalizeTask({ id: "y", due_at: "" }, NOW) === null);

  const all: CalendarEvent[] = [meeting!, task!, mission!, fu!, plan!];
  add("no orphan events: every event has a parseable start", all.every((e) => Number.isFinite(Date.parse(e.start))));

  // Dedup — same source id must collapse
  const deduped = dedupeEvents([meeting!, meeting!, task!, task!, mission!]);
  add("no duplicated events: dedup by source id", deduped.length === 3);
  add("dedup: sorted by start ascending", Date.parse(deduped[0].start) <= Date.parse(deduped[1].start));

  // Day planner — soonest/most-urgent first, counts correct
  const plans = buildDayPlan(all, inH(0), NOW);
  add("planner: only today's undone events", plans.slots.length === all.filter((e) => new Date(Date.parse(e.start)).toDateString() === new Date(NOW).toDateString()).length);
  add("planner: ranked (rank 1 exists, scores desc)", plans.slots[0]?.rank === 1 && (plans.slots.length < 2 || plans.slots[0].score >= plans.slots[1].score));
  add("planner: summary counts meetings+tasks", plans.summary.meetings >= 1 && plans.summary.tasks >= 1);

  // Reschedule — proposal only, includes the approval note
  const resc = proposeReschedule(all, "new_hot_lead", NOW);
  add("reschedule: proposal only + approval note", resc.moved.length > 0 && /דורש אישור/.test(resc.note) && resc.trigger === "new_hot_lead");
  add("reschedule: does not mutate source events (dates unchanged)", meeting!.start === inH(2));

  // Route — nearest-neighbour orders, unlocated appended
  const stops: RouteStop[] = [
    { eventId: "a", title: "תל אביב", lat: 32.08, lng: 34.78, city: "ת\"א" },
    { eventId: "b", title: "חיפה", lat: 32.79, lng: 34.99, city: "חיפה" },
    { eventId: "c", title: "הרצליה", lat: 32.16, lng: 34.84, city: "הרצליה" },
    { eventId: "d", title: "ללא מיקום", lat: null, lng: null, city: null },
  ];
  const route = optimizeRoute(stops);
  add("route: nearest-neighbour (TA→Herzliya before Haifa)", route.order.map((o) => o.eventId).slice(0, 3).join(",") === "a,c,b");
  add("route: unlocated kept separately + totalKm computed", route.unlocated.length === 1 && route.totalKm > 0);

  // Availability
  const busy = availabilityFor("br1", "דנה", [meeting!], NOW);
  add("availability: derived state + today count", (busy.state === "busy" || busy.state === "meeting" || busy.state === "field") && busy.todayEvents >= 1);

  // Provider abstraction — interface only, nothing connected
  add("providers: google+outlook present, none connected", providerStatuses().length === 3 && providerStatuses().every((p) => !p.connected));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
