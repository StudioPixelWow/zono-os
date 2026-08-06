// ============================================================================
// ZONO — Offers · pure rules (no I/O; unit-tested)
// ----------------------------------------------------------------------------
// Extracted so the offer state machine + next-action labels are testable
// without a database. The service imports these — single source of truth.
// ============================================================================
export const OFFER_OPEN_STATUSES: readonly string[] = ["draft", "submitted", "countered"];

export function offerNextAction(status: string, responder: string | null): string {
  switch (status) {
    case "draft": return "הגש הצעה";
    case "submitted": return responder === "seller" ? "ממתין לתשובת מוכר" : "ממתין לתשובה";
    case "countered": return responder === "buyer" ? "נדרשת תשובת קונה" : "נדרשת תשובת מוכר";
    case "accepted": return "המר לעסקה";
    case "rejected": return "נדחתה";
    case "withdrawn": return "בוטלה";
    case "expired": return "פג תוקף";
    default: return "";
  }
}

/** Whether an action valid for `allowed` statuses may run from the current one. */
export function offerActionAllowed(current: string, allowed: readonly string[]): boolean {
  return allowed.includes(current);
}
