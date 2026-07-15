// ============================================================================
// 🗓️ ZONO — BROKER INTELLIGENCE · Today Agenda (PURE).
// Phase 2 of the Broker Operating System. Turns the ONE shared priority queue
// into a real chronological workday — "09:00 התקשר לבעלים · 09:30 שלח נכס
// לקונה · 10:00 הכנה לפגישה · 14:00 רענון שיווק · 16:00 בדיקת מחיר".
// NOT a dashboard, NOT a flat task list: an ordered day the broker can just
// follow. Deterministic + offline-testable — no new recommendation model, it
// only SCHEDULES what the shared queue already decided.
// ============================================================================
import type { PrioritizedRecommendation } from "./priority";
import { actionClass } from "./priority";

/** A single scheduled block in the broker's day. */
export interface AgendaSlot {
  /** "09:00" — 24h, zero-padded. */
  startTime: string;
  /** "09:20" — start + duration. */
  endTime: string;
  /** Minutes allotted (by action class). */
  durationMin: number;
  /** The recommendation being acted on (carries all evidence + why). */
  rec: PrioritizedRecommendation;
  /** Coarse action class (call/send/price/…) — drives duration + icon. */
  kind: string;
  /** TRUE when this slot's end time is already in the past (vs `now`). */
  past: boolean;
}

export interface BrokerAgenda {
  slots: AgendaSlot[];
  /** How many queue items didn't fit the workday window. */
  overflow: number;
  /** First actionable time of day, or null when the day is empty. */
  firstActionTime: string | null;
  /** Total planned minutes across all slots. */
  plannedMinutes: number;
}

export interface AgendaOptions {
  /** Workday start hour (default 09:00). */
  dayStartHour?: number;
  /** Workday end hour (default 18:00) — items past this overflow. */
  dayEndHour?: number;
  /** Lunch hour kept clear (default 13 → 13:00–14:00). null disables. */
  lunchHour?: number | null;
  /** "now" for marking past slots — pass a Date; omitted → nothing marked past. */
  now?: Date;
  /** Max slots to schedule (keeps the day realistic). Default 8. */
  maxSlots?: number;
}

/** Minutes each action class realistically needs. Deterministic, not guessed. */
const DURATION: Record<string, number> = {
  call: 20,
  send: 15,
  price: 30,
  marketing: 25,
  mortgage: 20,
  meeting: 45,
  document: 30,
  wait: 10,
  // Batch 5.6E — unblocking a stalled canonical journey: review what's holding
  // the stage, then advance it. Explicit rather than riding DEFAULT_DURATION.
  journey: 25,
};
const DEFAULT_DURATION = 20;

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function fmt(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${pad(h)}:${pad(m)}`;
}

/**
 * Schedule the queue into a chronological day. The queue is ALREADY sorted by
 * business-impact priority, so the highest-impact action lands first thing in
 * the morning and the day flows down from there. Pure + deterministic.
 */
export function buildAgenda(
  items: PrioritizedRecommendation[],
  opts: AgendaOptions = {},
): BrokerAgenda {
  const dayStartHour = opts.dayStartHour ?? 9;
  const dayEndHour = opts.dayEndHour ?? 18;
  const lunchHour = opts.lunchHour === undefined ? 13 : opts.lunchHour;
  const maxSlots = opts.maxSlots ?? 8;

  const dayStart = dayStartHour * 60;
  const dayEnd = dayEndHour * 60;
  const lunchStart = lunchHour == null ? null : lunchHour * 60;
  const lunchEnd = lunchStart == null ? null : lunchStart + 60;
  const nowMinutes = opts.now ? opts.now.getHours() * 60 + opts.now.getMinutes() : null;

  const slots: AgendaSlot[] = [];
  let cursor = dayStart;
  let overflow = 0;
  let plannedMinutes = 0;

  for (const rec of items) {
    if (slots.length >= maxSlots) { overflow++; continue; }
    const kind = actionClass(rec);
    const durationMin = DURATION[kind] ?? DEFAULT_DURATION;

    // Jump the cursor past lunch if the block would collide with it.
    if (lunchStart != null && lunchEnd != null && cursor < lunchEnd && cursor + durationMin > lunchStart) {
      cursor = lunchEnd;
    }

    // Past the end of the workday → it overflows (honest: we don't cram it).
    if (cursor + durationMin > dayEnd) { overflow++; continue; }

    const end = cursor + durationMin;
    slots.push({
      startTime: fmt(cursor),
      endTime: fmt(end),
      durationMin,
      rec,
      kind,
      past: nowMinutes != null && end <= nowMinutes,
    });
    plannedMinutes += durationMin;
    cursor = end;
  }

  return {
    slots,
    overflow,
    firstActionTime: slots.length ? slots[0].startTime : null,
    plannedMinutes,
  };
}
