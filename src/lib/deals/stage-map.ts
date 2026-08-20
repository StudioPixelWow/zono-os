// ============================================================================
// ZONO — Deal stage vocabulary bridge (PURE, client-safe, testable). Maps the two
// stage vocabularies: canonical `deals.stage` enum (new,qualified,negotiation,
// agreement,contract,closing,won,lost) ↔ projection `deal_profiles.deal_stage`
// (new_opportunity … signed, closed, lost). TERMINAL states are mapped explicitly
// so won/lost/closed round-trip deterministically and won is never collapsed onto
// lost or onto a non-terminal "new". Non-terminal collapses (e.g. offer_sent→
// negotiation) are intentionally many-to-one.
// ============================================================================

export const PROFILE_TO_DEAL_STAGE: Record<string, string> = {
  new_opportunity: "new", contacted: "new", meeting_scheduled: "qualified", property_visit: "qualified",
  negotiation: "negotiation", offer_sent: "negotiation", offer_received: "negotiation",
  agreement_draft: "agreement", legal_review: "contract", signed: "closing",
  // TERMINAL — explicit so won/lost never collapse onto "new".
  closed: "won", lost: "lost",
};

export const DEAL_TO_PROFILE_STAGE: Record<string, string> = {
  new: "new_opportunity", qualified: "meeting_scheduled", negotiation: "negotiation",
  agreement: "agreement_draft", contract: "legal_review", closing: "signed",
  // TERMINAL — explicit so won≠lost survives the round-trip.
  won: "closed", lost: "lost",
};

/** Projection stage → canonical enum stage (unknown → "new"). */
export function profileToDealStage(stage: string | null | undefined): string {
  return PROFILE_TO_DEAL_STAGE[stage ?? "new_opportunity"] ?? "new";
}
/** Canonical enum stage → projection stage (unknown → "new_opportunity"). */
export function dealToProfileStage(stage: string | null | undefined): string {
  return DEAL_TO_PROFILE_STAGE[stage ?? "new"] ?? "new_opportunity";
}
