// ============================================================================
// ⚙️ ZONO — Calendar OS™ · broker availability preferences (pure). PHASE 43.2.
// Configurable working hours / days / lunch / buffers. Persisted in the EXISTING
// users.settings jsonb (no schema change). Pure model + merge + frame builder;
// the service reads/writes users.settings.calendar.
// ============================================================================
import { DEFAULT_FRAME, type WorkFrame } from "./intelligence";

export interface BlockedTime { day: number | null; start: string; end: string; label: string } // day 0-6 or null=every day; start/end "HH:MM"

export interface AvailabilityPrefs {
  workDays: number[];            // 0=Sun … 6=Sat (IL work week default Sun–Thu)
  startHour: number;             // 0..24
  endHour: number;
  lunchStart: number;
  lunchEnd: number;
  defaultMeetingMinutes: number; // default duration
  travelBufferMinutes: number;   // gap between geo-separated events
  maxDailyMeetings: number;
  preferredAreas: string[];
  blocked: BlockedTime[];
}

export const DEFAULT_PREFS: AvailabilityPrefs = {
  workDays: [0, 1, 2, 3, 4],     // Sun–Thu
  startHour: DEFAULT_FRAME.startHour, endHour: DEFAULT_FRAME.endHour,
  lunchStart: DEFAULT_FRAME.lunchStart, lunchEnd: DEFAULT_FRAME.lunchEnd,
  defaultMeetingMinutes: 45, travelBufferMinutes: 30, maxDailyMeetings: 8,
  preferredAreas: [], blocked: [],
};

const clampH = (n: unknown, d: number) => (typeof n === "number" && n >= 0 && n <= 24 ? n : d);
const clampInt = (n: unknown, d: number, min: number, max: number) => (typeof n === "number" && n >= min && n <= max ? Math.round(n) : d);

/** Merge a stored (partial, untrusted jsonb) prefs blob onto the defaults. */
export function mergePrefs(stored: unknown): AvailabilityPrefs {
  const s = (stored && typeof stored === "object" ? stored : {}) as Partial<AvailabilityPrefs>;
  const start = clampH(s.startHour, DEFAULT_PREFS.startHour);
  let end = clampH(s.endHour, DEFAULT_PREFS.endHour);
  if (end <= start) end = DEFAULT_PREFS.endHour;
  return {
    workDays: Array.isArray(s.workDays) && s.workDays.every((d) => typeof d === "number" && d >= 0 && d <= 6) && s.workDays.length ? [...new Set(s.workDays)].sort() : DEFAULT_PREFS.workDays,
    startHour: start, endHour: end,
    lunchStart: clampH(s.lunchStart, DEFAULT_PREFS.lunchStart),
    lunchEnd: clampH(s.lunchEnd, DEFAULT_PREFS.lunchEnd),
    defaultMeetingMinutes: clampInt(s.defaultMeetingMinutes, DEFAULT_PREFS.defaultMeetingMinutes, 15, 240),
    travelBufferMinutes: clampInt(s.travelBufferMinutes, DEFAULT_PREFS.travelBufferMinutes, 0, 180),
    maxDailyMeetings: clampInt(s.maxDailyMeetings, DEFAULT_PREFS.maxDailyMeetings, 1, 30),
    preferredAreas: Array.isArray(s.preferredAreas) ? s.preferredAreas.filter((x): x is string => typeof x === "string").slice(0, 20) : [],
    blocked: Array.isArray(s.blocked) ? (s.blocked as BlockedTime[]).filter((b) => b && typeof b.start === "string" && typeof b.end === "string").slice(0, 50) : [],
  };
}

/** Build the WorkFrame the intelligence layer consumes. */
export function frameFromPrefs(p: AvailabilityPrefs): WorkFrame {
  return { startHour: p.startHour, endHour: p.endHour, lunchStart: p.lunchStart, lunchEnd: p.lunchEnd };
}

/** Is a given ISO datetime inside a working day + hours (and not blocked)? */
export function isWorkingTime(iso: string, p: AvailabilityPrefs): boolean {
  const d = new Date(iso); const dow = d.getDay(); const h = d.getHours() + d.getMinutes() / 60;
  if (!p.workDays.includes(dow)) return false;
  if (h < p.startHour || h >= p.endHour) return false;
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  for (const b of p.blocked) { if ((b.day == null || b.day === dow) && hhmm >= b.start && hhmm < b.end) return false; }
  return true;
}
