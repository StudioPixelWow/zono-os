// ============================================================================
// ZONO — Facebook "היום" · customer STATUS NORMALIZATION (pure, client-safe).
// ONE customer-facing vocabulary over the engine's internal publish states, so a
// real-estate agent never sees queued / dispatching / awaiting_confirmation /
// awaiting_reconciliation. This is presentation only — it changes no engine
// state. `primaryAction` names the single dominant action a Today card should
// offer for each state (or null when the item is informational).
// ============================================================================

export type TodayStatusKey =
  | "scheduled"    // waiting for its time / to be served
  | "ready"        // due now — the extension will publish it next
  | "publishing"   // handed to the extension, in progress
  | "reconcile"    // ambiguous — needs an explicit human decision
  | "attention"    // failed / dead-letter — needs handling
  | "paused"       // paused
  | "published"    // done
  | "cancelled";   // cancelled

export type TodayAction = "assist_publish" | "reconcile" | "fix" | "resume" | null;

export interface TodayStatus {
  key: TodayStatusKey;
  label: string;           // customer Hebrew
  tone: "muted" | "brand" | "warning" | "success" | "danger";
  action: TodayAction;     // the single dominant action (or null = informational)
  actionLabel: string | null;
}

const S: Record<TodayStatusKey, TodayStatus> = {
  scheduled:  { key: "scheduled",  label: "מתוזמן",       tone: "muted",   action: null,            actionLabel: null },
  ready:      { key: "ready",      label: "מוכן לפרסום",  tone: "brand",   action: "assist_publish", actionLabel: "פרסום בפייסבוק" },
  publishing: { key: "publishing", label: "מפרסם",        tone: "brand",   action: null,            actionLabel: null },
  reconcile:  { key: "reconcile",  label: "דורש הכרעה",   tone: "warning", action: "reconcile",      actionLabel: "בדיקה והכרעה" },
  attention:  { key: "attention",  label: "דורש טיפול",   tone: "danger",  action: "fix",            actionLabel: "טיפול בפרסום" },
  paused:     { key: "paused",     label: "מושהה",        tone: "muted",   action: "resume",         actionLabel: "חידוש" },
  published:  { key: "published",  label: "פורסם",        tone: "success", action: null,            actionLabel: null },
  cancelled:  { key: "cancelled",  label: "בוטל",         tone: "muted",   action: null,            actionLabel: null },
};

/**
 * Map an engine publish state (canonical `publish_state`, falling back to legacy
 * `status`) onto ONE customer status. `dueNow` promotes a schedulable item whose
 * time has arrived from "מתוזמן" to "מוכן לפרסום".
 */
export function toTodayStatus(engineState: string | null | undefined, opts: { dueNow?: boolean } = {}): TodayStatus {
  const s = (engineState ?? "").toLowerCase();
  switch (s) {
    case "published": return S.published;
    case "failed": case "dead_letter": case "dead_lettered": return S.attention;
    case "awaiting_reconciliation": case "needs_review": return S.reconcile;
    case "dispatching": case "awaiting_confirmation": case "publishing": return S.publishing;
    case "paused": return S.paused;
    case "cancelled": case "canceled": case "skipped": return S.cancelled;
    case "queued": case "scheduled": case "draft": case "pending_retry": case "ready":
      return opts.dueNow ? S.ready : S.scheduled;
    default:
      return opts.dueNow ? S.ready : S.scheduled;
  }
}

export const TODAY_STATUS = S;

// ── Pure self-check (offline) ────────────────────────────────────────────────
export interface TCheck { name: string; pass: boolean }
export function runSelfCheck(): { ok: boolean; passed: number; total: number; checks: TCheck[] } {
  const checks: TCheck[] = [];
  const add = (name: string, pass: boolean) => checks.push({ name, pass });
  add("queued (not due) → מתוזמן", toTodayStatus("queued").label === "מתוזמן");
  add("queued (due) → מוכן לפרסום", toTodayStatus("queued", { dueNow: true }).key === "ready");
  add("dispatching → מפרסם", toTodayStatus("dispatching").label === "מפרסם");
  add("awaiting_confirmation → מפרסם", toTodayStatus("awaiting_confirmation").key === "publishing");
  add("awaiting_reconciliation → דורש הכרעה", toTodayStatus("awaiting_reconciliation").label === "דורש הכרעה");
  add("failed → דורש טיפול", toTodayStatus("failed").label === "דורש טיפול");
  add("published → פורסם (no action)", toTodayStatus("published").label === "פורסם" && toTodayStatus("published").action === null);
  add("cancelled → בוטל", toTodayStatus("cancelled").label === "בוטל");
  add("no engineering term leaks", ["queued","dispatching","awaiting_confirmation","awaiting_reconciliation"].every((k) => !Object.values(S).some((v) => v.label.includes(k))));
  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, passed, total: checks.length, checks };
}
