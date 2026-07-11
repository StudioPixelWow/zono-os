// ============================================================================
// 💼 ZONO — Deal picker options (PURE, client-safe).
//
// Kept OUT of deals/create-actions.ts: that file is "use server", and such a
// module may export only async functions. A const array export there breaks
// module evaluation for every server action in the bundle.
// ============================================================================

/** Valid deal_stage enum values (Hebrew labels in UI). */
export const DEAL_STAGE_OPTIONS = ["new", "qualified", "negotiation", "agreement", "contract", "closing"] as const;
