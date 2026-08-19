// ============================================================================
// ZONO — Property Lifecycle Control Center: PURE next-action core (no IO, no LLM).
// Given the composed operational signals for ONE property, derive exactly ONE
// primary next action with a deterministic P0/P1/P2 priority ladder. The server
// selector supplies the signals; this decides. Fully unit-testable. An LLM NEVER
// picks the action — ZI may only reword the FACTS this produces.
// ============================================================================

export type NextActionPriority = "P0" | "P1" | "P2" | "none";
export type NextActionCode =
  | "publish_failed" | "seller_action" | "buyer_waiting" | "viewing_followup"
  | "open_deal" | "contact_matches" | "collect_feedback" | "seller_strategy" | "schedule_marketing"
  | "start_marketing" | "refresh_creative" | "send_report" | "all_good" | "closed";

export interface ControlSignals {
  closed: boolean;
  failedPublications: number;
  sellerActionRequested: boolean;      // seller asked for call / price discussion
  hotBuyerWaiting: boolean;            // a buyer response needs a human now
  priceDropResponses: number;         // buyers who responded after a price drop
  viewingFollowupOverdue: boolean;
  dealReadyBuyer: boolean;            // a buyer is ready to progress but no deal yet
  hasOpenDeal: boolean;
  strongUncontactedMatches: number;   // high match, property not yet sent
  viewingFeedbackPending: number;    // completed viewings without recorded feedback
  sellerStrategyNeeded: boolean;      // marketing health = needs_attention / viewings_no_progress
  noFutureMarketing: boolean;
  notMarketed: boolean;
  noRecentInterest: boolean;
  reportDueUnsent: boolean;           // subscribed seller has no report this week
}

export interface PropertyNextAction {
  priority: NextActionPriority;
  code: NextActionCode;
  label: string;   // Hebrew, the operational headline
  cta: string;     // Hebrew button label ("" when none)
}

/** The single next best action, first match wins down a deterministic ladder. */
export function derivePropertyNextAction(s: ControlSignals): PropertyNextAction {
  if (s.closed) return { priority: "none", code: "closed", label: "העסקה נסגרה — אין פעולה נדרשת", cta: "" };

  // ── P0 — must act now ──────────────────────────────────────────────────────
  if (s.failedPublications > 0) return { priority: "P0", code: "publish_failed", label: s.failedPublications === 1 ? "פרסום נכשל — נדרש טיפול" : `${s.failedPublications} פרסומים נכשלו — נדרש טיפול`, cta: "טיפול בפרסום" };
  if (s.sellerActionRequested) return { priority: "P0", code: "seller_action", label: "בעל הנכס מבקש טיפול", cta: "חזרה לבעל הנכס" };
  if (s.priceDropResponses > 0) return { priority: "P0", code: "buyer_waiting", label: `${s.priceDropResponses} מתעניינים ביקשו תגובה אחרי עדכון המחיר`, cta: "טפל עכשיו" };
  if (s.hotBuyerWaiting) return { priority: "P0", code: "buyer_waiting", label: "מתעניין ממתין לתגובה", cta: "טפל עכשיו" };
  if (s.viewingFollowupOverdue) return { priority: "P0", code: "viewing_followup", label: "נדרש פולואפ לאחר ביקור", cta: "טיפול בפולואפ" };

  // ── P1 — important ─────────────────────────────────────────────────────────
  if (s.dealReadyBuyer && !s.hasOpenDeal) return { priority: "P1", code: "open_deal", label: "לקוח מוכן להתקדם", cta: "פתיחת עסקה" };
  if (s.strongUncontactedMatches > 0) return { priority: "P1", code: "contact_matches", label: `${s.strongUncontactedMatches} מתעניינים חזקים טרם קיבלו את הנכס`, cta: "שליחה למתעניינים" };
  if (s.viewingFeedbackPending > 0) return { priority: "P1", code: "collect_feedback", label: `${s.viewingFeedbackPending} ביקורים ללא משוב`, cta: "איסוף משוב" };
  if (s.sellerStrategyNeeded) return { priority: "P1", code: "seller_strategy", label: "נדרש עדכון אסטרטגיה מול בעל הנכס", cta: "עדכון אסטרטגיה" };
  if (s.noFutureMarketing) return { priority: "P1", code: "schedule_marketing", label: "אין פרסום עתידי מתוזמן", cta: "תזמון פרסום" };

  // ── P2 — worth doing ───────────────────────────────────────────────────────
  if (s.notMarketed) return { priority: "P2", code: "start_marketing", label: "הנכס עדיין לא בשיווק פעיל", cta: "התחלת שיווק" };
  if (s.noRecentInterest) return { priority: "P2", code: "refresh_creative", label: "אין התעניינות לאחרונה — כדאי לרענן שיווק", cta: "רענון שיווק" };
  if (s.reportDueUnsent) return { priority: "P2", code: "send_report", label: "בעל הנכס עדיין לא קיבל דוח השבוע", cta: "שליחת דוח" };

  return { priority: "none", code: "all_good", label: "הנכס בטיפול — אין פעולה דחופה", cta: "" };
}

// ── Recommendation funnel (deterministic ordering of REAL supported steps) ──
export interface RecoFunnel {
  matched: number;
  sent: number;
  responded: number;
  interested: number;
  viewingRequested: number;
  viewed: number;
  rejected: number;
}

/** Build the funnel from raw per-status counts. `opened` is intentionally ABSENT
 *  (no open tracking exists — never fabricate it). */
export function buildRecoFunnel(input: {
  matchCount: number;
  statusCounts: Record<string, number>;
}): RecoFunnel {
  const c = input.statusCounts;
  const g = (k: string) => Math.max(0, Number(c[k] ?? 0));
  const sent = g("recommended") + g("viewed") + g("interested") + g("rejected") + g("viewing_requested");
  return {
    matched: Math.max(input.matchCount, sent),
    sent,
    responded: g("interested") + g("rejected") + g("viewing_requested"),
    interested: g("interested"),
    viewingRequested: g("viewing_requested"),
    viewed: g("viewed"),
    rejected: g("rejected"),
  };
}

// Hebrew label for a recommendation/interest status (shared by matching + responses).
export const RECO_STATUS_LABEL: Record<string, string> = {
  recommended: "נשלח",
  viewed: "צפה",
  interested: "מעניין",
  rejected: "לא מתאים",
  viewing_requested: "ביקש ביקור",
  none: "טרם נשלח",
};
export function recoStatusLabel(status: string | null | undefined): string {
  return RECO_STATUS_LABEL[status ?? "none"] ?? "טרם נשלח";
}
