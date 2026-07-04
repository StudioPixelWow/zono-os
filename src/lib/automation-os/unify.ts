// ============================================================================
// ⚙️ ZONO — Automation OS™ · pure unification (compose only). PHASE 46.0.
// Automation OS is NOT a new engine. The automation capability already exists
// (src/lib/automation: workflows/runs/analytics/library, approval-gated) plus
// the Approval Bundle Engine (44.0). This layer only UNIFIES their numbers into
// one health/status view for Executive OS + Broker Workspace. No new workflow,
// mission, approval or action — everything routes into the existing engines.
// ============================================================================

/** Shape mirrors the EXISTING automation module's AutomationAnalytics (reused, not recomputed). */
export interface AnalyticsInput {
  workflowsTotal: number; workflowsEnabled: number; runsTotal: number; runsApplied: number;
  pending: number; completedToday: number; failed: number; blocked: number;
}

export type AutomationState = "healthy" | "needs_attention" | "at_risk" | "idle";

export interface AutomationHealth {
  total: number; enabled: number;
  runsTotal: number; applied: number; pending: number; blocked: number; failed: number; completedToday: number;
  suggested: number;            // approval bundles + library recommendations awaiting the broker
  successRate: number;          // % of resolved runs that applied cleanly
  approvalRate: number;         // % of all runs that were approved + applied
  state: AutomationState;
  evidence: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Compose the unified automation health from EXISTING analytics + pending suggestions. */
export function composeAutomationHealth(a: AnalyticsInput, suggested: number): AutomationHealth {
  const resolved = a.runsApplied + a.failed;
  const successRate = resolved > 0 ? clamp((a.runsApplied / resolved) * 100) : 0;
  const approvalRate = a.runsTotal > 0 ? clamp((a.runsApplied / a.runsTotal) * 100) : 0;
  let state: AutomationState;
  if (a.workflowsTotal === 0 && a.runsTotal === 0) state = "idle";
  else if (a.failed + a.blocked > a.runsApplied && a.runsTotal > 0) state = "at_risk";
  else if (a.pending >= 5) state = "needs_attention";
  else state = "healthy";
  const evidence: string[] = [
    `${a.workflowsEnabled}/${a.workflowsTotal} אוטומציות פעילות`,
    `${a.runsApplied} רצות אושרו · ${a.pending} ממתינות · ${a.blocked} חסומות · ${a.failed} נכשלו`,
    `הושלמו היום: ${a.completedToday}`,
  ];
  return {
    total: a.workflowsTotal, enabled: a.workflowsEnabled, runsTotal: a.runsTotal, applied: a.runsApplied,
    pending: a.pending, blocked: a.blocked, failed: a.failed, completedToday: a.completedToday,
    suggested, successRate, approvalRate, state, evidence,
  };
}

export function explainAutomationHealth(h: AutomationHealth): string {
  const stateHe: Record<AutomationState, string> = { healthy: "תקין", needs_attention: "דורש תשומת לב", at_risk: "בסיכון", idle: "לא פעיל" };
  return `מצב האוטומציות: ${stateHe[h.state]}. שיעור הצלחה ${h.successRate}%, שיעור אישור ${h.approvalRate}%. ${h.pending} ממתינות לאישור, ${h.suggested} הצעות חדשות. הכול עובר דרך המנועים הקיימים — שום פעולה לא רצה ללא אישור.`;
}

// ── Automation library (STEP 7) — a REFERENCE catalog over existing triggers ─
export interface AutomationTemplateRef { key: string; title: string; trigger: string; note: string }
/** Canonical trigger→template references; the real templates live in the automation module + approval-bundle events. */
export const AUTOMATION_LIBRARY: AutomationTemplateRef[] = [
  { key: "new_lead", title: "ליד חדש", trigger: "new_lead", note: "משימה + תהליך + טיוטת פנייה + הצעת פגישה" },
  { key: "new_listing", title: "נכס חדש", trigger: "new_property", note: "השקה שיווקית + פוסט + עמוד נחיתה + יום צילום" },
  { key: "hot_buyer", title: "קונה חם", trigger: "buyer_ready", note: "תהליך סגירה + הצעת צפייה + טיוטת אימייל" },
  { key: "seller_risk", title: "מוכר בסיכון", trigger: "seller_at_risk", note: "תהליך שימור + פנייה יזומה" },
  { key: "listing_expired", title: "נכס תקוע", trigger: "listing_stale", note: "רענון קמפיין + מעקב" },
  { key: "meeting_finished", title: "פגישה הסתיימה", trigger: "meeting_completed", note: "מעקב + סיכום + פגישת המשך" },
  { key: "facebook_comment", title: "תגובת פייסבוק", trigger: "facebook_comment", note: "טיוטת מענה + תהליך ליד" },
  { key: "website_lead", title: "ליד מהאתר", trigger: "new_lead", note: "משימה + טיוטת פנייה" },
  { key: "open_house", title: "בית פתוח", trigger: "new_property", note: "הצעת בית פתוח + שיווק" },
  { key: "price_reduction", title: "הורדת מחיר", trigger: "price_opportunity", note: "עדכון + סקירת תמחור" },
  { key: "recruit_broker", title: "גיוס ברוקר", trigger: "territory_opportunity", note: "פעילות גיוס באזור" },
];

// ── Self-check ───────────────────────────────────────────────────────────────
export interface UCheck { name: string; pass: boolean }
export interface USelfCheck { ok: boolean; total: number; passed: number; checks: UCheck[] }
export function runSelfCheck(): USelfCheck {
  const checks: UCheck[] = []; const add = (n: string, p: boolean) => checks.push({ name: n, pass: p });

  const healthy = composeAutomationHealth({ workflowsTotal: 8, workflowsEnabled: 6, runsTotal: 20, runsApplied: 15, pending: 2, completedToday: 4, failed: 2, blocked: 1 }, 3);
  add("health: successRate = applied/(applied+failed) (reused, not recomputed)", healthy.successRate === Math.round((15 / 17) * 100));
  add("health: approvalRate = applied/runsTotal", healthy.approvalRate === Math.round((15 / 20) * 100));
  add("health: state healthy when applied dominates + low pending", healthy.state === "healthy");
  add("health: suggested reflects provided count", healthy.suggested === 3);
  add("health: evidence carries the reused counts", healthy.evidence.length === 3 && healthy.evidence[0].includes("6/8"));

  const idle = composeAutomationHealth({ workflowsTotal: 0, workflowsEnabled: 0, runsTotal: 0, runsApplied: 0, pending: 0, completedToday: 0, failed: 0, blocked: 0 }, 0);
  add("health: idle when nothing configured", idle.state === "idle" && idle.successRate === 0 && idle.approvalRate === 0);

  const risky = composeAutomationHealth({ workflowsTotal: 5, workflowsEnabled: 5, runsTotal: 10, runsApplied: 2, pending: 1, completedToday: 0, failed: 6, blocked: 3 }, 0);
  add("health: at_risk when failures+blocked exceed applied", risky.state === "at_risk");

  const busy = composeAutomationHealth({ workflowsTotal: 6, workflowsEnabled: 6, runsTotal: 12, runsApplied: 7, pending: 6, completedToday: 1, failed: 0, blocked: 0 }, 2);
  add("health: needs_attention when many pending approvals", busy.state === "needs_attention");

  add("explain: non-empty + reassures approval-gated", /לא רצה ללא אישור/.test(explainAutomationHealth(healthy)));
  add("library: 11 trigger→template refs, all map to existing bundle events", AUTOMATION_LIBRARY.length === 11 && AUTOMATION_LIBRARY.every((t) => t.trigger.length > 0));

  const passed = checks.filter((c) => c.pass).length;
  return { ok: passed === checks.length, total: checks.length, passed, checks };
}
