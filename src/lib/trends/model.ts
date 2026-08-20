// ============================================================================
// ZONO — P6.2 Historical Metrics & Trends · canonical model (PURE, client-safe).
// Deterministic trend math shared by every trend surface (Owner Intelligence,
// Product Usage, Customer 360, Revenue) so there is ONE definition of a "day",
// a window, and "sufficient history" — never competing ones.
//
// TIMEZONE RULE: timestamps are stored in UTC everywhere. Day boundaries for
// metrics are defined in ISRAEL local time (Asia/Jerusalem, DST-aware) because
// ZONO operates primarily in Israel. A calendar day = a Jerusalem day. We never
// mix UTC and Israel calendar days: raw instants stay UTC, bucketing is Israel.
//
// NO FABRICATION: series are built only within the actual coverage window; days
// before the data's start are omitted (never rendered as fake zeros implying
// coverage). A metric with too few real days reports insufficientHistory.
// ============================================================================

export const TREND_WINDOWS = [7, 30, 90] as const;
export type TrendWindow = (typeof TREND_WINDOWS)[number];
export const DAY_MS = 86_400_000;
/** Minimum distinct days with data before a trend line is meaningful (else state it). */
export const MIN_HISTORY_DAYS = 3;

const ISRAEL_TZ = "Asia/Jerusalem";
const _fmt = new Intl.DateTimeFormat("en-CA", { timeZone: ISRAEL_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** UTC instant → Israel calendar day key 'YYYY-MM-DD' (DST-aware). Deterministic. */
export function israelDayKey(instant: string | number | Date): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return "";
  return _fmt.format(d); // en-CA yields YYYY-MM-DD
}

/** The Israel day key `offsetDays` before the Israel day containing nowMs. */
export function israelDayKeyBefore(nowMs: number, offsetDays: number): string {
  return israelDayKey(nowMs - offsetDays * DAY_MS);
}

// ── Israel week window (Sunday-anchored, DST-aware) ─────────────────────────
const _wallFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ISRAEL_TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
});
/** Israel UTC offset (ms) at a given instant — DST-aware, dependency-free. */
function israelOffsetMs(instantMs: number): number {
  const parts = _wallFmt.formatToParts(new Date(instantMs));
  const m: Record<string, string> = {};
  for (const p of parts) m[p.type] = p.value;
  const hour = m.hour === "24" ? 0 : Number(m.hour);
  const asUtc = Date.UTC(Number(m.year), Number(m.month) - 1, Number(m.day), hour, Number(m.minute), Number(m.second));
  return asUtc - instantMs;
}
/** Israel weekday index for an instant (Sunday=0 … Saturday=6). */
function israelWeekday(instantMs: number): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: ISRAEL_TZ, weekday: "short" }).format(new Date(instantMs));
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd] ?? 0;
}
/**
 * The current ISRAEL week window, anchored to Sunday 00:00 Asia/Jerusalem (DST-aware).
 * Returns the UTC instant of that Sunday midnight (`sinceIso`) and a stable per-week
 * bucket key (the Israel Sunday date, 'YYYY-MM-DD'). Replaces UTC `floor(ms/WEEK_MS)`
 * bucketing (Thursday-anchored, drift near the Israel Sunday boundary). PURE.
 */
export function israelWeekWindow(nowMs: number): { sinceIso: string; weekBucket: string } {
  const weekdayIdx = israelWeekday(nowMs);
  const sundayKey = israelDayKey(nowMs - weekdayIdx * DAY_MS); // 'YYYY-MM-DD' of this week's Sunday
  const naiveMidnightUtc = Date.parse(`${sundayKey}T00:00:00Z`);
  // Local Israel midnight = naive-UTC-midnight minus the Israel offset at that wall time.
  let sinceMs = naiveMidnightUtc - israelOffsetMs(naiveMidnightUtc);
  const refined = naiveMidnightUtc - israelOffsetMs(sinceMs); // refine once for DST edges
  if (refined !== sinceMs) sinceMs = refined;
  return { sinceIso: new Date(sinceMs).toISOString(), weekBucket: sundayKey };
}

/** Ordered list of Israel day keys for the last `windowDays` (inclusive of today). */
export function dayKeyRange(nowMs: number, windowDays: number): string[] {
  const out: string[] = [];
  for (let i = windowDays - 1; i >= 0; i--) out.push(israelDayKey(nowMs - i * DAY_MS));
  return out;
}

