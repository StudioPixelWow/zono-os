// ============================================================================
// 📇 ZONO — Lead picker options (PURE, client-safe).
//
// These constants MUST NOT live in leads/actions.ts: that file carries the
// "use server" directive, and Next.js allows a "use server" module to export
// ONLY async functions. Exporting a const array from it makes module evaluation
// throw ("A \"use server\" file can only export async functions, found object"),
// which takes down EVERY server action in the app — not just this one.
// ============================================================================

/** Valid lead_source enum values surfaced in the picker (Hebrew labels in UI). */
export const LEAD_SOURCE_OPTIONS = ["website", "facebook", "instagram", "referral", "open_house", "sign_call", "cold_outreach", "portal", "partner", "other"] as const;

/** Valid lead intent values surfaced in the picker. */
export const LEAD_INTENT_OPTIONS = ["buyer", "seller", "both", "investor", "renter", "unknown"] as const;
