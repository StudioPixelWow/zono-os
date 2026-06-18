/**
 * Fallback status → journey stage mapping (mirrors the SQL function
 * public.journey_stage_for_status). Used only when a property has no journey
 * row yet (e.g. before the backfill migration has run against the DB).
 */
import type { JourneyStage, PropertyStatus } from "@/lib/supabase/types";

export function journeyStageForStatusFallback(
  status: PropertyStatus,
): JourneyStage {
  switch (status) {
    case "draft":
      return "new";
    case "ready":
      return "marketing_preparation";
    case "active":
      return "active_marketing";
    case "published":
      return "published";
    case "under_offer":
      return "negotiation";
    case "in_contract":
      return "deal_signed";
    case "sold":
    case "rented":
    case "withdrawn":
    case "archived":
      return "closed";
    default:
      return "new";
  }
}
