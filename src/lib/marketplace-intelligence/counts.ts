// ============================================================================
// 🔢 ZONO — marketplace header counts (PURE, testable).
// Fixes QA P1-2: the "התאמות" header counted opportunities whose KIND was
// "buyer_match", but a listing is classified "acquisition" whenever it has any
// acquisition signal — EVEN IF it also has buyer matches. So a card printing
// "2 קונים מתאימים" was excluded from the header, which then read 0.
// The header must count the SAME thing the cards show: listings with ≥1 buyer
// match, regardless of kind label.
// ============================================================================

export interface CountableOpportunity {
  kind: string;
  /** Raw per-listing buyer-match count shown on the card ("N קונים מתאימים"). */
  buyerMatches: number;
}

/** Header count of listings that actually have ≥1 buyer match (matches the cards). */
export function buyerMatchCount(opps: CountableOpportunity[]): number {
  return opps.filter((o) => o.buyerMatches > 0).length;
}

/** Header count of acquisition opportunities (unchanged semantics, kept co-located). */
export function acquisitionCount(opps: CountableOpportunity[]): number {
  return opps.filter((o) => o.kind === "acquisition").length;
}
