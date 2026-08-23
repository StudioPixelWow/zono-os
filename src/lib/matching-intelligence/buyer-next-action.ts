// ============================================================================
// Buyer Command Center 5.1 — ONE evidence-backed next best action (PURE).
// Returns a single recommendation ONLY when real evidence supports it, in Hebrew,
// with a concrete CTA. Deterministic — same signals → same action. Never invents.
// ============================================================================

export interface BuyerActionSignals {
  newMatches: number;        // matches NEW since last review
  shortlisted: number;       // in the selection, not yet sent
  sentAny: boolean;          // selection has been sent at least once
  liked: number;             // buyer marked interesting
  visitRequested: number;    // buyer asked to see
  hasUpcomingViewing: boolean; // a future meeting/viewing is scheduled
}

export interface BuyerNextAction {
  key: "schedule_visit_requested" | "schedule_liked" | "send_selection" | "review_matches";
  message: string;  // Hebrew, buyer-personalised
  cta: string;      // Hebrew button label
}

/**
 * Pick the single most valuable next action from REAL evidence, or null if none.
 * Priority favours the buyer's expressed intent (visit/like) over broker to-dos.
 */
export function computeBuyerNextAction(firstName: string, s: BuyerActionSignals): BuyerNextAction | null {
  const name = firstName || "הקונה";
  // 1. Buyer explicitly asked for a viewing and none is scheduled yet.
  if (s.visitRequested > 0 && !s.hasUpcomingViewing) {
    return { key: "schedule_visit_requested", message: `${name} ביקש/ה לראות ${s.visitRequested === 1 ? "נכס" : `${s.visitRequested} נכסים`} — טרם נקבע ביקור`, cta: "קבע ביקור" };
  }
  // 2. Buyer liked properties but no viewing is on the calendar.
  if (s.liked > 0 && !s.hasUpcomingViewing) {
    return { key: "schedule_liked", message: `${name} אהב/ה ${s.liked === 1 ? "נכס" : `${s.liked} נכסים`} ועדיין לא נקבע ביקור`, cta: "קבע ביקור" };
  }
  // 3. A selection is curated but was never sent.
  if (s.shortlisted > 0 && !s.sentAny) {
    return { key: "send_selection", message: "הבחירה לא נשלחה עדיין", cta: "שלח בחירה" };
  }
  // 4. Fresh matches are waiting for review.
  if (s.newMatches > 0) {
    return { key: "review_matches", message: `נמצאו ל${name} ${s.newMatches === 1 ? "התאמה חדשה" : `${s.newMatches} התאמות חדשות`}`, cta: "בדוק התאמות" };
  }
  return null;
}
