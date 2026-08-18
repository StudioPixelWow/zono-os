// ============================================================================
// ZONO — Communication Automation: QUIET HOURS (pure, Asia/Jerusalem-aware).
// Non-critical WhatsApp/email is not sent during night hours; it is deferred to
// the next morning. Critical (account/security/billing/SLA) bypasses this. Never
// assumes UTC — the hour is computed in the recipient's/org's timezone.
// ============================================================================

export interface QuietHoursConfig {
  /** Inclusive start hour (local) of quiet window. */
  startHour: number;
  /** Exclusive end hour (local) — quiet until this hour. */
  endHour: number;
  timeZone: string;
}

export const DEFAULT_QUIET_HOURS: QuietHoursConfig = { startHour: 21, endHour: 8, timeZone: "Asia/Jerusalem" };

/** Local hour (0–23) of an ISO instant in a timezone. */
export function localHour(iso: string, timeZone: string): number {
  const s = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone }).format(new Date(iso));
  const h = parseInt(s, 10);
  return Number.isFinite(h) ? (h % 24) : 0;
}

/** True when the instant falls inside the (wrap-around) quiet window. */
export function isQuietHours(iso: string, cfg: QuietHoursConfig = DEFAULT_QUIET_HOURS): boolean {
  const h = localHour(iso, cfg.timeZone);
  // Window wraps midnight when start > end (e.g. 21 → 8).
  return cfg.startHour > cfg.endHour
    ? (h >= cfg.startHour || h < cfg.endHour)
    : (h >= cfg.startHour && h < cfg.endHour);
}

/**
 * The next allowed send instant: if currently quiet, the next local `endHour`
 * (i.e. this morning if before endHour today, else tomorrow morning); otherwise
 * now. Computed by walking forward in hour steps in the target timezone — no UTC
 * assumptions, DST-safe enough for a morning defer.
 */
export function nextAllowedSend(iso: string, cfg: QuietHoursConfig = DEFAULT_QUIET_HOURS): string {
  if (!isQuietHours(iso, cfg)) return iso;
  const start = new Date(iso).getTime();
  for (let mins = 15; mins <= 24 * 60; mins += 15) {
    const candidate = new Date(start + mins * 60_000).toISOString();
    if (!isQuietHours(candidate, cfg) && localHour(candidate, cfg.timeZone) >= cfg.endHour) return candidate;
  }
  return new Date(start + 9 * 3_600_000).toISOString(); // safety fallback
}

/** Morning send time (~endHour local) for a digest, from a reference instant. */
export function morningSendTime(iso: string, cfg: QuietHoursConfig = DEFAULT_QUIET_HOURS): string {
  const start = new Date(iso).getTime();
  for (let mins = 0; mins <= 48 * 60; mins += 15) {
    const candidate = new Date(start + mins * 60_000).toISOString();
    if (localHour(candidate, cfg.timeZone) === cfg.endHour) return candidate;
  }
  return iso;
}
