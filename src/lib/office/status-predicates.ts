// ============================================================================
// ZONO — Canonical OFFICE status predicates (PURE, unit-testable). One source of
// truth for what "active lead / active property / open deal" mean on the office
// surfaces, so the /office board and the agent drill-down cannot drift apart
// (Phase 16 — status consistency). These are the OFFICE definitions; other
// domains (e.g. the follow-up engine's open-task set) keep their own distinct
// predicates on purpose — do not merge them just because labels look alike.
// ============================================================================
export const ACTIVE_LEAD_STAGES = new Set(["new", "contacted", "qualified", "nurturing"]);
export const ACTIVE_PROPERTY_STATUS = new Set(["active", "published", "ready", "under_offer", "in_contract"]);
export const LATE_DEAL_STAGES = new Set(["agreement", "contract", "closing"]);

/** A lead that is still in the working funnel (not converted/lost). */
export const isActiveLeadStage = (stage: string): boolean => ACTIVE_LEAD_STAGES.has(stage);
/** A property that is live inventory (not draft/sold/withdrawn/archived). */
export const isActivePropertyStatus = (status: string): boolean => ACTIVE_PROPERTY_STATUS.has(status);
/** A deal still in progress. */
export const isOpenDeal = (status: string): boolean => status === "open";
/** A deal in a late/legal stage (not counted as "stuck" even when old). */
export const isLateDealStage = (stage: string): boolean => LATE_DEAL_STAGES.has(stage);
