// ============================================================================
// ZONO — Distribution feature flags (plain constants; NOT a "use server" file so
// non-async values may be exported and imported by both server actions and the
// pure action-center engine).
// ============================================================================

/**
 * Phase 3 (P0 #1): dark-by-default gate for the Property → Groups campaign entry
 * point (the launchGroupsCampaignFromProperty orchestrator and the property-aware
 * Marketing Action Center CTA). Enable per environment with
 * ZONO_GROUPS_CAMPAIGN_FROM_PROPERTY=1. Off by default so the feature ships dark.
 */
export const GROUPS_CAMPAIGN_FROM_PROPERTY_ENABLED =
  process.env.ZONO_GROUPS_CAMPAIGN_FROM_PROPERTY === "1";