// ── Daily count series (created-per-day / events-per-day) ───────────────────
export interface SeriesPoint { date: string; value: number }
export interface DailySeries {
  points: SeriesPoint[];          // one per Israel day within [coverageStart, today] ∩ window
  total: number;
  windowDays: number;
  coverageStart: string | null;   // first Israel day that actually has data
  distinctDaysWithData: number;
  insufficientHistory: boolean;   // < MIN_HISTORY_DAYS days have data
}

/**
 * Build a daily count series from raw UTC timestamps, bucketed by Israel day,
 * within the last `windowDays`. Days BEFORE the first data point are omitted
 * (no fake zero coverage); gap days AFTER coverage starts are zero-filled.
 */
export function buildDailyCountSeries(timestamps: (string | number | Date)[], nowMs: number, windowDays: number): DailySeries {
  const windowStart = israelDayKey(nowMs - (windowDays - 1) * DAY_MS);
  const counts = new Map<string, number>();
  for (const ts of timestamps) {
    const k = israelDayKey(ts);
    if (!k || k < windowStart || k > israelDayKey(nowMs)) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const daysWithData = Array.from(counts.keys()).sort();
  const coverageStart = daysWithData[0] ?? null;
  const allDays = dayKeyRange(nowMs, windowDays);
  const points: SeriesPoint[] = allDays
    .filter((d) => coverageStart !== null && d >= coverageStart) // omit pre-coverage days
    .map((d) => ({ date: d, value: counts.get(d) ?? 0 }));
  const total = points.reduce((s, p) => s + p.value, 0);
  return { points, total, windowDays, coverageStart, distinctDaysWithData: daysWithData.length, insufficientHistory: daysWithData.length < MIN_HISTORY_DAYS };
}

// ── Daily distinct series (DAU: distinct actor per Israel day) ───────────────
export interface DailyKeyedEvent { key: string | null; occurredAt: string | number | Date }
/** Distinct-key-per-day series (e.g. distinct active users/day, active orgs/day). */
export function buildDailyDistinctSeries(events: DailyKeyedEvent[], nowMs: number, windowDays: number): DailySeries {
  const windowStart = israelDayKey(nowMs - (windowDays - 1) * DAY_MS);
  const perDay = new Map<string, Set<string>>();
  for (const e of events) {
    if (!e.key) continue;
    const k = israelDayKey(e.occurredAt);
    if (!k || k < windowStart || k > israelDayKey(nowMs)) continue;
    (perDay.get(k) ?? perDay.set(k, new Set()).get(k)!).add(e.key);
  }
  const daysWithData = Array.from(perDay.keys()).sort();
  const coverageStart = daysWithData[0] ?? null;
  const points: SeriesPoint[] = dayKeyRange(nowMs, windowDays)
    .filter((d) => coverageStart !== null && d >= coverageStart)
    .map((d) => ({ date: d, value: perDay.get(d)?.size ?? 0 }));
  const total = points.reduce((s, p) => Math.max(s, p.value), 0); // peak for distinct series
  return { points, total, windowDays, coverageStart, distinctDaysWithData: daysWithData.length, insufficientHistory: daysWithData.length < MIN_HISTORY_DAYS };
}

// ── Coverage / freshness (every trend must expose this) ─────────────────────
export interface Coverage { source: string; historyStart: string | null; lastUpdated: string; sufficient: boolean }
export function coverageOf(source: string, series: DailySeries, nowIso: string): Coverage {
  return { source, historyStart: series.coverageStart, lastUpdated: nowIso, sufficient: !series.insufficientHistory };
}

export const INSUFFICIENT_HISTORY_LABEL = "טרם נאספה מספיק היסטוריה";

// ── Adoption: historical (event-based) vs current-state (presence) ──────────
// These are DIFFERENT metrics and must never be blurred:
//   · CURRENT ADOPTION  = org currently has data in a module (presence)
//   · HISTORICAL ADOPTION = org emitted a module event during the period (events)
export type AdoptionKind = "current_presence" | "historical_event";
export interface AdoptionMetric { kind: AdoptionKind; label: string; note: string }
export const ADOPTION_KIND_LABEL: Record<AdoptionKind, string> = {
  current_presence: "אימוץ נוכחי (נוכחות נתונים)",
  historical_event: "אימוץ היסטורי (אירועים בתקופה)",
};
