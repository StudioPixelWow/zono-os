// ============================================================================
// Cron time-boxing. A Vercel function that hits maxDuration is SIGKILLed — no
// response, no finally, logged as "Task timed out" (182 occurrences/week before
// this fix). `raceDeadline` lets a handler stop WAITING on a slow step before the
// kill so it can finalize and return cleanly; the step's own idempotency/stale-run
// recovery picks up whatever was left on the next run.
// ============================================================================
export const TIMED_OUT = Symbol("timed_out");

export async function raceDeadline<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  if (ms <= 0) { work.catch(() => {}); return TIMED_OUT; }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), ms); });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    work.catch(() => {}); // never leave an unhandled rejection behind a timed-out step
  }
}
