// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.8) · TIMEZONE RESOLUTION (PURE). Phase 3B.
// ----------------------------------------------------------------------------
// DST-DETERMINISTIC conversion between a wall-clock local datetime + IANA zone
// and a UTC instant, built ONLY on the standard `Intl.DateTimeFormat` timeZone
// facility — no date library, no hand-rolled offset tables (which rot). A
// scheduled time is NEVER represented by a naive local string alone: we resolve
// (and the caller persists) the UTC instant, the IANA zone, the originating
// wall-clock string, and the concrete offset, so the same intent replays
// identically across a DST boundary. Spring-forward gaps and fall-back ambiguity
// are detected and resolved deterministically (gap → shift forward; ambiguous →
// earlier occurrence) and surfaced so the UI can warn. Every function is pure:
// it takes explicit epoch inputs and returns plain data (no ambient clock read).
// ============================================================================

export interface LocalDateTime {
  year: number; month: number; day: number; hour: number; minute: number; second: number;
}

export type TimeAnomaly = "none" | "nonexistent_gap" | "ambiguous_fold";

export interface ResolvedInstant {
  /** UTC epoch milliseconds — the canonical instant to store + compare. */
  epochMs: number;
  /** UTC ISO-8601 string for the resolved instant. */
  utcIso: string;
  /** The IANA zone used for resolution. */
  timeZone: string;
  /** The originating wall-clock local string (minute precision, no offset). */
  localDateTime: string;
  /** The concrete UTC offset (minutes east of UTC) in effect at the instant. */
  offsetMinutes: number;
  /** DST anomaly classification of the requested wall-clock time. */
  anomaly: TimeAnomaly;
  /** Whether the zone string was a usable IANA identifier. */
  validZone: boolean;
}

