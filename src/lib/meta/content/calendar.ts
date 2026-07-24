// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · CALENDAR FOUNDATION (PURE). Phase 2.
// ----------------------------------------------------------------------------
// Editorial planning ONLY. Builds month/week/day/unscheduled read models from
// drafts + their planned times. It NEVER creates a publishing job, runs a
// scheduler, or calls a Meta scheduled-post endpoint — `planned_at` is planning
// metadata. Pure and deterministic (dates supplied by the caller).
// ============================================================================
import type { DraftStatus } from "./domain";

export interface CalendarItem {
  draftId: string;
  internalName: string;
  status: DraftStatus;
  approvalState: string;
  plannedAt: string | null;
  timezone: string | null;
  platforms: readonly string[];
  contentKinds: readonly string[];
  readiness: "ready" | "warning" | "invalid" | "unknown";
  /** True when another item shares the same planned minute (soft conflict). */
  conflict: boolean;
}

export interface CalendarModel {
  scheduled: readonly CalendarItem[];
  unscheduled: readonly CalendarItem[];
}

const minuteKey = (iso: string) => iso.slice(0, 16); // YYYY-MM-DDTHH:MM

/** Build the calendar read model; flags soft conflicts (same planned minute). */
export function buildCalendar(items: readonly CalendarItem[]): CalendarModel {
  const scheduledRaw = items.filter((i) => i.plannedAt);
  const counts = new Map<string, number>();
  for (const i of scheduledRaw) { const k = minuteKey(i.plannedAt!); counts.set(k, (counts.get(k) ?? 0) + 1); }
  const scheduled = scheduledRaw
    .map((i) => ({ ...i, conflict: (counts.get(minuteKey(i.plannedAt!)) ?? 0) > 1 }))
    .sort((a, b) => (a.plannedAt! < b.plannedAt! ? -1 : 1));
  const unscheduled = items.filter((i) => !i.plannedAt);
  return { scheduled, unscheduled };
}

/** Filter a calendar model to a [fromIso, toIso) window (month/week/day view). */
export function calendarWindow(model: CalendarModel, fromIso: string, toIso: string): readonly CalendarItem[] {
  return model.scheduled.filter((i) => i.plannedAt! >= fromIso && i.plannedAt! < toIso);
}
