// ============================================================================
// 📶 ZONO — connectivity logic (PURE, no DOM). Extracted from PwaProvider so the
// offline-banner behavior is deterministic and offline-testable.
//
// ROOT CAUSE it fixes (QA P0-2): PwaProvider read navigator.onLine once at mount
// and thereafter only reacted to window 'online'/'offline' events. A single stale
// or missed native transition (common in proxied / webview / PWA runtimes) latched
// the "אין חיבור" banner with no way to recover. The fix is to RE-SYNC to
// navigator.onLine on mount and on visibility/focus regain — modeled here as pure
// transitions so every acceptance case is unit-testable without a browser.
//
// NOTE (also part of the root cause): request/server-action failures NEVER feed
// this state — they surface on a separate ActionFeedback channel. That is BY
// DESIGN and is why a transient 5xx must not mark the app offline. There is no
// ConnEvent for "request failed"; the reducer simply has no path that a failed
// fetch could take to flip `online` to false.
// ============================================================================

/** The only inputs that may change connectivity state. */
export type ConnEvent = "mount" | "online" | "offline" | "visible" | "focus";

/**
 * Next `online` value given the current value, an event, and the browser's
 * authoritative navigator.onLine reading at that moment.
 *  • 'online' / 'offline' native events are authoritative (true / false).
 *  • 'mount' / 'visible' / 'focus' RE-SYNC to navigator.onLine — this is the
 *    recovery path that prevents a latched banner.
 * Pure + deterministic.
 */
export function nextOnlineState(current: boolean, event: ConnEvent, navigatorOnline: boolean): boolean {
  switch (event) {
    case "offline":
      return false;
    case "online":
      return true;
    case "mount":
    case "visible":
    case "focus":
      return navigatorOnline;
    default:
      return current;
  }
}

export interface BannerState {
  tone: "sync" | "offline";
  text: string;
}

/**
 * What the banner should show for a given (online, pending) pair, or null to
 * render nothing. Kept pure so the copy + visibility rules are testable.
 */
export function bannerState(online: boolean, pending: number): BannerState | null {
  if (online && pending === 0) return null;
  if (online) {
    return { tone: "sync", text: `מסנכרן ${pending} פעולות מאושרות…` };
  }
  return {
    tone: "offline",
    text: pending > 0 ? `אין חיבור — ${pending} פעולות מאושרות ממתינות לסנכרון` : "אין חיבור — צפייה במצב לא-מקוון",
  };
}