/** A safe-to-store, minute-precision wall-clock string, e.g. "2027-03-14T02:30". */
export function formatLocalDateTime(l: LocalDateTime): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${String(l.year).padStart(4, "0")}-${p2(l.month)}-${p2(l.day)}T${p2(l.hour)}:${p2(l.minute)}`;
}

/** Parse "YYYY-MM-DDTHH:MM[:SS]" into components (no zone). Null if malformed. */
export function parseLocalDateTime(s: string): LocalDateTime | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const l: LocalDateTime = { year: +y, month: +mo, day: +d, hour: +h, minute: +mi, second: se ? +se : 0 };
  if (l.month < 1 || l.month > 12 || l.day < 1 || l.day > 31 || l.hour > 23 || l.minute > 59 || l.second > 59) return null;
  return l;
}

/** Is a string a usable IANA timezone id (validated via Intl, not a hardcoded list)? */
export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone || typeof timeZone !== "string") return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone }); return true; } catch { return false; }
}

const partsFmt = (timeZone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

/**
 * The zone's UTC offset (minutes east of UTC) at a given UTC instant, computed by
 * formatting that instant in the zone and differencing the wall clock from UTC.
 */
export function zoneOffsetMinutes(timeZone: string, epochMs: number): number {
  const parts = partsFmt(timeZone).formatToParts(new Date(epochMs));
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  let hour = map.hour; if (hour === 24) hour = 0; // some engines emit "24" for midnight
  const asUtc = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return Math.round((asUtc - epochMs) / 60000);
}

/**
 * Resolve a wall-clock local datetime in an IANA zone to a UTC instant,
 * DST-deterministically. The two-pass offset refinement pins the correct side of
 * a DST transition; gap/fold anomalies are detected and resolved by convention.
 */
export function resolveLocalToUtc(local: LocalDateTime, timeZone: string): ResolvedInstant {
  const localStr = formatLocalDateTime(local);
  if (!isValidTimeZone(timeZone)) {
    // Fail closed to UTC interpretation, flagged invalid — the service rejects this.
    const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    return { epochMs: asUtc, utcIso: new Date(asUtc).toISOString(), timeZone, localDateTime: localStr, offsetMinutes: 0, anomaly: "none", validZone: false };
  }
  const asUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  // Probe the offsets in effect well before and well after this wall time. When
  // they differ, a DST transition sits nearby and the wall time may be a gap
  // (non-existent) or a fold (ambiguous). Two candidate instants — one per offset
  // — are round-tripped back to wall clock to classify deterministically.
  const PROBE = 6 * 3600_000;
  const offEarly = zoneOffsetMinutes(timeZone, asUtc - PROBE);
  const offLate = zoneOffsetMinutes(timeZone, asUtc + PROBE);
  const candA = asUtc - offEarly * 60000; // interpret with the pre-transition offset
  const candB = asUtc - offLate * 60000;  // interpret with the post-transition offset
  const wall = formatLocalDateTime(local);
  const matchesA = formatLocalDateTime(formatInstant(candA, timeZone)) === wall;
  const matchesB = formatLocalDateTime(formatInstant(candB, timeZone)) === wall;

  let epochMs: number; let anomaly: TimeAnomaly = "none";
  if (offEarly !== offLate && matchesA && matchesB) {
    // Both offsets yield the requested wall clock → fall-back fold. Pick the
    // EARLIER occurrence (pre-transition offset) deterministically.
    epochMs = candA; anomaly = "ambiguous_fold";
  } else if (offEarly !== offLate && !matchesA && !matchesB) {
    // Neither offset yields the wall clock → spring-forward gap. Shift forward
    // (pre-transition offset), keeping a deterministic instant, and flag it.
    epochMs = candA; anomaly = "nonexistent_gap";
  } else if (matchesA) {
    epochMs = candA;
  } else if (matchesB) {
    epochMs = candB;
  } else {
    epochMs = asUtc - offEarly * 60000;
  }
  const finalOffset = zoneOffsetMinutes(timeZone, epochMs);
  return { epochMs, utcIso: new Date(epochMs).toISOString(), timeZone, localDateTime: localStr, offsetMinutes: finalOffset, anomaly, validZone: true };
}

/** Format a UTC instant as the wall-clock components observed in a zone. */
export function formatInstant(epochMs: number, timeZone: string): LocalDateTime {
  const parts = partsFmt(timeZone).formatToParts(new Date(epochMs));
  const map: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = Number(p.value);
  let hour = map.hour; if (hour === 24) hour = 0;
  return { year: map.year, month: map.month, day: map.day, hour, minute: map.minute, second: map.second };
}

export interface LeadTimePolicy { minLeadMs: number; maxLeadMs: number }

export type ScheduleTimeValidation =
  | { ok: true; instant: ResolvedInstant }
  | { ok: false; reason: "invalid_datetime" | "invalid_timezone" | "nonexistent_local_time" | "too_soon" | "too_far" | "in_the_past"; instant: ResolvedInstant | null };

/**
 * Validate a requested schedule (pure): a well-formed local time, a real zone, a
 * resolvable non-gap instant, and a lead time inside policy relative to `nowMs`.
 * The gap case is rejected so a user never silently schedules a non-existent time.
 */
export function validateScheduleTime(localStr: string, timeZone: string, nowMs: number, policy: LeadTimePolicy): ScheduleTimeValidation {
  const local = parseLocalDateTime(localStr);
  if (!local) return { ok: false, reason: "invalid_datetime", instant: null };
  if (!isValidTimeZone(timeZone)) return { ok: false, reason: "invalid_timezone", instant: null };
  const instant = resolveLocalToUtc(local, timeZone);
  if (instant.anomaly === "nonexistent_gap") return { ok: false, reason: "nonexistent_local_time", instant };
  const lead = instant.epochMs - nowMs;
  if (instant.epochMs <= nowMs) return { ok: false, reason: "in_the_past", instant };
  if (lead < policy.minLeadMs) return { ok: false, reason: "too_soon", instant };
  if (lead > policy.maxLeadMs) return { ok: false, reason: "too_far", instant };
  return { ok: true, instant };
}
