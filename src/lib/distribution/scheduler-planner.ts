// ============================================================================
// ZONO — Posting SCHEDULER planner (pure, client + server safe, deterministic).
// ----------------------------------------------------------------------------
// Turns a schedule config (groups × variations + timing rules) into a concrete
// list of planned posts with future scheduled_at timestamps. No DB, no network —
// just the smart-scheduling math, so it is unit-testable and reused by the
// scheduler service. Rules enforced here:
//   • gradual roll-out (one slot at a time, never all groups at once)
//   • variations rotated across groups
//   • the same variation text is never placed in two adjacent slots when avoidable
//   • respect max posts/day, the posting window, the delay, and the date range
// ============================================================================

export type PostingStatus =
  | "draft" | "scheduled" | "queued" | "publishing" | "published" | "failed" | "cancelled";

export const POSTING_STATUSES: PostingStatus[] = [
  "draft", "scheduled", "queued", "publishing", "published", "failed", "cancelled",
];

export interface ScheduleConfig {
  campaignId: string;
  startDate: string;        // ISO datetime — first eligible slot
  windowStartHour: number;  // 0–23, inclusive
  windowEndHour: number;    // 1–24, exclusive
  delayMinutes: number;     // gap between consecutive posts
  maxPostsPerDay: number;   // cap per calendar day
  groupIds: string[];
  variationIds: string[];
  endDate?: string | null;  // campaign range cap (no slot after this)
}

export interface PlannedPost {
  groupId: string;
  variationId: string;
  scheduledAt: string;      // ISO
}

const MINUTE = 60_000;
const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** Assign a variation to every group, rotating across the variation pool. */
export function rotateAssignments(groupIds: string[], variationIds: string[]): { groupId: string; variationId: string }[] {
  if (!variationIds.length) return [];
  return groupIds.map((g, i) => ({ groupId: g, variationId: variationIds[i % variationIds.length] }));
}

/** Reorder assignments so the same variation is never in two adjacent positions
 *  when an alternative exists (avoids duplicate text too close together). */
export function avoidAdjacentDuplicates<T extends { variationId: string }>(items: T[]): T[] {
  const out = [...items];
  for (let i = 1; i < out.length; i++) {
    if (out[i].variationId !== out[i - 1].variationId) continue;
    // find a later item with a different variation to swap in
    const j = out.findIndex((x, k) => k > i && x.variationId !== out[i - 1].variationId);
    if (j !== -1) { const t = out[i]; out[i] = out[j]; out[j] = t; }
  }
  return out;
}

/** Generate `count` future ISO slots honoring window / delay / per-day cap / range. */
export function generateSlots(
  count: number,
  startDate: string,
  windowStartHour: number,
  windowEndHour: number,
  delayMinutes: number,
  maxPostsPerDay: number,
  endDate?: string | null,
  now: Date = new Date(),
): string[] {
  const slots: string[] = [];
  if (count <= 0) return slots;
  const winStart = Math.max(0, Math.min(23, Math.floor(windowStartHour)));
  const winEnd = Math.max(winStart + 1, Math.min(24, Math.floor(windowEndHour)));
  const delay = Math.max(1, Math.floor(delayMinutes));
  const perDay = Math.max(1, Math.floor(maxPostsPerDay));
  const end = endDate ? new Date(endDate) : null;

  // First cursor: not before now, not before the requested start.
  let cur = new Date(startDate);
  if (cur.getTime() < now.getTime()) cur = new Date(now.getTime());
  if (cur.getHours() < winStart) cur.setHours(winStart, 0, 0, 0);
  if (cur.getHours() >= winEnd) { cur.setDate(cur.getDate() + 1); cur.setHours(winStart, 0, 0, 0); }

  let dayKey = ymd(cur);
  let dayCount = 0;
  let guard = 0;
  while (slots.length < count && guard < count * 500 + 1000) {
    guard++;
    if (end && cur.getTime() > end.getTime()) break;
    if (ymd(cur) !== dayKey) { dayKey = ymd(cur); dayCount = 0; }
    // Past the window or day cap → jump to next day's window start.
    if (cur.getHours() >= winEnd || dayCount >= perDay) {
      cur.setDate(cur.getDate() + 1); cur.setHours(winStart, 0, 0, 0);
      dayKey = ymd(cur); dayCount = 0;
      continue;
    }
    if (cur.getHours() < winStart) { cur.setHours(winStart, 0, 0, 0); }
    slots.push(new Date(cur.getTime()).toISOString());
    dayCount++;
    cur = new Date(cur.getTime() + delay * MINUTE);
  }
  return slots;
}

/** Build the full plan: assignments (rotated, de-duplicated) zipped with slots. */
export function planSchedule(config: ScheduleConfig, now: Date = new Date()): PlannedPost[] {
  if (!config.groupIds.length || !config.variationIds.length) return [];
  const assignments = avoidAdjacentDuplicates(rotateAssignments(config.groupIds, config.variationIds));
  const slots = generateSlots(
    assignments.length, config.startDate, config.windowStartHour, config.windowEndHour,
    config.delayMinutes, config.maxPostsPerDay, config.endDate ?? null, now,
  );
  // If the date range truncated the slots, only schedule what fits.
  const n = Math.min(assignments.length, slots.length);
  const planned: PlannedPost[] = [];
  for (let i = 0; i < n; i++) {
    planned.push({ groupId: assignments[i].groupId, variationId: assignments[i].variationId, scheduledAt: slots[i] });
  }
  return planned;
}
