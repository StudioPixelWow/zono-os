/**
 * ZONO Supabase database types.
 *
 * Mirrors the schema defined in `supabase/migrations`. Hand-authored in the
 * same shape that `supabase gen types typescript` produces, so it can be
 * regenerated against a live project later with:
 *
 *   npx supabase gen types typescript --project-id <id> --schema public \
 *     > src/lib/supabase/types.ts
 *
 * The typed clients in `client.ts` / `server.ts` consume the `Database` export.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ── Enums ────────────────────────────────────────────────────────────────────
export type OrgPlan = "starter" | "pro" | "team" | "enterprise";
export type UserStatus = "active" | "invited" | "suspended" | "disabled";
export type Region =
  | "north" | "haifa" | "sharon" | "center" | "tel_aviv"
  | "jerusalem" | "shfela" | "south" | "west_bank" | "eilat";
export type PreferredChannel = "phone" | "whatsapp" | "email" | "sms";
export type BuyerTemperature = "hot" | "warm" | "cold";
export type SellerMotivation = "urgent" | "motivated" | "exploring";
export type LeadSource =
  | "yad2" | "madlan" | "facebook" | "instagram" | "website" | "referral"
  | "sign_call" | "open_house" | "cold_outreach" | "portal" | "partner" | "other";
export type LeadIntent = "buyer" | "seller" | "both" | "investor" | "renter" | "unknown";
export type LeadStage =
  | "new" | "contacted" | "qualified" | "nurturing" | "converted" | "lost" | "disqualified";
export type PropertyType =
  | "apartment" | "garden_apartment" | "penthouse" | "duplex" | "private_house"
  | "cottage" | "studio" | "commercial" | "office" | "land" | "other";
export type ListingKind = "sale" | "rent";
export type PropertyStatus =
  | "draft" | "active" | "under_offer" | "in_contract" | "sold" | "rented" | "withdrawn" | "archived"
  | "ready" | "published";
export type ListingTag = "new" | "exclusive" | "opportunity" | "premium" | "sold";
export type MediaType = "image" | "video" | "floor_plan" | "tour_360" | "document";
export type ProjectType =
  | "residential" | "mixed_use" | "commercial" | "urban_renewal" | "luxury" | "other";
export type ProjectStatus =
  | "planning" | "pre_sale" | "selling" | "sold_out" | "on_hold" | "completed" | "cancelled";
export type UnitStatus = "available" | "reserved" | "on_hold" | "sold" | "unavailable";
export type OpportunityType =
  | "new_match" | "price_drop" | "expiring_exclusivity" | "buyer_reengage"
  | "market_shift" | "new_lead" | "stale_deal" | "document_pending" | "follow_up" | "other";
export type OpportunityPriority = "high" | "medium" | "low";
export type OpportunityStatus = "open" | "snoozed" | "acted" | "dismissed" | "expired";
export type DealType = "sale" | "rent" | "project_sale";
export type DealStage =
  | "new" | "qualified" | "negotiation" | "agreement" | "contract" | "closing" | "won" | "lost";
export type DealStatus = "open" | "won" | "lost" | "on_hold";
export type MatchingStatus =
  | "new" | "presented" | "viewing_scheduled" | "viewed" | "rejected" | "offer_made" | "accepted" | "expired";
export type MatchingSource = "engine" | "manual";
export type ActivityType =
  | "call" | "whatsapp" | "email" | "sms" | "note" | "meeting" | "viewing"
  | "system" | "status_change" | "document" | "task";
export type ActivityDirection = "inbound" | "outbound" | "internal";
export type JourneyStage =
  | "new"
  | "information_collection"
  | "marketing_preparation"
  | "published"
  | "active_marketing"
  | "negotiation"
  | "deal_signed"
  | "closed";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type MeetingType =
  | "viewing" | "open_house" | "meeting" | "call" | "signing" | "valuation" | "inspection" | "other";
export type MeetingStatus =
  | "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show" | "rescheduled";
export type DocumentType =
  | "exclusivity_agreement" | "listing_agreement" | "sale_contract" | "rental_contract"
  | "offer" | "disclosure" | "id_document" | "mortgage" | "invoice" | "brochure" | "other";
export type DocumentStatus =
  | "draft" | "pending_signature" | "partially_signed" | "signed" | "expired" | "archived" | "cancelled";
export type AutomationTrigger =
  | "lead_created" | "lead_stage_changed" | "property_listed" | "price_changed"
  | "match_created" | "deal_stage_changed" | "document_signed" | "meeting_scheduled"
  | "task_overdue" | "exclusivity_expiring" | "schedule" | "manual";
export type AutomationStatus = "active" | "paused" | "draft" | "archived";
export type NotificationLevel = "info" | "success" | "warning" | "critical";
export type NotificationCategory =
  | "task_due" | "followup_due" | "price_change" | "new_lead" | "new_match"
  | "document_pending" | "exclusivity_expiring" | "deal_update" | "meeting_reminder"
  | "mention" | "market_event" | "system";

// ── Table row shapes ───────────────────────────────────────────────────────────
type OrganizationsRow = {
  id: string;
  name: string;
  slug: string | null;
  plan: OrgPlan;
  regions: Region[];
  logo_url: string | null;
  locale: string;
  settings: Json;
  phone: string | null;
  email: string | null;
  city: string | null;
  operating_cities: string[];
  operating_neighborhoods: string[];
  default_property_types: PropertyType[];
  default_deal_types: ListingKind[];
  onboarding_completed: boolean;
  broker_enrichment_enabled: boolean;
  created_at: string;
  updated_at: string;
}

type RolesRow = {
  id: string;
  org_id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: Json;
  is_system: boolean;
  created_at: string;
  updated_at: string;
}

type UsersRow = {
  id: string;
  org_id: string;
  role_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  avatar_url: string | null;
  title: string | null;
  status: UserStatus;
  last_seen_at: string | null;
  operating_city: string | null;
  operating_neighborhoods: string[];
  primary_city: string | null;
  primary_neighborhoods: Json;
  market_coverage_enabled: boolean;
  property_types: PropertyType[];
  deal_types: ListingKind[];
  min_price: number | null;
  max_price: number | null;
  min_rooms: number | null;
  max_rooms: number | null;
  notification_preferences: Json;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
}

type BuyersRow = {
  id: string;
  org_id: string;
  owner_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  preferred_channel: PreferredChannel | null;
  notes: string | null;
  temperature: BuyerTemperature | null;
  budget_min: number | null;
  budget_max: number | null;
  rooms_min: number | null;
  rooms_max: number | null;
  size_min_sqm: number | null;
  size_max_sqm: number | null;
  preferred_types: PropertyType[];
  preferred_regions: Region[];
  preferred_areas: string[];
  must_have_parking: boolean;
  must_have_elevator: boolean;
  must_have_safe_room: boolean;
  readiness: number | null;
  has_preapproval: boolean;
  preferences: Json;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

type SellersRow = {
  id: string;
  org_id: string;
  owner_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  preferred_channel: PreferredChannel | null;
  notes: string | null;
  motivation: SellerMotivation | null;
  expected_price: number | null;
  secondary_phone: string | null;
  address: string | null;
  city: string | null;
  locality_id: string | null;
  birthday: string | null;
  occupation: string | null;
  family_status: string | null;
  seller_type: string | null;
  motivation_type: string | null;
  motivation_notes: string | null;
  urgency_level: string | null;
  target_sale_date: string | null;
  must_sell_by: string | null;
  desired_price: number | null;
  minimum_price: number | null;
  dream_price: number | null;
  mortgage_exists: boolean;
  mortgage_balance: number | null;
  financial_notes: string | null;
  decision_style: string | null;
  main_objection: string | null;
  negotiation_sensitivity: string | null;
  preferred_contact_method: string | null;
  preferred_contact_time: string | null;
  communication_notes: string | null;
  price_sensitivity_score: number;
  time_sensitivity_score: number;
  trust_sensitivity_score: number;
  marketing_openness_score: number;
  negotiation_flexibility_score: number;
  cooperation_score: number;
  available_for_showings: boolean;
  allows_marketing: boolean;
  allows_signage: boolean;
  allows_exclusive: boolean;
  has_signed_agreement: boolean;
  seller_profile_summary: string | null;
  ai_psychology_summary: string | null;
  ai_negotiation_summary: string | null;
  ai_risk_summary: string | null;
  created_at: string;
  updated_at: string;
}

type PropertySellersRow = {
  id: string;
  org_id: string;
  property_id: string;
  seller_id: string;
  relationship_type: string;
  ownership_percentage: number | null;
  is_primary: boolean;
  is_decision_maker: boolean;
  can_sign: boolean;
  receives_reports: boolean;
  participates_in_negotiation: boolean;
  status: string;
  notes: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

type LeadsRow = {
  id: string;
  org_id: string;
  owner_id: string | null;
  full_name: string;
  phone: string | null;
  email: string | null;
  source: LeadSource | null;
  intent: LeadIntent;
  stage: LeadStage;
  message: string | null;
  score: number | null;
  property_id: string | null;
  project_id: string | null;
  converted_buyer_id: string | null;
  converted_seller_id: string | null;
  lost_reason: string | null;
  last_activity_at: string | null;
  created_at: string;
  updated_at: string;
}

type ProjectsRow = {
  id: string;
  org_id: string;
  owner_id: string | null;
  name: string;
  developer_name: string | null;
  description: string | null;
  type: ProjectType | null;
  status: ProjectStatus;
  location: Json;
  city: string | null;
  region: Region | null;
  total_units: number | null;
  available_units: number | null;
  price_min: number | null;
  price_max: number | null;
  delivery_date: string | null;
  created_at: string;
  updated_at: string;
}

type UnitsRow = {
  id: string;
  org_id: string;
  project_id: string;
  unit_number: string;
  type: PropertyType | null;
  status: UnitStatus;
  floor: number | null;
  rooms: number | null;
  size_sqm: number | null;
  outdoor_sqm: number | null;
  exposure: string | null;
  price: number | null;
  features: Json;
  created_at: string;
  updated_at: string;
}

type PropertiesRow = {
  id: string;
  org_id: string;
  owner_id: string | null;
  seller_id: string | null;
  project_id: string | null;
  title: string;
  description: string | null;
  type: PropertyType;
  listing_kind: ListingKind;
  status: PropertyStatus;
  price: number;
  monthly_rent: number | null;
  rooms: number | null;
  size_sqm: number | null;
  outdoor_sqm: number | null;
  floor: number | null;
  total_floors: number | null;
  has_parking: boolean;
  has_elevator: boolean;
  has_balcony: boolean;
  has_safe_room: boolean;
  has_storage: boolean;
  is_accessible: boolean;
  location: Json;
  city: string | null;
  region: Region | null;
  zono_score: number | null;
  estimated_days_to_sell: number | null;
  has_exclusivity: boolean;
  exclusivity_ends_at: string | null;
  listed_at: string | null;
  neighborhood: string | null;
  building_number: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  show_exact_address: boolean;
  show_neighborhood_only: boolean;
  parking_count: number | null;
  storage_count: number | null;
  balcony_count: number | null;
  features: Json;
  listing_tag: ListingTag | null;
  availability_date: string | null;
  price_before_discount: number | null;
  price_per_sqm: number | null;
  marketing_description: string | null;
  ai_description: string | null;
  internal_notes: string | null;
  target_audience: string | null;
  marketing_audiences: Json;
  quality_score: number | null;
  last_ai_generated_at: string | null;
  primary_image_url: string | null;
  published_at: string | null;
  property_origin: string;
  source_type: string;
  external_source: string | null;
  ownership_scope: string;
  exclusivity_scope: string;
  listing_rights: string;
  uploaded_by_user_id: string | null;
  assigned_agent_id: string | null;
  office_owner_id: string | null;
  source_listing_id: string | null;
  source_listing_url: string | null;
  source_last_synced_at: string | null;
  source_status: string | null;
  is_internal_inventory: boolean;
  is_external_inventory: boolean;
  is_exclusive: boolean;
  is_office_exclusive: boolean;
  is_agent_exclusive: boolean;
  deal_priority_score: number;
  internal_double_side_priority: boolean;
  source_metadata: Json;
  created_at: string;
  updated_at: string;
}

type ExternalListingSourcesRow = {
  id: string;
  org_id: string | null;
  provider: string;
  name: string;
  is_active: boolean;
  configuration: Json;
  created_at: string;
  updated_at: string;
};

type ExternalListingsRow = {
  id: string;
  org_id: string;
  source: string;
  source_id: string;
  external_id: string | null;
  title: string | null;
  city: string | null;
  locality_id: string | null;
  neighborhood: string | null;
  street: string | null;
  street_number: string | null;
  address: string | null;
  property_type: string | null;
  deal_type: string | null;
  price: number | null;
  rooms: number | null;
  bathrooms: number | null;
  balconies: number | null;
  floor: number | null;
  total_floors: number | null;
  sqm: number | null;
  area_sqm: number | null;
  lot_size: number | null;
  parking: boolean | null;
  storage: boolean | null;
  elevator: boolean | null;
  accessibility: boolean | null;
  secure_room: boolean | null;
  condition: string | null;
  description: string | null;
  images: Json;
  floorplan_images: Json;
  contact_name: string | null;
  contact_phone: string | null;
  contact_type: string | null;
  has_agent: boolean | null;
  listing_url: string | null;
  published_at: string | null;
  first_seen_at: string;
  imported_at: string;
  last_synced_at: string | null;
  removed_at: string | null;
  status: string;
  opportunity_score: number;
  duplicate_group_id: string | null;
  duplicate_confidence_score: number | null;
  primary_property_id: string | null;
  promoted_property_id: string | null;
  metadata: Json;
  listing_source_type: string;
  broker_detection_badge: string | null;
  broker_confidence_score: number;
  detected_broker_id: string | null;
  detected_broker_name: string | null;
  broker_match_status: string;
  broker_evidence: Json;
  broker_detected_at: string | null;
  broker_detection_status: string;
  broker_detection_source: string | null;
  broker_detection_last_run_at: string | null;
  broker_detection_locked: boolean;
  created_at: string;
  updated_at: string;
};

type DealForecastsRow = {
  id: string;
  organization_id: string;
  match_id: string | null;
  deal_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  property_id: string | null;
  assigned_agent_id: string | null;
  locality: string | null;
  property_type: string | null;
  forecast_stage: string;
  closing_probability: number;
  expected_close_date: string | null;
  expected_days_to_close: number | null;
  estimated_deal_value: number | null;
  estimated_commission: number | null;
  probability_weighted_revenue: number;
  deal_health_score: number;
  deal_risk_score: number;
  urgency_score: number;
  momentum_score: number;
  confidence_score: number;
  primary_blocker: string | null;
  next_best_action: string | null;
  forecast_reason: string | null;
  ai_summary: string | null;
  ai_risk_summary: string | null;
  ai_recommendation_summary: string | null;
  status: string;
  metadata: Json;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type PipelineSnapshotsRow = {
  id: string;
  organization_id: string;
  date: string;
  total_pipeline_value: number;
  probability_weighted_revenue: number;
  expected_commission: number;
  active_forecasts_count: number;
  high_probability_count: number;
  at_risk_count: number;
  expected_closes_7d: number;
  expected_closes_30d: number;
  by_agent: Json;
  by_locality: Json;
  by_property_type: Json;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type DealForecastSignalsRow = {
  id: string;
  organization_id: string;
  forecast_id: string | null;
  signal_type: string;
  title: string;
  description: string | null;
  impact_score: number;
  confidence_score: number;
  metadata: Json;
  status: string;
  created_at: string;
};

type GraphEntitiesRow = {
  id: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  title: string;
  subtitle: string | null;
  health_score: number;
  importance_score: number;
  activity_score: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type GraphRelationshipsRow = {
  id: string;
  organization_id: string;
  source_entity_type: string;
  source_entity_id: string;
  target_entity_type: string;
  target_entity_id: string;
  relationship_type: string;
  strength_score: number;
  confidence_score: number;
  relationship_status: string;
  metadata: Json;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

type GraphSignalsRow = {
  id: string;
  organization_id: string;
  signal_type: string;
  title: string;
  description: string | null;
  confidence_score: number;
  impact_score: number;
  source_entities: Json;
  status: string;
  created_at: string;
};

type AgentIntelligenceProfilesRow = {
  id: string;
  organization_id: string;
  user_id: string;
  agent_score: number;
  territory_score: number;
  conversion_score: number;
  responsiveness_score: number;
  expertise_score: number;
  customer_score: number;
  workload_score: number;
  momentum_score: number;
  satisfaction_score: number;
  reliability_score: number;
  active_leads: number;
  active_buyers: number;
  active_sellers: number;
  active_properties: number;
  active_matches: number;
  total_closed_deals: number;
  total_revenue: number;
  avg_response_minutes: number | null;
  avg_days_to_close: number | null;
  primary_localities: Json;
  primary_property_types: Json;
  primary_deal_types: Json;
  strengths: Json;
  weaknesses: Json;
  next_best_growth_area: string | null;
  ai_summary: string | null;
  ai_growth_advice: string | null;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type AgentLocalityPerformanceRow = {
  id: string;
  organization_id: string;
  user_id: string;
  locality: string;
  leads_count: number;
  meetings_count: number;
  deals_count: number;
  revenue: number;
  avg_days_to_close: number | null;
  conversion_rate: number;
  satisfaction_rate: number;
  created_at: string;
  updated_at: string;
};

type AgentPropertyTypePerformanceRow = {
  id: string;
  organization_id: string;
  user_id: string;
  property_type: string;
  leads_count: number;
  deals_count: number;
  conversion_rate: number;
  avg_days_to_close: number | null;
  revenue: number;
  created_at: string;
  updated_at: string;
};

type LeadRoutingProfilesRow = {
  id: string;
  organization_id: string;
  lead_id: string;
  recommended_agent_id: string | null;
  assigned_agent_id: string | null;
  routing_score: number;
  confidence_score: number;
  expected_conversion_probability: number;
  expected_days_to_close: number | null;
  expected_revenue: number | null;
  routing_reason: string | null;
  routing_factors: Json;
  ai_routing_reason: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type LeadRoutingCandidatesRow = {
  id: string;
  organization_id: string;
  routing_profile_id: string;
  user_id: string;
  rank: number;
  score: number;
  probability: number;
  reason: string | null;
  created_at: string;
};

type CompetitorProfilesRow = {
  id: string;
  organization_id: string;
  broker_profile_id: string | null;
  display_name: string;
  competitor_type: string;
  market_share_score: number;
  inventory_strength_score: number;
  growth_score: number;
  exclusivity_score: number;
  pricing_power_score: number;
  activity_score: number;
  acquisition_risk_score: number;
  opportunity_score: number;
  total_listings: number;
  active_localities: number;
  dominant_localities: Json;
  first_seen_at: string | null;
  last_seen_at: string | null;
  ai_summary: string | null;
  ai_risk_summary: string | null;
  ai_opportunity_summary: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type CompetitorMarketPositionsRow = {
  id: string;
  organization_id: string;
  competitor_profile_id: string;
  locality: string;
  listings_count: number;
  market_share_percent: number;
  avg_price: number | null;
  avg_price_per_sqm: number | null;
  exclusives_count: number;
  private_seller_loss_count: number;
  inventory_change_30d: number;
  growth_rate: number;
  rank: number;
  created_at: string;
  updated_at: string;
};

type CompetitorSignalsRow = {
  id: string;
  organization_id: string;
  competitor_profile_id: string | null;
  signal_type: string;
  locality: string | null;
  title: string;
  description: string | null;
  severity: string;
  confidence_score: number;
  metadata: Json;
  created_at: string;
};

type InventoryAcquisitionProfilesRow = {
  id: string;
  organization_id: string;
  external_listing_id: string;
  acquisition_score: number;
  private_seller_score: number;
  buyer_demand_score: number;
  price_opportunity_score: number;
  market_gap_score: number;
  contactability_score: number;
  broker_competition_score: number;
  double_side_potential_score: number;
  transaction_valuation_score: number;
  transaction_gap_percent: number | null;
  transaction_confidence: number;
  transaction_comparables: number;
  research_report_id: string | null;
  acquisition_status: string;
  next_best_action: string | null;
  reason_summary: string | null;
  ai_summary: string | null;
  ai_outreach_strategy: string | null;
  ai_risk_summary: string | null;
  metadata: Json;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type InventoryAcquisitionActionsRow = {
  id: string;
  organization_id: string;
  acquisition_profile_id: string;
  external_listing_id: string | null;
  action_type: string;
  title: string;
  description: string | null;
  urgency_score: number;
  impact_score: number;
  confidence_score: number;
  expected_outcome: string | null;
  status: string;
  related_task_id: string | null;
  created_at: string;
  updated_at: string;
};

type InventoryAcquisitionReviewsRow = {
  id: string;
  organization_id: string;
  external_listing_id: string | null;
  acquisition_profile_id: string | null;
  review_type: string;
  title: string;
  reason: string | null;
  confidence_score: number;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type BrokerProfilesRow = {
  id: string;
  org_id: string;
  display_name: string;
  normalized_name: string;
  broker_type: string;
  agency_name: string | null;
  normalized_agency: string | null;
  phone: string | null;
  normalized_phone: string | null;
  email: string | null;
  website: string | null;
  license_number: string | null;
  primary_city: string | null;
  verification_status: string;
  confidence_score: number;
  listings_count: number;
  ai_summary: string | null;
  metadata: Json;
  created_by_user_id: string | null;
  verified_by_user_id: string | null;
  verified_at: string | null;
  logo_url: string | null;
  logo_storage_path: string | null;
  logo_hash: string | null;
  logo_embedding: Json | null;
  brand_colors: Json;
  region: string | null;
  emails: Json;
  google_business_url: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  linkedin_url: string | null;
  enrichment_status: string;
  last_enriched_at: string | null;
  created_at: string;
  updated_at: string;
};

type BrokerLogoAssetsRow = {
  id: string;
  org_id: string;
  broker_id: string;
  original_url: string | null;
  storage_path: string | null;
  image_hash: string | null;
  embedding: Json | null;
  width: number | null;
  height: number | null;
  source: string | null;
  confidence_score: number;
  status: string;
  created_at: string;
  updated_at: string;
};

type BrokerAliasesRow = {
  id: string;
  org_id: string;
  broker_id: string;
  alias_type: string;
  value: string;
  normalized_value: string;
  source: string | null;
  created_at: string;
};

type BrokerSourcesRow = {
  id: string;
  org_id: string;
  broker_id: string;
  source_type: string;
  url: string | null;
  evidence: Json;
  captured_at: string | null;
  created_at: string;
};

type BrokerServiceAreasRow = {
  id: string;
  org_id: string;
  broker_id: string;
  locality_id: string | null;
  city_name: string;
  created_at: string;
};

type BrokerDiscoveryRunsRow = {
  id: string;
  org_id: string;
  provider: string;
  status: string;
  params: Json;
  found_count: number;
  created_count: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_by: string | null;
  created_at: string;
};

type BrokerMatchReviewsRow = {
  id: string;
  org_id: string;
  listing_id: string | null;
  broker_id: string | null;
  match_type: string | null;
  confidence_score: number;
  evidence: Json;
  status: string;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
};

type PropertyBrokerMatchesRow = {
  id: string;
  org_id: string;
  external_listing_id: string | null;
  property_id: string | null;
  broker_id: string;
  match_type: string | null;
  confidence_score: number;
  status: string;
  evidence: Json;
  is_exclusive_probability: number;
  is_competitor_listing: boolean;
  created_at: string;
  updated_at: string;
};

type ExternalListingHistoryRow = {
  id: string;
  org_id: string;
  listing_id: string;
  change_type: string;
  old_value: Json | null;
  new_value: Json | null;
  created_at: string;
};

type ExternalListingDuplicatesRow = {
  id: string;
  org_id: string;
  listing_id: string;
  duplicate_of_listing_id: string | null;
  internal_property_id: string | null;
  confidence_score: number;
  reason: string | null;
  status: string;
  created_at: string;
};

type ImportJobsRow = {
  id: string;
  org_id: string;
  provider: string;
  status: string;
  params: Json;
  total_found: number;
  total_imported: number;
  total_updated: number;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ImportJobLogsRow = {
  id: string;
  org_id: string;
  job_id: string;
  level: string;
  message: string;
  metadata: Json;
  created_at: string;
};

type PropertyMediaRow = {
  id: string;
  org_id: string;
  property_id: string;
  type: MediaType;
  url: string;
  storage_path: string | null;
  mime_type: string | null;
  file_size: number | null;
  width: number | null;
  height: number | null;
  sort_order: number;
  is_primary: boolean;
  alt_text: string | null;
  external_url: string | null;
  created_at: string;
  updated_at: string;
};

type PropertyJourneysRow = {
  id: string;
  org_id: string;
  property_id: string;
  current_stage: JourneyStage;
  stage_entered_at: string;
  last_activity_at: string;
  progress: number;
  stage_history: Json;
  created_at: string;
  updated_at: string;
};

type PropertyIntelligenceProfilesRow = {
  id: string;
  org_id: string;
  property_id: string;
  blueprint_id: string | null;
  mission_type: string | null;
  mission_title: string | null;
  mission_description: string | null;
  target_sale_days: number | null;
  target_price: number | null;
  target_leads: number | null;
  target_visits: number | null;
  target_offers: number | null;
  health_score: number;
  success_score: number;
  risk_score: number;
  marketing_score: number;
  exposure_score: number;
  seller_trust_score: number;
  market_position_score: number;
  momentum_score: number;
  current_stage: string | null;
  next_best_action: string | null;
  intelligence_summary: string | null;
  autonomous_mode_enabled: boolean;
  allowed_auto_actions: Json;
  approval_required_actions: Json;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type PropertyBlueprintsRow = {
  id: string;
  org_id: string | null;
  name: string;
  property_type: string | null;
  deal_type: string | null;
  exclusivity_type: string | null;
  target_days: number | null;
  description: string | null;
  stages: Json;
  required_actions: Json;
  recommended_actions: Json;
  risk_rules: Json;
  scoring_rules: Json;
  calendar_rules: Json;
  is_system_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type PropertyMissionsRow = {
  id: string;
  org_id: string;
  property_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  target_metric: string | null;
  target_value: number | null;
  current_value: number;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type PropertyLeversRow = {
  id: string;
  org_id: string;
  property_id: string;
  lever_type: string | null;
  title: string;
  description: string | null;
  expected_impact: string | null;
  impact_score: number;
  effort_score: number;
  urgency_score: number;
  confidence_score: number;
  status: string;
  related_task_id: string | null;
  related_meeting_id: string | null;
  created_at: string;
  updated_at: string;
};

type PropertyRisksRow = {
  id: string;
  org_id: string;
  property_id: string;
  risk_type: string | null;
  severity: string;
  title: string;
  description: string | null;
  detected_at: string;
  resolved_at: string | null;
  status: string;
  recommended_action: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type PropertyExposureChannelsRow = {
  id: string;
  org_id: string;
  property_id: string;
  channel: string;
  status: string;
  published_url: string | null;
  published_at: string | null;
  last_checked_at: string | null;
  views_count: number;
  leads_count: number;
  clicks_count: number;
  engagement_score: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type PropertySellerTouchpointsRow = {
  id: string;
  org_id: string;
  property_id: string;
  seller_id: string | null;
  touchpoint_type: string | null;
  title: string | null;
  description: string | null;
  direction: string;
  sentiment: string | null;
  seller_response: string | null;
  trust_impact_score: number;
  created_by_user_id: string | null;
  created_at: string;
};

type PropertyCalendarPlansRow = {
  id: string;
  org_id: string;
  property_id: string;
  title: string;
  description: string | null;
  plan_type: string | null;
  suggested_date: string | null;
  scheduled_event_id: string | null;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
};

type PropertyScoreEventsRow = {
  id: string;
  org_id: string;
  property_id: string;
  score_type: string;
  old_score: number | null;
  new_score: number | null;
  reason: string | null;
  created_at: string;
};

type ActivityEventsRow = {
  id: string;
  org_id: string;
  actor_user_id: string | null;
  actor_type: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  title: string;
  description: string | null;
  channel: string | null;
  direction: string | null;
  priority: string | null;
  status: string | null;
  sentiment: string | null;
  metadata: Json;
  occurred_at: string;
  created_at: string;
};

type EntityRelationshipsRow = {
  id: string;
  org_id: string;
  source_entity_type: string;
  source_entity_id: string;
  target_entity_type: string;
  target_entity_id: string;
  relationship_type: string;
  strength_score: number;
  status: string;
  metadata: Json;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type CommunicationThreadsRow = {
  id: string;
  org_id: string;
  contact_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  property_id: string | null;
  deal_id: string | null;
  channel: string;
  title: string | null;
  status: string;
  last_message_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type CommunicationMessagesRow = {
  id: string;
  org_id: string;
  thread_id: string;
  sender_user_id: string | null;
  direction: string;
  channel: string;
  subject: string | null;
  body: string | null;
  transcript: string | null;
  ai_summary: string | null;
  sentiment: string | null;
  external_message_id: string | null;
  metadata: Json;
  sent_at: string | null;
  received_at: string | null;
  created_at: string;
};

type CommunicationIntelligenceProfilesRow = {
  id: string;
  org_id: string;
  entity_type: string;
  entity_id: string;
  relationship_type: string | null;
  communication_health_score: number;
  responsiveness_score: number;
  sentiment_score: number;
  followup_risk_score: number;
  trust_impact_score: number;
  engagement_impact_score: number;
  momentum_impact_score: number;
  last_contact_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  days_since_contact: number | null;
  unanswered_messages_count: number;
  missed_followups_count: number;
  open_commitments_count: number;
  next_best_action: string | null;
  ai_summary: string | null;
  ai_risk_summary: string | null;
  ai_recommendation_summary: string | null;
  created_at: string;
  updated_at: string;
};

type CommunicationCommitmentsRow = {
  id: string;
  org_id: string;
  entity_type: string;
  entity_id: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  commitment_text: string;
  promised_by_user_id: string | null;
  promised_to_type: string | null;
  promised_to_id: string | null;
  due_date: string | null;
  status: string;
  fulfilled_at: string | null;
  broken_at: string | null;
  impact_score: number;
  created_at: string;
  updated_at: string;
};

type CommunicationFollowupsRow = {
  id: string;
  org_id: string;
  entity_type: string;
  entity_id: string;
  related_entity_type: string | null;
  related_entity_id: string | null;
  followup_type: string | null;
  title: string;
  reason: string | null;
  priority: string;
  due_at: string | null;
  status: string;
  completed_at: string | null;
  related_task_id: string | null;
  created_at: string;
  updated_at: string;
};

type CommunicationInsightsRow = {
  id: string;
  org_id: string;
  entity_type: string;
  entity_id: string;
  insight_type: string;
  title: string;
  description: string | null;
  severity: string;
  confidence_score: number;
  recommended_action: string | null;
  metadata: Json;
  created_at: string;
};

type MarketAreaSnapshotsRow = {
  id: string;
  organization_id: string;
  locality_id: string | null;
  locality_name: string;
  date: string;
  active_external_listings: number;
  active_internal_properties: number;
  avg_price: number | null;
  avg_price_per_sqm: number | null;
  median_price: number | null;
  min_price: number | null;
  max_price: number | null;
  avg_rooms: number | null;
  price_drops_count: number;
  below_average_count: number;
  private_owner_count: number;
  duplicate_candidates_count: number;
  active_buyers_count: number;
  matched_buyers_count: number;
  demand_score: number;
  supply_score: number;
  opportunity_score: number;
  heat_level: string;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type TeamIntelligenceProfilesRow = {
  id: string;
  organization_id: string;
  user_id: string;
  performance_score: number;
  revenue_score: number;
  conversion_score: number;
  activity_score: number;
  responsiveness_score: number;
  workload_score: number;
  forecast_score: number;
  client_satisfaction_score: number;
  reliability_score: number;
  coaching_score: number;
  active_leads: number;
  active_buyers: number;
  active_sellers: number;
  active_properties: number;
  active_matches: number;
  total_revenue: number;
  forecast_revenue: number;
  won_deals: number;
  lost_deals: number;
  avg_days_to_close: number | null;
  avg_response_time: number | null;
  locality_count: number;
  property_type_count: number;
  performance_tier: string;
  growth_trend: string;
  strengths: Json;
  weaknesses: Json;
  coaching_priorities: Json;
  ai_summary: string | null;
  ai_growth_plan: string | null;
  ai_coaching_plan: string | null;
  role: string | null;
  branch: string | null;
  start_date: string | null;
  communication_score: number;
  relationship_score: number;
  strongest_locality: string | null;
  strongest_property_type: string | null;
  strongest_customer_type: string | null;
  ai_strengths: Json;
  ai_weaknesses: Json;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type OfficeIntelligenceProfilesRow = {
  id: string;
  organization_id: string;
  office_health_score: number;
  health_level: string;
  lead_health: number;
  pipeline_health: number;
  inventory_health: number;
  forecast_health: number;
  communication_health: number;
  agent_health: number;
  market_health: number;
  routing_health: number;
  matching_health: number;
  decision_health: number;
  growth_score: number;
  risk_score: number;
  ai_office_summary: string | null;
  ai_management_plan: string | null;
  metadata: Json;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type TeamOpportunityLeaksRow = {
  id: string;
  organization_id: string;
  leak_type: string;
  entity_type: string | null;
  entity_id: string | null;
  owner_user_id: string | null;
  title: string;
  reason: string | null;
  lost_revenue_impact: number;
  severity: string;
  recommended_action: string | null;
  status: string;
  created_at: string;
};

type ManagementActionsRow = {
  id: string;
  organization_id: string;
  action_type: string;
  title: string;
  reason: string | null;
  priority_score: number;
  urgency_score: number;
  impact_score: number;
  expected_revenue_impact: number;
  expected_conversion_lift: number;
  recommended_owner_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  href: string | null;
  rank_position: number | null;
  status: string;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type CommunityProfilesRow = {
  id: string;
  organization_id: string;
  name: string;
  platform: string;
  city: string | null;
  locality: string | null;
  audience_type: string;
  members_count: number;
  engagement_score: number;
  lead_score: number;
  deal_score: number;
  roi_score: number;
  trust_score: number;
  status: string;
  notes: string | null;
  normalized_name: string | null;
  community_type: string;
  source_type: string;
  external_community_id: string | null;
  source_url: string | null;
  privacy_level: string;
  locality_id: string | null;
  neighborhood: string | null;
  service_areas: string[];
  language: string;
  description: string | null;
  rules_summary: string | null;
  admin_names: string[];
  tags: string[];
  metadata: Json;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

type CommunityDnaProfilesRow = {
  id: string;
  organization_id: string;
  community_id: string;
  audience_mix: Json;
  property_type_fit: Json;
  budget_ranges: Json;
  preferred_localities: string[];
  preferred_neighborhoods: string[];
  best_content_types: string[];
  best_posting_times: Json;
  communication_style: string | null;
  community_strengths: Json;
  community_weaknesses: Json;
  confidence_score: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type PropertyCommunityMatchesRow = {
  id: string;
  organization_id: string;
  property_id: string;
  community_id: string;
  match_score: number;
  audience_score: number;
  location_score: number;
  property_type_score: number;
  budget_score: number;
  engagement_score: number;
  historical_score: number;
  lead_potential_score: number;
  deal_potential_score: number;
  compliance_score: number;
  confidence_score: number;
  recommended_rank: number | null;
  reason: string | null;
  expected_reach: number;
  expected_leads: number;
  expected_deals: number;
  expected_revenue: number;
  status: string;
  created_at: string;
  updated_at: string;
};

type DistributionPlansRow = {
  id: string;
  organization_id: string;
  property_id: string;
  marketing_profile_id: string | null;
  status: string;
  distribution_score: number;
  expected_reach: number;
  expected_leads: number;
  expected_matches: number;
  expected_deals: number;
  expected_revenue: number;
  recommended_strategy: string | null;
  recommended_frequency: string | null;
  recommended_time_window: string | null;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

type DistributionPlanItemsRow = {
  id: string;
  organization_id: string;
  distribution_plan_id: string;
  community_id: string;
  property_community_match_id: string | null;
  channel: string | null;
  recommended_order: number | null;
  recommended_posting_time: string | null;
  recommended_frequency: string | null;
  expected_reach: number;
  expected_leads: number;
  expected_deals: number;
  expected_revenue: number;
  status: string;
  reason: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type DailyDistributionBatchesRow = {
  id: string;
  organization_id: string;
  user_id: string | null;
  batch_date: string;
  status: string;
  total_items: number;
  published_items: number;
  skipped_items: number;
  failed_items: number;
  expected_reach: number;
  expected_leads: number;
  expected_deals: number;
  summary: string | null;
  created_at: string;
  updated_at: string;
};

type DailyDistributionItemsRow = {
  id: string;
  organization_id: string;
  batch_id: string;
  user_id: string | null;
  property_id: string | null;
  community_id: string | null;
  distribution_plan_id: string | null;
  distribution_plan_item_id: string | null;
  platform: string | null;
  community_url: string | null;
  property_title: string | null;
  community_name: string | null;
  recommended_time: string | null;
  priority_score: number;
  expected_reach: number;
  expected_leads: number;
  expected_deals: number;
  post_text: string | null;
  post_title: string | null;
  suggested_cta: string | null;
  suggested_hashtags: string[];
  creative_url: string | null;
  image_url: string | null;
  copy_payload: Json;
  status: string;
  manual_post_url: string | null;
  manual_published_at: string | null;
  skipped_reason: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

type DistributionOpportunitySignalsRow = {
  id: string;
  organization_id: string;
  signal_type: string;
  community_id: string | null;
  property_id: string | null;
  user_id: string | null;
  locality: string | null;
  title: string;
  description: string | null;
  impact_score: number;
  expected_leads: number;
  expected_deals: number;
  expected_revenue: number;
  urgency_score: number;
  confidence_score: number;
  status: string;
  created_at: string;
  updated_at: string;
};

type CommunityActivityLogsRow = {
  id: string;
  organization_id: string;
  community_id: string | null;
  activity_type: string;
  entity_type: string | null;
  entity_id: string | null;
  title: string | null;
  description: string | null;
  metadata: Json;
  created_at: string;
};

type CommunityLeadAttributionRow = {
  id: string;
  organization_id: string;
  community_id: string | null;
  lead_id: string | null;
  property_id: string | null;
  campaign_id: string | null;
  distribution_item_id: string | null;
  source_interaction_id: string | null;
  attribution_confidence: number;
  attribution_reason: string | null;
  created_at: string;
};

type GeoCoverageTargetsRow = {
  id: string;
  organization_id: string;
  city_name: string;
  city_name_he: string | null;
  locality_id: string | null;
  neighborhood_name: string | null;
  neighborhood_name_he: string | null;
  lat: number | null;
  lng: number | null;
  radius_meters: number;
  priority: number;
  coverage_status: string;
  last_sync_at: string | null;
  transactions_found: number;
  last_error: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type PropertyTransactionsRow = {
  id: string;
  organization_id: string;
  source_platform: string;
  source_actor: string;
  source_run_id: string | null;
  asset_id: string | null;
  external_id: string | null;
  deal_date: string | null;
  deal_amount: number | null;
  price_per_sqm: number | null;
  address: string | null;
  normalized_address: string | null;
  city_name: string | null;
  neighborhood_name: string | null;
  street: string | null;
  street_number: string | null;
  lat: number | null;
  lng: number | null;
  rooms: number | null;
  floor: string | null;
  area: number | null;
  property_type: string | null;
  is_first_hand: boolean | null;
  gush: string | null;
  helka: string | null;
  tat_helka: string | null;
  madlan_transaction_id: string | null;
  building_year: number | null;
  mediation: string | null;
  source_url: string | null;
  duplicate_of: string | null;
  raw_payload: Json;
  scraped_at: string | null;
  created_at: string;
  updated_at: string;
};

type TransactionSyncLogsRow = {
  id: string;
  organization_id: string;
  agent_id: string | null;
  user_id: string | null;
  city_name: string | null;
  neighborhood_name: string | null;
  coverage_target_id: string | null;
  actor_name: string | null;
  actor_id: string | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  records_imported: number;
  duplicates_skipped: number;
  failed_records: number;
  total_records: number;
  error_message: string | null;
  raw_response: Json;
  created_at: string;
};

type PropertyResearchReportsRow = {
  id: string;
  organization_id: string;
  property_listing_id: string | null;
  external_listing_id: string | null;
  acquisition_profile_id: string | null;
  created_by: string | null;
  city_name: string | null;
  neighborhood_name: string | null;
  address: string | null;
  normalized_address: string | null;
  rooms: number | null;
  area: number | null;
  asking_price: number | null;
  asking_price_per_sqm: number | null;
  estimated_market_value: number | null;
  avg_price_per_sqm: number | null;
  median_price_per_sqm: number | null;
  min_price_per_sqm: number | null;
  max_price_per_sqm: number | null;
  gap_from_market_percent: number | null;
  comparable_transactions: Json;
  confidence_score: number;
  confidence_level: string;
  explanation_hebrew: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type BuildingIntelligenceRow = {
  id: string;
  organization_id: string;
  city_name: string | null;
  street: string | null;
  house_number: string | null;
  normalized_address: string | null;
  transactions_count: number;
  last_transaction_date: string | null;
  avg_price_per_sqm: number | null;
  median_price_per_sqm: number | null;
  min_price_per_sqm: number | null;
  max_price_per_sqm: number | null;
  avg_deal_amount: number | null;
  price_trend_12m: number | null;
  price_trend_24m: number | null;
  confidence_score: number;
  summary_hebrew: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type StreetIntelligenceRow = {
  id: string;
  organization_id: string;
  city_name: string | null;
  street: string | null;
  transactions_count: number;
  avg_price_per_sqm: number | null;
  median_price_per_sqm: number | null;
  min_price_per_sqm: number | null;
  max_price_per_sqm: number | null;
  avg_deal_amount: number | null;
  price_trend_6m: number | null;
  price_trend_12m: number | null;
  price_trend_24m: number | null;
  liquidity_score: number | null;
  street_score: number | null;
  confidence_score: number;
  summary_hebrew: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type TransactionOpportunityRadarAlertsRow = {
  id: string;
  organization_id: string;
  property_listing_id: string | null;
  external_listing_id: string | null;
  acquisition_profile_id: string | null;
  research_report_id: string | null;
  city_name: string | null;
  neighborhood_name: string | null;
  address: string | null;
  asking_price: number | null;
  estimated_market_value: number | null;
  gap_from_market_percent: number | null;
  opportunity_score: number;
  confidence_score: number;
  opportunity_type: string;
  reason_hebrew: string | null;
  recommended_action_hebrew: string | null;
  status: string;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type DealProfilesRow = {
  id: string;
  organization_id: string;
  match_id: string | null;
  deal_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  property_id: string | null;
  assigned_agent_id: string | null;
  deal_stage: string;
  deal_health: number;
  deal_risk: number;
  deal_velocity: number;
  deal_probability: number;
  deal_value: number;
  commission_value: number;
  expected_close_date: string | null;
  primary_blocker: string | null;
  next_best_action: string | null;
  ai_summary: string | null;
  status: string;
  locality: string | null;
  metadata: Json;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type DealJourneysRow = {
  id: string;
  organization_id: string;
  deal_profile_id: string;
  stage: string;
  entered_at: string;
  exited_at: string | null;
  duration_hours: number | null;
  owner_id: string | null;
  note: string | null;
  created_at: string;
};

type DealNegotiationsRow = {
  id: string;
  organization_id: string;
  deal_profile_id: string;
  asking_price: number | null;
  buyer_offer: number | null;
  seller_counter_offer: number | null;
  current_gap: number;
  price_movement: number;
  concessions: Json;
  agreement_probability: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type DealObjectionsRow = {
  id: string;
  organization_id: string;
  deal_profile_id: string;
  objection_type: string;
  severity: string;
  resolved: boolean;
  owner_id: string | null;
  description: string | null;
  recommended_action: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type DealTasksRow = {
  id: string;
  organization_id: string;
  deal_profile_id: string;
  title: string;
  owner_id: string | null;
  priority: string;
  deadline: string | null;
  impact_score: number;
  status: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
};

type SocialInteractionsRow = {
  id: string;
  organization_id: string;
  platform: string | null;
  community_id: string | null;
  property_id: string | null;
  distribution_queue_id: string | null;
  daily_distribution_item_id: string | null;
  external_post_url: string | null;
  external_post_id: string | null;
  external_comment_id: string | null;
  person_name: string | null;
  profile_url: string | null;
  interaction_type: string;
  message_text: string | null;
  detected_intent: string | null;
  sentiment: string | null;
  lead_score: number;
  status: string;
  raw_payload: Json;
  interaction_score: number;
  intent_score: number;
  lead_probability: number;
  engagement_level: string;
  intent_confidence: number;
  lead_quality: number;
  urgency_score: number;
  source_platform: string | null;
  source_post_url: string | null;
  source_post_id: string | null;
  source_user_name: string | null;
  source_profile_url: string | null;
  created_at: string;
  updated_at: string;
};

type SocialLeadsRow = {
  id: string;
  organization_id: string;
  lead_id: string | null;
  social_interaction_id: string;
  property_id: string | null;
  community_id: string | null;
  distribution_item_id: string | null;
  campaign_id: string | null;
  platform: string | null;
  source_url: string | null;
  profile_url: string | null;
  person_name: string | null;
  intent: string | null;
  lead_score: number;
  ai_summary: string | null;
  ai_next_action: string | null;
  status: string;
  lead_quality_score: number;
  priority_score: number;
  intent_confidence: number;
  urgency_score: number;
  recommended_next_action: string | null;
  assigned_agent_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  converted_buyer_id: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

type SocialFollowupsRow = {
  id: string;
  organization_id: string;
  social_lead_id: string | null;
  lead_id: string | null;
  community_id: string | null;
  property_id: string | null;
  user_id: string | null;
  due_at: string | null;
  priority: string;
  reason: string | null;
  title: string | null;
  status: string;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type DistributionQueueRow = {
  id: string;
  organization_id: string;
  distribution_plan_id: string | null;
  distribution_plan_item_id: string | null;
  daily_distribution_item_id: string | null;
  property_id: string | null;
  community_id: string | null;
  content_id: string | null;
  platform: string | null;
  publish_mode: string;
  scheduled_at: string | null;
  status: string;
  external_post_url: string | null;
  external_post_id: string | null;
  failure_reason: string | null;
  created_at: string;
  updated_at: string;
};

type CommunityIntelligenceProfilesRow = {
  id: string;
  organization_id: string;
  community_id: string;
  activity_score: number;
  lead_quality_score: number;
  deal_generation_score: number;
  audience_match_score: number;
  roi_score: number;
  growth_score: number;
  community_health_score: number;
  community_influence_score: number;
  level: string;
  ai_summary: string | null;
  reach_score: number;
  trust_score: number;
  influence_score: number;
  spam_risk_score: number;
  compliance_risk_score: number;
  intelligence_level: string;
  leads_generated: number;
  buyers_created: number;
  sellers_created: number;
  matches_created: number;
  deals_created: number;
  estimated_revenue: number;
  estimated_commission: number;
  last_distribution_at: string | null;
  strengths: Json;
  weaknesses: Json;
  recommended_use: string | null;
  risk_summary: string | null;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type PropertyMarketingProfilesRow = {
  id: string;
  organization_id: string;
  property_id: string;
  target_audience: Json;
  buyer_personas: Json;
  motivators: Json;
  objections: Json;
  pain_points: Json;
  angles: Json;
  recommended_channels: Json;
  recommended_communities: Json;
  recommended_content_types: Json;
  recommended_publishing_times: Json;
  recommended_budget_level: string | null;
  expected_lead_volume: number;
  expected_conversion: number;
  marketing_score: number;
  ai_summary: string | null;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type BuyerSegmentsRow = {
  id: string;
  organization_id: string;
  segment_key: string;
  label: string;
  segment_size: number;
  segment_quality: number;
  segment_activity: number;
  segment_conversion: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type MarketingOpportunitySignalsRow = {
  id: string;
  organization_id: string;
  signal_type: string;
  entity_type: string | null;
  entity_id: string | null;
  title: string;
  description: string | null;
  impact_score: number;
  confidence_score: number;
  recommended_action: string | null;
  metadata: Json;
  status: string;
  created_at: string;
};

type OrganizationRevenueProfilesRow = {
  id: string;
  organization_id: string;
  current_month_revenue: number;
  current_quarter_revenue: number;
  current_year_revenue: number;
  forecast_revenue_30: number;
  forecast_revenue_60: number;
  forecast_revenue_90: number;
  probability_weighted_revenue: number;
  revenue_at_risk: number;
  lost_revenue: number;
  recovered_revenue: number;
  revenue_gap: number;
  growth_rate: number;
  forecast_confidence: number;
  revenue_gap_score: number;
  gap_level: string;
  ai_revenue_summary: string | null;
  metadata: Json;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type RevenueTargetsRow = {
  id: string;
  organization_id: string;
  scope_type: string;
  scope_id: string | null;
  scope_label: string | null;
  period_type: string;
  period_start: string;
  target_amount: number;
  actual_amount: number;
  forecast_amount: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type RevenueLeakageEventsRow = {
  id: string;
  organization_id: string;
  source: string;
  entity_type: string | null;
  entity_id: string | null;
  owner_user_id: string | null;
  title: string;
  reason: string | null;
  lost_revenue: number;
  recoverable: boolean;
  severity: string;
  status: string;
  created_at: string;
};

type TeamPerformanceSnapshotsRow = {
  id: string;
  organization_id: string;
  date: string;
  office_health_score: number;
  office_growth_score: number;
  office_risk_score: number;
  office_revenue: number;
  office_forecast_revenue: number;
  total_agents: number;
  elite_agents: number;
  declining_agents: number;
  overloaded_agents: number;
  underutilized_agents: number;
  coaching_needed: number;
  avg_conversion_rate: number;
  opportunity_leakage: number;
  weak_localities: number;
  agent_rankings: Json;
  workload_distribution: Json;
  territory_coverage: Json;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type AgentCoachingSignalsRow = {
  id: string;
  organization_id: string;
  user_id: string;
  signal_type: string;
  severity: string;
  confidence_score: number;
  impact_score: number;
  title: string;
  description: string | null;
  recommendation: string | null;
  metadata: Json;
  status: string;
  created_at: string;
};

type SellerIntelligenceProfilesRow = {
  id: string;
  org_id: string;
  seller_id: string;
  seller_health_score: number;
  seller_trust_score: number;
  seller_engagement_score: number;
  seller_confidence_score: number;
  seller_satisfaction_score: number;
  seller_churn_risk_score: number;
  seller_response_score: number;
  seller_relationship_score: number;
  current_status: string;
  current_stage: string | null;
  last_contact_at: string | null;
  next_best_action: string | null;
  intelligence_summary: string | null;
  trust_trend: string;
  engagement_trend: string;
  satisfaction_trend: string;
  days_since_last_contact: number | null;
  meetings_count: number;
  calls_count: number;
  reports_sent_count: number;
  reports_opened_count: number;
  properties_count: number;
  active_properties_count: number;
  ai_summary: string | null;
  ai_risk_summary: string | null;
  ai_opportunity_summary: string | null;
  autonomous_mode_enabled: boolean;
  allowed_auto_actions: Json;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type SellerMissionsRow = {
  id: string;
  org_id: string;
  seller_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  target_metric: string | null;
  target_value: number | null;
  current_value: number;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type SellerRisksRow = {
  id: string;
  org_id: string;
  seller_id: string;
  risk_type: string | null;
  severity: string;
  title: string;
  description: string | null;
  recommended_action: string | null;
  status: string;
  detected_at: string;
  resolved_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type SellerTouchpointsRow = {
  id: string;
  org_id: string;
  seller_id: string;
  property_id: string | null;
  touchpoint_type: string | null;
  direction: string;
  title: string | null;
  description: string | null;
  sentiment: string | null;
  impact_score: number;
  trust_impact: number;
  engagement_impact: number;
  created_by_user_id: string | null;
  occurred_at: string;
  created_at: string;
};

type SellerCommitmentsRow = {
  id: string;
  org_id: string;
  seller_id: string;
  property_id: string | null;
  title: string;
  description: string | null;
  promised_at: string;
  due_date: string | null;
  fulfilled_at: string | null;
  status: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type DecisionIntelligenceProfilesRow = {
  id: string;
  org_id: string;
  organization_health_score: number;
  organization_risk_score: number;
  organization_growth_score: number;
  organization_execution_score: number;
  organization_attention_score: number;
  organization_revenue_score: number;
  active_properties: number;
  active_sellers: number;
  high_risk_properties: number;
  high_risk_sellers: number;
  stalled_properties: number;
  stalled_sellers: number;
  overdue_tasks: number;
  overdue_commitments: number;
  top_priority_entity_id: string | null;
  top_priority_entity_type: string | null;
  top_priority_reason: string | null;
  executive_summary: string | null;
  risk_summary: string | null;
  growth_summary: string | null;
  next_best_business_action: string | null;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type AttentionItemsRow = {
  id: string;
  org_id: string;
  entity_type: string;
  entity_id: string;
  attention_score: number;
  urgency_score: number;
  impact_score: number;
  confidence_score: number;
  revenue_impact_score: number;
  relationship_impact_score: number;
  churn_impact_score: number;
  title: string;
  reason: string | null;
  recommended_action: string | null;
  expected_outcome: string | null;
  status: string;
  detected_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type OpportunitySignalsRow = {
  id: string;
  org_id: string;
  entity_type: string;
  entity_id: string;
  opportunity_score: number;
  impact_score: number;
  confidence_score: number;
  title: string;
  description: string | null;
  recommended_action: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type DecisionQueueRow = {
  id: string;
  org_id: string;
  entity_type: string;
  entity_id: string;
  priority_score: number;
  rank_position: number;
  title: string;
  reason: string | null;
  action_type: string | null;
  action_payload: Json;
  expected_impact: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type DecisionRecommendationsRow = {
  id: string;
  org_id: string;
  entity_type: string | null;
  entity_id: string | null;
  recommendation_type: string | null;
  title: string;
  description: string | null;
  urgency_score: number;
  impact_score: number;
  confidence_score: number;
  expected_result: string | null;
  generated_at: string;
  created_at: string;
};

type BuyerIntelligenceProfilesRow = {
  id: string;
  org_id: string;
  buyer_id: string;
  buyer_health_score: number;
  buyer_readiness_score: number;
  buyer_engagement_score: number;
  buyer_qualification_score: number;
  buyer_trust_score: number;
  buyer_financing_score: number;
  buyer_momentum_score: number;
  buyer_conversion_probability: number;
  current_stage: string;
  current_status: string;
  next_best_action: string | null;
  viewed_properties_count: number;
  visits_count: number;
  liked_properties_count: number;
  rejected_properties_count: number;
  offers_count: number;
  meetings_count: number;
  calls_count: number;
  last_activity_at: string | null;
  last_visit_at: string | null;
  days_since_activity: number | null;
  primary_objection: string | null;
  purchase_motivation: string | null;
  urgency_level: string | null;
  preferred_area_summary: string | null;
  intelligence_summary: string | null;
  ai_summary: string | null;
  ai_risk_summary: string | null;
  ai_recommendation_summary: string | null;
  autonomous_mode_enabled: boolean;
  allowed_auto_actions: Json;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type BuyerMissionsRow = {
  id: string;
  org_id: string;
  buyer_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  target_metric: string | null;
  target_value: number | null;
  current_value: number;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type BuyerRisksRow = {
  id: string;
  org_id: string;
  buyer_id: string;
  risk_type: string | null;
  severity: string;
  title: string;
  description: string | null;
  recommended_action: string | null;
  status: string;
  detected_at: string;
  resolved_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type BuyerTouchpointsRow = {
  id: string;
  org_id: string;
  buyer_id: string;
  property_id: string | null;
  touchpoint_type: string | null;
  direction: string;
  title: string | null;
  description: string | null;
  sentiment: string | null;
  impact_score: number;
  trust_impact: number;
  engagement_impact: number;
  created_by_user_id: string | null;
  occurred_at: string;
  created_at: string;
};

type BuyerObjectionsRow = {
  id: string;
  org_id: string;
  buyer_id: string;
  objection_type: string | null;
  severity: string;
  title: string | null;
  description: string | null;
  resolved: boolean;
  resolved_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type BuyerCommitmentsRow = {
  id: string;
  org_id: string;
  buyer_id: string;
  property_id: string | null;
  title: string;
  description: string | null;
  promised_at: string;
  due_date: string | null;
  fulfilled_at: string | null;
  status: string;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type MatchIntelligenceProfilesRow = {
  id: string;
  org_id: string;
  buyer_id: string;
  property_id: string;
  seller_id: string | null;
  compatibility_score: number;
  readiness_score: number;
  engagement_score: number;
  trust_score: number;
  timing_score: number;
  momentum_score: number;
  risk_score: number;
  closing_probability: number;
  opportunity_score: number;
  revenue_score: number;
  urgency_score: number;
  match_status: string;
  match_stage: string;
  next_best_action: string | null;
  primary_blocker: string | null;
  strongest_advantage: string | null;
  estimated_deal_value: number | null;
  estimated_commission: number | null;
  intelligence_summary: string | null;
  ai_summary: string | null;
  ai_risk_summary: string | null;
  ai_recommendation_summary: string | null;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type MatchRisksRow = {
  id: string;
  org_id: string;
  match_id: string;
  risk_type: string | null;
  severity: string;
  title: string;
  description: string | null;
  recommended_action: string | null;
  status: string;
  detected_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

type MatchObjectionsRow = {
  id: string;
  org_id: string;
  match_id: string;
  objection_type: string | null;
  severity: string;
  description: string | null;
  resolved: boolean;
  resolution_action: string | null;
  resolved_at: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

type MatchOpportunitiesRow = {
  id: string;
  org_id: string;
  match_id: string;
  opportunity_score: number;
  revenue_score: number;
  urgency_score: number;
  estimated_deal_value: number | null;
  estimated_commission: number | null;
  recommended_action: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

type RevenueSignalsRow = {
  id: string;
  org_id: string;
  match_id: string | null;
  estimated_commission: number;
  expected_revenue: number;
  confidence: number;
  probability_weighted_revenue: number;
  created_at: string;
  updated_at: string;
};

type DealsRow = {
  id: string;
  org_id: string;
  owner_id: string | null;
  title: string;
  type: DealType;
  stage: DealStage;
  status: DealStatus;
  value: number | null;
  commission_amount: number | null;
  commission_pct: number | null;
  probability: number | null;
  buyer_id: string | null;
  seller_id: string | null;
  property_id: string | null;
  unit_id: string | null;
  project_id: string | null;
  lead_id: string | null;
  expected_close_date: string | null;
  closed_at: string | null;
  lost_reason: string | null;
  created_at: string;
  updated_at: string;
}

type OpportunitiesRow = {
  id: string;
  org_id: string;
  owner_id: string | null;
  type: OpportunityType;
  priority: OpportunityPriority;
  status: OpportunityStatus;
  title: string;
  summary: string | null;
  suggested_action: string | null;
  potential_value: number | null;
  confidence: number | null;
  property_id: string | null;
  unit_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  lead_id: string | null;
  deal_id: string | null;
  snoozed_until: string | null;
  created_at: string;
  updated_at: string;
}

type MatchingResultsRow = {
  id: string;
  org_id: string;
  buyer_id: string;
  property_id: string | null;
  unit_id: string | null;
  score: number;
  reasons: Json;
  meets_hard_constraints: boolean;
  status: MatchingStatus;
  source: MatchingSource;
  created_at: string;
  updated_at: string;
}

type ActivitiesRow = {
  id: string;
  org_id: string;
  actor_id: string | null;
  type: ActivityType;
  direction: ActivityDirection;
  subject: string | null;
  body: string | null;
  metadata: Json;
  automation_id: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  lead_id: string | null;
  property_id: string | null;
  unit_id: string | null;
  project_id: string | null;
  deal_id: string | null;
  occurred_at: string;
  created_at: string;
}

type TasksRow = {
  id: string;
  org_id: string;
  assignee_id: string | null;
  created_by: string | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  completed_at: string | null;
  is_automatable: boolean;
  buyer_id: string | null;
  seller_id: string | null;
  lead_id: string | null;
  property_id: string | null;
  unit_id: string | null;
  project_id: string | null;
  deal_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  impact_score: number | null;
  intelligence_source: string | null;
  created_at: string;
  updated_at: string;
}

type NotesRow = {
  id: string;
  org_id: string;
  author_id: string | null;
  body: string;
  is_pinned: boolean;
  buyer_id: string | null;
  seller_id: string | null;
  lead_id: string | null;
  property_id: string | null;
  unit_id: string | null;
  project_id: string | null;
  deal_id: string | null;
  created_at: string;
  updated_at: string;
}

type MeetingsRow = {
  id: string;
  org_id: string;
  organizer_id: string | null;
  type: MeetingType;
  status: MeetingStatus;
  title: string;
  description: string | null;
  location: Json;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  attendees: Json;
  buyer_id: string | null;
  seller_id: string | null;
  lead_id: string | null;
  property_id: string | null;
  unit_id: string | null;
  project_id: string | null;
  deal_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  intelligence_source: string | null;
  created_at: string;
  updated_at: string;
}

type AutomationsRow = {
  id: string;
  org_id: string;
  created_by: string | null;
  name: string;
  description: string | null;
  status: AutomationStatus;
  is_enabled: boolean;
  trigger: AutomationTrigger;
  trigger_config: Json;
  conditions: Json;
  actions: Json;
  last_run_at: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

type DocumentsRow = {
  id: string;
  org_id: string;
  owner_id: string | null;
  type: DocumentType;
  status: DocumentStatus;
  title: string;
  file_url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  signers: Json;
  signed_at: string | null;
  expires_at: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  lead_id: string | null;
  property_id: string | null;
  unit_id: string | null;
  project_id: string | null;
  deal_id: string | null;
  // Documents & Signature OS extensions
  doc_category: string | null;
  signature_status: string;
  template_id: string | null;
  folder_id: string | null;
  current_version: number;
  match_id: string | null;
  requirement_key: string | null;
  is_required: boolean;
  source: string;
  rejected_reason: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
}

// ── Documents & Signature OS ────────────────────────────────────────────────
type DocumentTemplatesRow = {
  id: string; organization_id: string | null; template_key: string; name_he: string;
  doc_category: string; description_he: string | null; body_template: string | null;
  default_participants: Json; applies_to_stage: string | null; is_system: boolean;
  is_active: boolean; sort_order: number; created_at: string; updated_at: string;
};
type DocumentVersionsRow = {
  id: string; organization_id: string; document_id: string; version: number;
  file_url: string | null; storage_path: string | null; change_note: string | null;
  created_by: string | null; created_at: string;
};
type DocumentParticipantsRow = {
  id: string; organization_id: string; document_id: string; role: string; participant_type: string;
  user_id: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  order_index: number; status: string; created_at: string; updated_at: string;
};
type DocumentRequestsRow = {
  id: string; organization_id: string; document_id: string; requested_by: string | null;
  channel: string; status: string; provider_ref: string | null; due_at: string | null;
  note: string | null; created_at: string; updated_at: string;
};
type DocumentSignaturesRow = {
  id: string; organization_id: string; document_id: string; participant_id: string | null;
  signer_name: string; signed_at: string; ip_hash: string | null; device: string | null;
  method: string; signature_ref: string | null; created_at: string;
};
type DocumentAuditLogsRow = {
  id: string; organization_id: string; document_id: string | null; actor_user_id: string | null;
  event: string; detail: string | null; ip_hash: string | null; created_at: string;
};
type DocumentRequirementsRow = {
  id: string; organization_id: string | null; context: string; stage: string | null;
  doc_category: string; is_blocking: boolean; blocks_stage: string | null;
  description_he: string | null; is_system: boolean; sort_order: number; created_at: string;
};
type DocumentChecklistsRow = {
  id: string; organization_id: string; deal_id: string | null; context: string; stage: string | null;
  total_required: number; completed_count: number; missing_count: number; blocking_count: number;
  completion_pct: number; risk_level: string; items: Json; computed_at: string;
};
type DocumentFoldersRow = {
  id: string; organization_id: string; name: string; parent_id: string | null;
  entity_type: string | null; entity_id: string | null; created_by: string | null; created_at: string;
};

type NotificationsRow = {
  id: string;
  org_id: string;
  user_id: string;
  level: NotificationLevel;
  category: NotificationCategory | null;
  title: string;
  body: string | null;
  is_read: boolean;
  read_at: string | null;
  href: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  lead_id: string | null;
  property_id: string | null;
  deal_id: string | null;
  opportunity_id: string | null;
  task_id: string | null;
  meeting_id: string | null;
  due_at: string | null;
  created_at: string;
}

type IsraelLocalitiesRow = {
  id: string;
  locality_code: string;
  name_he: string;
  name_en: string | null;
  locality_type: string | null;
  district: string | null;
  subdistrict: string | null;
  municipality_status: string | null;
  population: number | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type IsraelNeighborhoodsRow = {
  id: string;
  locality_code: string | null;
  city_name: string;
  name_he: string;
  normalized_name: string;
  place_type: string | null;
  lat: number | null;
  lng: number | null;
  source: string;
  confidence_score: number;
  is_verified: boolean;
  aliases: Json;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type OrgOperatingLocalitiesRow = {
  id: string;
  organization_id: string;
  locality_id: string;
  is_primary: boolean;
  min_price: number | null;
  max_price: number | null;
  min_rooms: number | null;
  max_rooms: number | null;
  property_types: Json;
  deal_types: Json;
  created_at: string;
  updated_at: string;
};

type UserOperatingLocalitiesRow = {
  id: string;
  user_id: string;
  locality_id: string;
  is_primary: boolean;
  min_price: number | null;
  max_price: number | null;
  min_rooms: number | null;
  max_rooms: number | null;
  property_types: Json;
  deal_types: Json;
  organization_id: string | null;
  city_name: string | null;
  neighborhoods: Json;
  is_active: boolean;
  use_for_leads: boolean;
  use_for_properties: boolean;
  use_for_transactions: boolean;
  use_for_external_listings: boolean;
  use_for_recommendations: boolean;
  added_by: string | null;
  added_at: string;
  last_sync_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type EngineRunsRow = {
  id: string;
  organization_id: string;
  engine_key: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  rows_processed: number | null;
  result_summary: Json;
  error_message: string | null;
  triggered_by: string | null;
  created_at: string;
};

type AuditLogRow = {
  id: string;
  organization_id: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  category: string;
  entity_type: string | null;
  entity_id: string | null;
  summary: string | null;
  metadata: Json;
  created_at: string;
};

type NotificationStateRow = {
  id: string;
  organization_id: string;
  user_id: string;
  item_key: string;
  state: string;
  created_at: string;
  updated_at: string;
};

type NeighborhoodsRow = {
  id: string;
  city_code: string;
  city_name: string;
  neighborhood_name: string;
  normalized_name: string | null;
  confidence_score: number | null;
  confidence_level: string | null;
  source_type: string | null;
  status: string | null;
  raw_ai_response: Json;
  created_at: string;
  updated_at: string;
};

type NeighborhoodEnrichmentCitiesRow = {
  id: string;
  city_code: string;
  city_name: string;
  row_index: number;
  status: string;
  attempts: number;
  neighborhoods_count: number;
  confidence_summary: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

// ── Recommendation Intelligence OS ──────────────────────────────────────────
type RecommendationProfilesRow = {
  id: string;
  organization_id: string;
  entity_type: string;
  entity_id: string;
  recommendation_health_score: number;
  recommendation_readiness_score: number;
  recommendation_confidence_score: number;
  open_recommendations_count: number;
  high_priority_recommendations_count: number;
  accepted_recommendations_count: number;
  rejected_recommendations_count: number;
  converted_recommendations_count: number;
  last_generated_at: string | null;
  summary_hebrew: string | null;
  next_best_recommendation_id: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type RecommendationsRow = {
  id: string;
  organization_id: string;
  source_entity_type: string;
  source_entity_id: string;
  target_entity_type: string;
  target_entity_id: string | null;
  recommendation_type: string;
  title_hebrew: string;
  description_hebrew: string | null;
  reason_hebrew: string | null;
  next_best_action_hebrew: string | null;
  recommendation_score: number;
  confidence_score: number;
  urgency_score: number;
  impact_score: number;
  expected_revenue: number;
  expected_commission: number;
  expected_conversion_lift: number;
  expected_days_to_value: number | null;
  evidence: Json;
  supporting_transactions: Json;
  supporting_properties: Json;
  supporting_buyers: Json;
  supporting_sellers: Json;
  supporting_deals: Json;
  supporting_geo: Json;
  supporting_market: Json;
  status: string;
  review_status: string;
  assigned_user_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  converted_at: string | null;
  expires_at: string | null;
  generated_by: string;
  generation_reason: string | null;
  source_confidence: string;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type RecommendationPackagesRow = {
  id: string;
  organization_id: string;
  package_type: string;
  entity_type: string;
  entity_id: string;
  title_hebrew: string | null;
  summary_hebrew: string | null;
  sections: Json;
  recommendation_ids: string[];
  included_properties: Json;
  included_transactions: Json;
  included_market_insights: Json;
  included_actions: Json;
  confidence_score: number;
  package_score: number;
  status: string;
  created_by: string | null;
  approved_by: string | null;
  sent_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type RecommendationEventsRow = {
  id: string;
  organization_id: string;
  recommendation_id: string | null;
  event_type: string;
  actor_user_id: string | null;
  entity_type: string | null;
  entity_id: string | null;
  notes: string | null;
  metadata: Json;
  created_at: string;
};

type RecommendationFeedbackRow = {
  id: string;
  organization_id: string;
  recommendation_id: string | null;
  user_id: string | null;
  feedback_type: string | null;
  rating: number | null;
  notes: string | null;
  metadata: Json;
  created_at: string;
};

type RecommendationMapPointsRow = {
  id: string;
  organization_id: string;
  entity_type: string | null;
  entity_id: string | null;
  lat: number | null;
  lng: number | null;
  city_name: string | null;
  neighborhood_name: string | null;
  street: string | null;
  score: number;
  recommendation_count: number;
  opportunity_score: number;
  demand_score: number;
  supply_score: number;
  confidence_score: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

// ── Territory Intelligence OS ────────────────────────────────────────────────
type TerritoryProfilesRow = {
  id: string;
  organization_id: string;
  territory_type: string;
  territory_key: string;
  city_name: string | null;
  neighborhood_name: string | null;
  street: string | null;
  demand_score: number;
  supply_score: number;
  acquisition_score: number;
  revenue_score: number;
  forecast_score: number;
  competition_score: number;
  dominance_score: number;
  penetration_score: number;
  opportunity_score: number;
  growth_score: number;
  white_space_score: number;
  territory_health_score: number;
  territory_level: string;
  active_buyers: number;
  active_sellers: number;
  active_properties: number;
  active_deals: number;
  active_matches: number;
  external_inventory: number;
  internal_inventory: number;
  transaction_volume_90d: number;
  transaction_volume_365d: number;
  avg_price: number | null;
  avg_price_sqm: number | null;
  expected_revenue: number;
  expected_commission: number;
  competitor_count: number;
  dominant_competitor_id: string | null;
  assigned_agents_count: number;
  recommendation_count: number;
  confidence_score: number;
  summary_hebrew: string | null;
  metadata: Json;
  last_calculated_at: string | null;
  created_at: string;
  updated_at: string;
};

type TerritorySignalsRow = {
  id: string;
  organization_id: string;
  territory_profile_id: string | null;
  signal_type: string;
  score: number;
  confidence_score: number;
  title: string;
  reason: string | null;
  recommended_action: string | null;
  status: string;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type TerritoryAssignmentsRow = {
  id: string;
  organization_id: string;
  territory_profile_id: string;
  user_id: string | null;
  role: string | null;
  priority: number;
  ownership_level: string;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type TerritorySnapshotsRow = {
  id: string;
  organization_id: string;
  territory_profile_id: string | null;
  territory_type: string | null;
  territory_key: string | null;
  scores: Json;
  metrics: Json;
  snapshot_date: string;
  created_at: string;
};

type TerritoryDnaProfilesRow = {
  id: string;
  organization_id: string;
  territory_profile_id: string;
  strongest_property_type: string | null;
  strongest_buyer_type: string | null;
  transaction_velocity: number;
  inventory_balance: number;
  buyer_demand: number;
  seller_activity: number;
  acquisition_potential: number;
  revenue_potential: number;
  recommendation_density: number;
  dominant_competitor_id: string | null;
  dna_summary_hebrew: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type StreetTerritoryProfilesRow = {
  id: string;
  organization_id: string;
  city_name: string | null;
  neighborhood_name: string | null;
  street: string;
  transaction_trend: number;
  buyer_trend: number;
  seller_trend: number;
  acquisition_opportunity: number;
  competitor_pressure: number;
  office_penetration: number;
  revenue_opportunity: number;
  transaction_count_365d: number;
  avg_price_sqm: number | null;
  confidence_score: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type BuildingClusterProfilesRow = {
  id: string;
  organization_id: string;
  city_name: string | null;
  neighborhood_name: string | null;
  street: string | null;
  cluster_key: string;
  turnover_score: number;
  investor_score: number;
  acquisition_score: number;
  activity_score: number;
  transaction_count: number;
  avg_price_sqm: number | null;
  confidence_score: number;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

// ── Client Portal OS ─────────────────────────────────────────────────────────
type ClientPortalsRow = {
  id: string;
  organization_id: string;
  portal_type: string;
  entity_type: string;
  entity_id: string;
  client_name: string | null;
  client_email: string | null;
  client_phone: string | null;
  title_hebrew: string | null;
  description_hebrew: string | null;
  access_token_hash: string;
  access_slug: string | null;
  status: string;
  visibility_level: string;
  expires_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type ClientPortalViewsRow = {
  id: string;
  organization_id: string;
  portal_id: string | null;
  viewed_at: string;
  ip_hash: string | null;
  user_agent_hash: string | null;
  referrer: string | null;
  metadata: Json;
  created_at: string;
};

type ClientPortalSectionsRow = {
  id: string;
  organization_id: string;
  portal_id: string | null;
  section_type: string;
  title_hebrew: string | null;
  content: Json;
  sort_order: number;
  is_visible: boolean;
  requires_approval: boolean;
  approved_by: string | null;
  approved_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type ClientPortalItemsRow = {
  id: string;
  organization_id: string;
  portal_id: string | null;
  section_id: string | null;
  item_type: string;
  source_entity_type: string | null;
  source_entity_id: string | null;
  title_hebrew: string | null;
  description_hebrew: string | null;
  data: Json;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

// ── Office Website Generator OS ──────────────────────────────────────────────
type OfficeWebsitesRow = {
  id: string;
  organization_id: string;
  slug: string | null;
  status: string;
  office_name: string | null;
  headline_hebrew: string | null;
  description_hebrew: string | null;
  cover_image_url: string | null;
  logo_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  office_hours: string | null;
  social_links: Json;
  enabled_sections: Json;
  featured_property_ids: string[];
  featured_project_ids: string[];
  testimonials: Json;
  theme: Json;
  seo: Json;
  view_count: number;
  last_published_at: string | null;
  created_by: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type OfficeWebsiteLeadsRow = {
  id: string;
  organization_id: string;
  website_id: string | null;
  lead_id: string | null;
  source_section: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  property_type: string | null;
  rooms: string | null;
  message: string | null;
  intent: string | null;
  status: string;
  metadata: Json;
  created_at: string;
};

type OfficeWebsiteEventsRow = {
  id: string;
  organization_id: string;
  website_id: string | null;
  event_type: string;
  path: string | null;
  entity_type: string | null;
  entity_id: string | null;
  ip_hash: string | null;
  user_agent_hash: string | null;
  metadata: Json;
  created_at: string;
};

// ── Agent Website Generator OS ───────────────────────────────────────────────
type AgentWebsitesRow = {
  id: string;
  organization_id: string;
  user_id: string;
  slug: string | null;
  status: string;
  display_name: string | null;
  title_hebrew: string | null;
  headline_hebrew: string | null;
  bio_hebrew: string | null;
  profile_image_url: string | null;
  cover_image_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  specialties: string[];
  languages: string[];
  service_areas: string[];
  years_experience: number | null;
  social_links: Json;
  enabled_sections: Json;
  featured_property_ids: string[];
  featured_project_ids: string[];
  testimonials: Json;
  theme: Json;
  seo: Json;
  view_count: number;
  last_published_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};

type AgentWebsiteLeadsRow = {
  id: string;
  organization_id: string;
  agent_website_id: string | null;
  agent_user_id: string | null;
  lead_id: string | null;
  source_section: string;
  full_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  property_type: string | null;
  rooms: string | null;
  budget: string | null;
  timeline: string | null;
  message: string | null;
  intent: string | null;
  status: string;
  metadata: Json;
  created_at: string;
};

type AgentWebsiteEventsRow = {
  id: string;
  organization_id: string;
  agent_website_id: string | null;
  event_type: string;
  path: string | null;
  entity_type: string | null;
  entity_id: string | null;
  ip_hash: string | null;
  user_agent_hash: string | null;
  metadata: Json;
  created_at: string;
};

// ── Automation & Workflow OS ────────────────────────────────────────────────
type AutomationWorkflowsRow = {
  id: string;
  organization_id: string;
  created_by: string | null;
  name: string;
  description: string | null;
  category: string;
  status: string;
  is_enabled: boolean;
  trigger_type: string;
  scope: string;
  owner_user_id: string | null;
  require_approval: boolean;
  run_count: number;
  last_run_at: string | null;
  opportunities_generated: number;
  tasks_generated: number;
  template_key: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};
type AutomationTriggersRow = {
  id: string;
  organization_id: string;
  workflow_id: string;
  trigger_type: string;
  config: Json;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};
type AutomationConditionsRow = {
  id: string;
  organization_id: string;
  workflow_id: string;
  condition_type: string;
  operator: string;
  value_number: number | null;
  value_text: string | null;
  config: Json;
  sort_order: number;
  created_at: string;
  updated_at: string;
};
type AutomationStepsRow = {
  id: string;
  organization_id: string;
  workflow_id: string;
  step_order: number;
  action_type: string;
  title: string | null;
  config: Json;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
};
type AutomationRunsRow = {
  id: string;
  organization_id: string;
  workflow_id: string;
  triggered_by: string | null;
  trigger_type: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  owner_user_id: string | null;
  status: string;
  blocked_reason: string | null;
  error_message: string | null;
  actions_prepared: number;
  actions_applied: number;
  opportunities_generated: number;
  reviewed_by: string | null;
  reviewed_at: string | null;
  applied_at: string | null;
  reversed_at: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};
type AutomationRunLogsRow = {
  id: string;
  organization_id: string;
  run_id: string;
  workflow_id: string | null;
  level: string;
  message: string;
  step_action_type: string | null;
  created_at: string;
};
type AutomationActionsRow = {
  id: string;
  organization_id: string;
  run_id: string;
  workflow_id: string | null;
  action_type: string;
  title: string;
  description: string | null;
  entity_type: string | null;
  entity_id: string | null;
  payload: Json;
  status: string;
  applied_table: string | null;
  applied_id: string | null;
  applied_at: string | null;
  reversed_at: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};
type AutomationTemplatesRow = {
  id: string;
  template_key: string;
  name: string;
  description: string | null;
  category: string;
  trigger_type: string;
  default_conditions: Json;
  default_steps: Json;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  // Automation Library OS (rich system-template model)
  organization_id: string | null;
  subcategory: string | null;
  title_hebrew: string | null;
  description_hebrew: string | null;
  business_goal_hebrew: string | null;
  conditions: Json;
  actions: Json;
  priority: number;
  risk_level: string | null;
  default_enabled: boolean;
  required_role: string;
  related_modules: string[];
  decision_brain_signal_type: string | null;
  expected_impact: string | null;
  expected_revenue_impact: number;
  expected_time_saved_minutes: number;
  audit_level: string;
  metadata: Json;
  updated_at: string;
};
type AutomationRecommendationsRow = {
  id: string;
  organization_id: string;
  template_key: string | null;
  title: string;
  reason: string | null;
  category: string;
  impact_score: number;
  status: string;
  created_at: string;
  updated_at: string;
};

// ── Automation Copy & Communication OS ──────────────────────────────────────
type AutomationCopyTemplatesRow = {
  id: string;
  template_key: string;
  category: string;
  voice: string;
  priority_label: string | null;
  title_he: string;
  subtitle_he: string | null;
  short_description_he: string | null;
  full_description_he: string;
  task_title_he: string | null;
  task_description_he: string | null;
  agent_guidance_he: string;
  manager_guidance_he: string;
  revenue_impact_he: string;
  urgency_reason_he: string | null;
  expected_outcome_he: string | null;
  decision_brain_summary_he: string;
  success_definition_he: string | null;
  client_draft_message_he: string | null;
  portal_message_he: string | null;
  website_message_he: string | null;
  audit_log_text_he: string | null;
  metadata: Json;
  created_at: string;
  updated_at: string;
};
type AutomationMessageVariantsRow = {
  id: string;
  template_key: string;
  channel: string;
  voice: string;
  message_he: string;
  created_at: string;
};
type AutomationVoicesRow = {
  voice_key: string;
  name_he: string;
  description_he: string;
  tone_he: string;
  sort_order: number;
};
type AutomationPriorityLabelsRow = {
  label_key: string;
  label_he: string;
  description_he: string;
  tone: string;
  sort_order: number;
};
type AutomationMicrocopyRow = {
  id: string;
  scope: string;
  copy_key: string;
  text_he: string;
};

// ── Mortgage & Financing Intelligence OS ────────────────────────────────────
type BuyerFinancialProfilesRow = {
  id: string;
  organization_id: string;
  buyer_id: string;
  monthly_income: number | null;
  household_income: number | null;
  employment_type: string | null;
  self_employed: boolean;
  salary_employed: boolean;
  existing_mortgage: number | null;
  monthly_debt: number | null;
  available_equity: number | null;
  available_down_payment: number | null;
  investment_capital: number | null;
  recommended_budget: number | null;
  max_budget: number | null;
  safe_budget: number | null;
  monthly_payment_estimate: number | null;
  down_payment_gap: number | null;
  financing_gap: number | null;
  required_equity: number | null;
  cash_gap: number | null;
  financial_readiness_score: number | null;
  financing_confidence_score: number | null;
  approval_probability: number | null;
  financing_strength: number | null;
  purchase_readiness: number | null;
  overall_readiness: number | null;
  financing_risk: string;
  readiness_band: string;
  primary_gap: string | null;
  notes: string | null;
  inputs_complete: boolean;
  metadata: Json;
  computed_at: string | null;
  created_at: string;
  updated_at: string;
};
type FinancingSignalsRow = {
  id: string;
  organization_id: string;
  buyer_id: string | null;
  deal_id: string | null;
  signal_type: string;
  score: number;
  title: string;
  reason: string | null;
  recommended_action: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

// ── Review, Referral & Reputation Intelligence OS ───────────────────────────
type ClientReviewsRow = {
  id: string; organization_id: string; buyer_id: string | null; seller_id: string | null; deal_id: string | null;
  agent_id: string | null; reviewer_name: string | null; rating: number | null; sentiment: string;
  quality_score: number | null; source: string; category: string; review_text: string | null;
  conversion_impact: number; is_featured: boolean; status: string; city: string | null; neighborhood: string | null;
  street: string | null; building: string | null; metadata: Json; created_at: string; updated_at: string;
};
type ReviewRequestsRow = {
  id: string; organization_id: string; buyer_id: string | null; seller_id: string | null; deal_id: string | null;
  requested_by: string | null; channel: string; status: string; note: string | null; created_at: string; updated_at: string;
};
type ReferralsRow = {
  id: string; organization_id: string; referrer_buyer_id: string | null; referrer_seller_id: string | null;
  referred_lead_id: string | null; referred_buyer_id: string | null; agent_id: string | null; deal_id: string | null;
  status: string; converted: boolean; revenue: number; commission: number; influence_score: number | null;
  source_city: string | null; source_neighborhood: string | null; source_street: string | null; source_building: string | null;
  note: string | null; metadata: Json; created_at: string; updated_at: string;
};
type ClientAdvocatesRow = {
  id: string; organization_id: string; client_type: string; client_id: string; client_name: string | null;
  advocate_score: number; advocate_level: string; deals_completed: number; reviews_count: number; referrals_count: number;
  repeat_business: boolean; relationship_strength: number | null; satisfaction_score: number | null;
  referral_revenue: number; last_computed_at: string | null; metadata: Json; created_at: string; updated_at: string;
};
type ReputationScoresRow = {
  id: string; organization_id: string; scope: string; scope_key: string; label: string | null;
  review_score: number; referral_score: number; influence_score: number; trust_score: number;
  review_count: number; referral_count: number; computed_at: string;
};
type ReputationSignalsRow = {
  id: string; organization_id: string; signal_type: string; buyer_id: string | null; seller_id: string | null;
  deal_id: string | null; scope_key: string | null; score: number; title: string; reason: string | null;
  recommended_action: string | null; status: string; created_at: string; updated_at: string;
};
type ReviewCampaignsRow = {
  id: string; organization_id: string; name: string; status: string; target: string | null;
  requests_count: number; reviews_count: number; created_by: string | null; created_at: string; updated_at: string;
};

// ── Autonomous Office AI Layer ──────────────────────────────────────────────
type AiBriefsRow = {
  id: string; organization_id: string; brief_type: string; scope: string;
  period_start: string | null; period_end: string | null; headline: string | null; summary: string | null;
  sections: Json; opportunity_count: number; risk_count: number; focus_count: number;
  generated_by: string | null; created_at: string;
};
type AiOpportunitiesRow = {
  id: string; organization_id: string; category: string; title: string; reason: string | null;
  recommended_action: string | null; source_module: string | null; entity_type: string | null; entity_id: string | null;
  impact_score: number; revenue_impact: number; score: number; status: string; created_at: string; updated_at: string;
};
type AiRisksRow = {
  id: string; organization_id: string; category: string; title: string; reason: string | null;
  recommended_action: string | null; source_module: string | null; entity_type: string | null; entity_id: string | null;
  severity: string; score: number; status: string; created_at: string; updated_at: string;
};
type AiFocusItemsRow = {
  id: string; organization_id: string; role: string; rank: number; title: string; reason: string | null;
  recommended_action: string | null; source_module: string | null; entity_type: string | null; entity_id: string | null;
  impact_score: number; status: string; created_at: string;
};
type AiGrowthPlansRow = {
  id: string; organization_id: string; plan_type: string; horizon_days: number; title: string; summary: string | null;
  steps: Json; expected_revenue_impact: number; status: string; created_by: string | null; created_at: string; updated_at: string;
};
type AiSimulationsRow = {
  id: string; organization_id: string; scenario_key: string; title: string; inputs: Json; projections: Json;
  summary: string | null; created_by: string | null; created_at: string;
};

// ── Facebook Community Discovery & Execution OS ─────────────────────────────
type CommunityCommentsRow = {
  id: string; organization_id: string; community_id: string | null; property_id: string | null; agent_id: string | null;
  source: string; author_name: string | null; comment_text: string | null; intent: string; intent_score: number;
  lead_created: boolean; social_lead_id: string | null; status: string; metadata: Json; created_at: string; updated_at: string;
};
type MessengerThreadsRow = {
  id: string; organization_id: string; community_id: string | null; property_id: string | null; agent_id: string | null;
  source: string; contact_name: string | null; last_message: string | null; intent: string; intent_score: number;
  lead_created: boolean; social_lead_id: string | null; status: string; metadata: Json; created_at: string; updated_at: string;
};
type SocialAccountSyncLogsRow = {
  id: string; organization_id: string; social_account_id: string | null; event: string; status: string; detail: string | null; created_at: string;
};
// Minimal shapes for existing Distribution-OS tables consumed by the community layer.
type SocialAccountsRow = {
  id: string; organization_id: string; user_id: string | null; provider: string; connection_status: string;
  last_sync_at: string | null; created_at: string;
};
type CommunityDealAttributionRow = {
  id: string; organization_id: string; community_id: string | null; property_id: string | null; attribution_confidence: number | null;
};

// ── WhatsApp Execution OS ───────────────────────────────────────────────────
type WhatsappAccountsRow = {
  id: string; organization_id: string; provider: string; connection_status: string; app_id_status: string;
  phone_number_status: string; webhook_status: string; token_status: string; business_hours: Json;
  auto_reply_allowed: boolean; approval_required: boolean; default_tone: string; safety_rules: Json;
  last_checked_at: string | null; metadata: Json; created_at: string; updated_at: string;
};
type WhatsappConversationsRow = {
  id: string; organization_id: string; contact_phone_hash: string | null; contact_name: string | null; channel: string;
  buyer_id: string | null; seller_id: string | null; lead_id: string | null; property_id: string | null; assigned_agent_id: string | null;
  state: string; intent: string; lead_score: number; urgency_score: number; unread: boolean; missed_call_flag: boolean;
  last_message: string | null; last_message_at: string | null; summary: Json; next_best_action: string | null; metadata: Json; created_at: string; updated_at: string;
};
type WhatsappMessagesRow = {
  id: string; organization_id: string; conversation_id: string | null; direction: string; source: string; body: string | null;
  intent: string | null; is_voice_note: boolean; transcript: string | null; transcription_status: string; status: string; metadata: Json; created_at: string;
};
type WhatsappDraftsRow = {
  id: string; organization_id: string; conversation_id: string | null; campaign_id: string | null; created_by: string | null;
  body: string; kind: string; risk_level: string; requires_approval: boolean; approval_status: string; approved_by: string | null;
  approved_at: string | null; send_status: string; sent_at: string | null; metadata: Json; created_at: string; updated_at: string;
};
type WhatsappCallEventsRow = {
  id: string; organization_id: string; conversation_id: string | null; contact_phone_hash: string | null; contact_name: string | null;
  event_type: string; source: string; recovery_status: string; recovered_lead_id: string | null; agent_id: string | null; occurred_at: string; metadata: Json; created_at: string;
};
type WhatsappFollowupsRow = {
  id: string; organization_id: string; conversation_id: string | null; followup_type: string; stage: number; mode: string;
  body: string | null; due_at: string | null; status: string; metadata: Json; created_at: string; updated_at: string;
};
type WhatsappCampaignsRow = {
  id: string; organization_id: string; name: string; goal: string; segment_id: string | null; property_id: string | null;
  message_template: string | null; status: string; audience_size: number; drafts_created: number; sent_count: number;
  replied_count: number; converted_count: number; created_by: string | null; metadata: Json; created_at: string; updated_at: string;
};
type WhatsappSegmentsRow = {
  id: string; organization_id: string; name: string; segment_key: string; predicate: Json; member_count: number;
  computed_at: string | null; metadata: Json; created_at: string; updated_at: string;
};
type WhatsappSmartLinksRow = {
  id: string; organization_id: string; slug: string; link_type: string; property_id: string | null; campaign_id: string | null;
  title: string | null; destination: string | null; click_count: number; conversion_count: number; created_by: string | null;
  is_active: boolean; metadata: Json; created_at: string; updated_at: string;
};
type WhatsappSmartLinkEventsRow = {
  id: string; organization_id: string; smart_link_id: string | null; event_type: string; utm_source: string | null; phone_hash: string | null; ip_hash: string | null; created_at: string;
};
type WhatsappKnowledgeBaseRow = {
  id: string; organization_id: string; scope: string; question: string | null; answer: string; status: string; risk_level: string;
  allowed_for_auto_reply: boolean; approved_by: string | null; version: number; metadata: Json; created_at: string; updated_at: string;
};
type WhatsappAiActionsRow = {
  id: string; organization_id: string; conversation_id: string | null; agent_mode: string | null; action_type: string; title: string;
  detail: string | null; requires_approval: boolean; status: string; applied_table: string | null; applied_id: string | null; metadata: Json; created_at: string; updated_at: string;
};
type WhatsappDailyMissionsRow = {
  id: string; organization_id: string; agent_id: string | null; mission_date: string; title: string; reason: string | null;
  recommended_action: string | null; priority: number; conversation_id: string | null; status: string; created_at: string;
};
type WhatsappAuditLogsRow = {
  id: string; organization_id: string; actor_user_id: string | null; event: string; detail: string | null; risk_level: string | null; conversation_id: string | null; created_at: string;
};

// ── Communication Intelligence OS (org_id convention) ───────────────────────
type CommunicationEventsRow = {
  id: string; org_id: string; thread_id: string | null; actor_user_id: string | null; source: string; channel: string | null; direction: string | null;
  entity_type: string; entity_id: string; related_entity_type: string | null; related_entity_id: string | null;
  title: string | null; body: string | null; transcript: string | null; is_voice_note: boolean; intent: string | null; sentiment: string | null;
  occurred_at: string; metadata: Json; created_at: string;
};
type CommunicationSummariesRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; thread_id: string | null; scope: string;
  summary_text: string | null; what_client_wants: string | null; what_changed: string | null; blocking_progress: string | null; next_step: string | null;
  key_points: Json; period_start: string | null; period_end: string | null; generated_at: string; created_at: string;
};
type CommunicationEntitiesRow = {
  id: string; org_id: string; event_id: string | null; entity_type: string; entity_id: string; extracted_kind: string;
  raw_value: string | null; normalized_value: string | null; confidence_score: number; created_at: string;
};
type CommunicationObjectionsRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; related_entity_type: string | null; related_entity_id: string | null; event_id: string | null;
  objection_type: string; severity: string; detail: string | null; resolved: boolean; resolution_method: string | null;
  detected_at: string; resolved_at: string | null; created_at: string; updated_at: string;
};
type CommunicationSentimentRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; event_id: string | null; sentiment: string; score: number; detected_at: string; created_at: string;
};
type CommunicationIntentsRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; event_id: string | null; intent: string; score: number; detected_at: string; created_at: string;
};
type CommunicationRisksRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; related_entity_type: string | null; related_entity_id: string | null;
  risk_type: string; severity: string; score: number; reason: string | null; recommended_action: string | null; status: string;
  detected_at: string; resolved_at: string | null; created_at: string; updated_at: string;
};
type CommunicationOpportunitiesRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; related_entity_type: string | null; related_entity_id: string | null;
  opportunity_type: string; score: number; reason: string | null; recommended_action: string | null; status: string;
  detected_at: string; acted_at: string | null; created_at: string; updated_at: string;
};
type ClientMemoryRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; communication_style: string | null; timeline: string | null;
  trust_score: number; engagement_score: number; preferences: Json; family: Json; budget: Json; budget_evolution: Json; motivations: Json; risks: Json;
  property_interests: Json; desired_cities: Json; desired_neighborhoods: Json; property_types: Json; viewing_history: Json; rejected_properties: Json; favorite_properties: Json; deal_history: Json;
  seller_motivation: string | null; seller_urgency: string | null; price_flexibility: string | null; created_at: string; updated_at: string;
};
type ConversationMemoryRow = {
  id: string; org_id: string; thread_id: string | null; entity_type: string; entity_id: string; last_summary: string | null; last_intent: string | null; last_sentiment: string | null;
  open_loops: Json; established_facts: Json; message_count: number; last_event_at: string | null; created_at: string; updated_at: string;
};

// ── Buyer & Seller Journey Intelligence OS (org_id convention) ──────────────
type JourneysRow = {
  id: string; org_id: string; journey_type: string; entity_type: string; entity_id: string; current_stage: string;
  stage_entered_at: string; last_activity_at: string; progress: number; health_score: number; engagement_score: number;
  conversion_score: number; risk_score: number; velocity_score: number; velocity_state: string; status: string;
  next_best_action: string | null; ai_summary: string | null; stage_history: Json; started_at: string; created_at: string; updated_at: string;
};
type JourneyStagesRow = {
  id: string; org_id: string | null; journey_type: string; stage_key: string; label: string; position: number; is_terminal: boolean; is_won: boolean; created_at: string;
};
type JourneyEventsRow = {
  id: string; org_id: string; journey_id: string | null; entity_type: string; entity_id: string; event_type: string;
  from_stage: string | null; to_stage: string | null; title: string | null; detail: string | null; occurred_at: string; metadata: Json; created_at: string;
};
type JourneyMilestonesRow = {
  id: string; org_id: string; journey_id: string | null; entity_type: string; entity_id: string; milestone_key: string; label: string;
  reached: boolean; reached_at: string | null; expected_by: string | null; created_at: string; updated_at: string;
};
type JourneyRisksRow = {
  id: string; org_id: string; journey_id: string | null; entity_type: string; entity_id: string; risk_type: string; severity: string; score: number;
  reason: string | null; recommended_action: string | null; status: string; detected_at: string; resolved_at: string | null; created_at: string; updated_at: string;
};
type JourneyOpportunitiesRow = {
  id: string; org_id: string; journey_id: string | null; entity_type: string; entity_id: string; opportunity_type: string; score: number;
  reason: string | null; recommended_action: string | null; status: string; detected_at: string; acted_at: string | null; created_at: string; updated_at: string;
};
type JourneyScoresRow = {
  id: string; org_id: string; journey_id: string | null; health_score: number; engagement_score: number; conversion_score: number; risk_score: number; velocity_score: number; captured_at: string;
};
type JourneyPredictionsRow = {
  id: string; org_id: string; journey_id: string | null; entity_type: string; entity_id: string; probability_convert: number; probability_drop: number;
  expected_days_to_convert: number | null; expected_deal_value: number | null; expected_commission: number | null; computed_at: string;
};
type JourneyBlockersRow = {
  id: string; org_id: string; journey_id: string | null; entity_type: string; entity_id: string; blocker_type: string; severity: string; detail: string | null;
  resolved: boolean; resolved_at: string | null; detected_at: string; created_at: string; updated_at: string;
};
type JourneyVelocityRow = {
  id: string; org_id: string; journey_id: string | null; entity_type: string; entity_id: string; velocity_state: string; days_in_stage: number; avg_days_per_stage: number | null; stage_changes_30d: number; computed_at: string;
};

// ── ZONO Creative Studio + Marketing DNA (org_id convention) ────────────────
type ZonoMarketingAssetsRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; uploaded_by: string | null; asset_type: string; asset_category: string | null;
  title: string | null; description: string | null; file_url: string; file_path: string | null; file_name: string | null; file_mime_type: string | null; file_size: number | null; thumbnail_url: string | null;
  source_type: string; status: string; is_approved_reference: boolean; is_rejected_reference: boolean; is_competitor_reference: boolean; is_property_photo: boolean; is_floor_plan: boolean; is_project_render: boolean; is_agent_brand_asset: boolean;
  tags: string[]; ai_summary: string | null; ai_extracted_colors: Json; ai_detected_style: Json; ai_detected_text: Json; ai_real_estate_features: Json; ai_visual_features: Json; created_at: string; updated_at: string;
};
type ZonoMarketingDnaProfilesRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; profile_status: string;
  dna_summary: string | null; visual_personality: string | null; copywriting_tone: string | null; real_estate_positioning: string | null;
  primary_colors: Json; secondary_colors: Json; accent_colors: Json; forbidden_colors: Json;
  preferred_typography: Json; forbidden_typography: Json; preferred_layouts: Json; rejected_layouts: Json;
  preferred_visual_styles: Json; rejected_visual_styles: Json; preferred_image_styles: Json; rejected_image_styles: Json;
  preferred_campaign_angles: Json; rejected_campaign_angles: Json; preferred_cta_styles: Json; whatsapp_cta_style: Json; target_audiences: Json;
  property_marketing_style: Json; project_marketing_style: Json; agent_marketing_style: Json; seller_recruitment_style: Json; buyer_recruitment_style: Json; neighborhood_storytelling_style: Json;
  brand_rules: Json; avoid_rules: Json;
  luxury_score: number; urgency_score: number; modern_score: number; sales_aggressiveness_score: number; investment_focus_score: number; lifestyle_focus_score: number; seller_focus_score: number; buyer_focus_score: number; visual_density_score: number; ai_generated_score: number;
  approved_patterns: Json; rejected_patterns: Json;
  agent_notes: string | null; office_notes: string | null; seller_notes: string | null; zono_notes: string | null;
  ai_confidence_score: number; last_analyzed_at: string | null; created_at: string; updated_at: string;
};
type ZonoMarketingFeedbackRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; asset_id: string | null; feedback_source: string; feedback_type: string; feedback_value: string | null; feedback_note: string | null; created_by: string | null; created_at: string;
};
type ZonoMarketingAnalysisJobsRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; status: string; job_type: string; input_asset_ids: string[]; result_profile_id: string | null; error_message: string | null; started_at: string | null; finished_at: string | null; created_at: string;
};
type ZonoCreativeConceptsRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; marketing_dna_profile_id: string | null;
  title: string; concept_type: string; description: string | null; marketing_angle: string | null; emotional_trigger: string | null;
  visual_hook: string | null; copy_hook: string | null; recommended_layout: string | null; recommended_cta_style: string | null; recommended_audience: string | null;
  reasoning: string | null; confidence_score: number; is_favorite: boolean; is_approved: boolean; status: string; generation_metadata: Json; created_at: string; updated_at: string;
};
type ZonoCampaignsRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; title: string; campaign_type: string;
  objective: string | null; target_audience: string | null; marketing_angle: string | null; campaign_summary: string | null; reasoning: string | null;
  status: string; marketing_dna_profile_id: string | null; source_concept_id: string | null; generation_metadata: Json; created_by: string | null; created_at: string; updated_at: string;
};
type ZonoCampaignAssetsRow = {
  id: string; org_id: string; campaign_id: string; asset_type: string; title: string | null; purpose: string | null;
  recommended_message: string | null; recommended_cta: string | null; audience_variant: string | null; priority: number; status: string; created_at: string; updated_at: string;
};
type ZonoCreativeAssetsRow = {
  id: string; org_id: string; campaign_id: string; campaign_asset_id: string | null; asset_type: string; title: string;
  objective: string | null; audience: string | null; marketing_angle: string | null; emotional_trigger: string | null; visual_hook: string | null; copy_hook: string | null; cta_style: string | null; recommended_layout: string | null;
  priority: number; reasoning: string | null; campaign_match_score: number; audience_match_score: number; conversion_potential_score: number; marketing_strength_score: number; asset_score: number;
  asset_status: string; is_favorite: boolean; is_approved: boolean; generation_metadata: Json; created_at: string; updated_at: string;
};
type ZonoCopyAssetsRow = {
  id: string; org_id: string; creative_asset_id: string | null; campaign_id: string | null; entity_type: string; entity_id: string; copy_type: string;
  title: string | null; headline: string | null; subheadline: string | null; body: string | null; cta: string | null; platform: string | null; language: string; tone: string | null; audience: string | null; reasoning: string | null;
  status: string; confidence_score: number; metadata: Json; is_approved: boolean; is_favorite: boolean; created_at: string; updated_at: string;
};
type ZonoCreativeOutputsRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; campaign_id: string | null; creative_asset_id: string | null; copy_asset_id: string | null;
  output_type: string; title: string | null; status: string; preview_url: string | null; thumbnail_url: string | null; render_data: Json; generation_metadata: Json;
  brand_match_score: number; marketing_match_score: number; readability_score: number; hierarchy_score: number; conversion_score: number; overall_score: number;
  is_approved: boolean; is_favorite: boolean; created_at: string; updated_at: string;
  internal_prompt: string | null; creative_strategy: string | null; visual_hook: string | null; scroll_stop_reason: string | null; creative_director_metadata: Json;
  scroll_stop_score: number; creative_director_score: number; anti_ai_score: number; rtl_readability_score: number;
  quality_status: string | null; overall_quality_score: number; wow_score: number; critic_summary: string | null;
  quality_review_id: string | null; generation_round: number; is_hidden_due_to_quality: boolean;
  used_inspiration_assets: Json; property_primary_angle: string | null; creative_selection_metadata: Json;
};
type ZonoCreativeCandidatesRow = {
  id: string; org_id: string; request_id: string; entity_type: string | null; entity_id: string | null;
  candidate_family: string | null; generation_round: number; generated_image_url: string | null; final_composited_image_url: string | null;
  render_data: Json; internal_prompt: string | null; creative_strategy: string | null; visual_hook: string | null; property_primary_angle: string | null;
  quality_score: number; wow_score: number; status: string; is_selected: boolean; is_rejected: boolean;
  rejection_reason: string | null; quality_review_id: string | null; metadata: Json; created_at: string;
};
type ZonoCreativeQualityReviewsRow = {
  id: string; org_id: string; request_id: string | null; output_id: string | null; candidate_id: string | null;
  entity_type: string | null; entity_id: string | null; review_round: number;
  premium_score: number; modern_score: number; clean_score: number; scroll_stop_score: number; brand_match_score: number;
  real_estate_relevance_score: number; hebrew_readability_score: number; rtl_score: number; composition_score: number;
  trust_score: number; conversion_score: number; wow_score: number; property_truth_score: number;
  agent_authenticity_score: number; logo_authenticity_score: number; overall_quality_score: number;
  is_approved_for_display: boolean; is_rejected: boolean; critic_summary: string | null; critic_problems: Json;
  improvement_instructions: Json; reject_reason: string | null; approval_reason: string | null; created_at: string;
};
type ZonoVisualAssetsRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; campaign_id: string | null; creative_output_id: string | null;
  visual_type: string; provider: string; image_url: string | null; thumbnail_url: string | null; storage_path: string | null; generation_reason: string | null;
  visual_dna_snapshot: Json; metadata: Json; brand_match_score: number; realism_score: number; property_relevance_score: number; marketing_relevance_score: number; conversion_score: number; overall_score: number;
  status: string; is_approved: boolean; is_rejected: boolean; is_favorite: boolean; created_at: string; updated_at: string;
};
type ZonoQuickCreativeRequestsRow = {
  id: string; org_id: string; agent_id: string | null; office_id: string | null; property_id: string | null; deal_id: string | null;
  request_type: string; status: string; input_data: Json; brand_snapshot: Json; marketing_dna_snapshot: Json; created_by: string | null; created_at: string; updated_at: string;
};
type CreativeGenerationsRow = {
  id: string; org_id: string; property_id: string | null; campaign_id: string | null; request_id: string | null; output_id: string | null;
  kind: string; status: string; selected_template: string | null; brand_profile_id: string | null; source_manifest_json: Json;
  final_image_url: string | null; approved_attempt_id: string | null; attempts_count: number; overall_score: number;
  created_by: string | null; created_at: string; updated_at: string;
};
type CreativeGenerationAttemptsRow = {
  id: string; generation_id: string; org_id: string; attempt_number: number; prompt: string | null; correction_prompt: string | null;
  image_url: string | null; qa_status: string | null; qa_report_json: Json;
  text_accuracy_score: number; numeric_accuracy_score: number; brand_score: number; layout_score: number; readability_score: number;
  asset_integrity_score: number; real_estate_relevance_score: number; overall_score: number; fail_reasons: Json; created_at: string;
};
type CreativeQaReportsRow = {
  id: string; generation_id: string; attempt_id: string; org_id: string; ocr_text: string | null; expected_text_manifest: Json;
  mismatches_json: Json; critical_failures_json: Json; visual_findings_json: Json; score_json: Json; passed: boolean; created_at: string;
};
type ZonoQuickCreativeOutputsRow = {
  id: string; org_id: string; request_id: string; agent_id: string | null; office_id: string | null; property_id: string | null; deal_id: string | null;
  output_type: string; variant_name: string; format: string; title: string | null; render_data: Json; preview_url: string | null; thumbnail_url: string | null;
  headline: string | null; subheadline: string | null; body_text: string | null; cta_text: string | null;
  brand_match_score: number; readability_score: number; conversion_score: number; seller_lead_score: number; buyer_lead_score: number; overall_score: number;
  is_favorite: boolean; is_approved: boolean; status: string; created_at: string; updated_at: string;
  internal_prompt: string | null; creative_strategy: string | null; visual_hook: string | null; scroll_stop_reason: string | null; creative_director_metadata: Json;
  scroll_stop_score: number; creative_director_score: number; anti_ai_score: number; rtl_readability_score: number;
  image_url: string | null; image_provider: string | null; image_status: string | null; image_error: string | null;
  quality_status: string | null; overall_quality_score: number; wow_score: number; critic_summary: string | null;
  quality_review_id: string | null; generation_round: number; is_hidden_due_to_quality: boolean;
  used_inspiration_assets: Json; property_primary_angle: string | null; creative_selection_metadata: Json;
};
type BrandIdentityProfilesRow = {
  id: string; org_id: string; entity_type: string; entity_id: string;
  full_name: string | null; display_name: string | null; title: string | null; short_bio: string | null; phone: string | null; whatsapp: string | null; email: string | null; office_name: string | null; years_experience: number | null;
  service_areas: Json; specialties: Json; languages: Json; profile_visibility: string;
  profile_image_url: string | null; profile_image_thumb: string | null; profile_image_status: string;
  logo_url: string | null; logo_dark_url: string | null; logo_light_url: string | null; logo_transparent_url: string | null; logo_type: string | null; logo_status: string;
  brand_primary: string | null; brand_secondary: string | null; brand_accent: string | null; brand_palette: Json; color_confidence_score: number; colors_source: string;
  brand_style: string | null; brand_tone: string | null;
  writing_style: string | null; communication_tone: string | null; brand_personality: string | null; target_audience: string | null; preferred_cta_style: string | null; preferred_design_language: string | null; preferred_post_style: string | null;
  ai_design_profile: Json; inherit_brand_settings: boolean; allow_agent_override: boolean; completion_score: number; created_at: string; updated_at: string;
};
type BrandAssetsRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; asset_kind: string; url: string; storage_path: string | null; status: string; created_at: string; updated_at: string;
};
type ZonoMarketingBriefsRow = {
  id: string; org_id: string; entity_type: string; entity_id: string; title: string; objective: string | null; platform: string | null; format: string | null; campaign_type: string | null; target_audience: string | null; main_message: string | null;
  property_id: string | null; project_id: string | null; agent_id: string | null; office_id: string | null; full_copy: Json; required_assets: Json; marketing_constraints: Json; status: string; created_by: string | null; created_at: string; updated_at: string;
};

/**
 * Insert/Update helpers: columns with database defaults (id, timestamps,
 * status/flag defaults) and nullable columns are optional on insert; every
 * column is optional on update.
 */
type OrgInvitationsRow = {
  id: string; org_id: string; email: string; full_name: string | null; role_key: string;
  token: string; status: string; invited_by: string | null; accepted_by: string | null;
  expires_at: string | null; accepted_at: string | null; created_at: string; updated_at: string;
};

// ── ZI Expert™ (Phase 22) — support conversation history ─────────────────────
type ZiConversationsRow = {
  id: string;
  organization_id: string;
  user_id: string;
  title: string;
  route: string | null;
  module_id: string | null;
  pinned: boolean;
  archived: boolean;
  message_count: number;
  last_message_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type ZiMessagesRow = {
  id: string;
  organization_id: string;
  conversation_id: string;
  user_id: string;
  role: "user" | "assistant";
  content: string;
  source: "ai" | "fallback" | "cache" | null;
  route: string | null;
  module_id: string | null;
  rating: "up" | "down" | null;
  deleted_at: string | null;
  created_at: string;
};

// ── ZI Expert™ Knowledge Engine (Phase 23) ───────────────────────────────────
type ZiKnowledgeArticlesRow = {
  id: string;
  organization_id: string | null;
  slug: string;
  title: string;
  category: string;
  module: string | null;
  summary: string;
  content: string;
  keywords: string[];
  role_visibility: string;
  permissions: Json;
  source_type: string;
  source_path: string | null;
  version: number;
  published: boolean;
  routes: string[];
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};
type ZiKnowledgeChunksRow = {
  id: string;
  organization_id: string | null;
  article_id: string;
  slug: string;
  ordinal: number;
  heading: string | null;
  content: string;
  keywords: string[];
  created_at: string;
};
type ZiKnowledgeSourcesRow = {
  id: string;
  organization_id: string | null;
  name: string;
  source_type: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};
type ZiKnowledgeFeedbackRow = {
  id: string;
  organization_id: string;
  user_id: string;
  question: string;
  answer: string;
  article_ids: string[];
  route: string | null;
  module_id: string | null;
  role: string | null;
  rating: "helpful" | "not_helpful" | "missing_info";
  comment: string | null;
  created_at: string;
};

type ZiDiagnosticRunsRow = {
  id: string;
  organization_id: string;
  user_id: string | null;
  correlation_id: string;
  issue_type: string;
  status: "healthy" | "warning" | "critical" | "unknown";
  current_route: string | null;
  module: string | null;
  summary: string;
  likely_cause: string | null;
  role: string | null;
  findings: unknown;
  support_payload: unknown;
  created_at: string;
};

// ── Phase 26.0 — Agency Foundation ───────────────────────────────────────────
type AgenciesRow = {
  id: string; organization_id: string; name: string; normalized_name: string;
  legal_name: string | null; slug: string; logo_url: string | null; website: string | null;
  description: string | null; founded_year: number | null; headquarters_city: string | null;
  headquarters_address: string | null; google_place_id: string | null; phone: string | null;
  email: string | null; facebook_url: string | null; instagram_url: string | null;
  linkedin_url: string | null; youtube_url: string | null; active: boolean;
  created_at: string; updated_at: string;
};
type AgencyBranchesRow = {
  id: string; organization_id: string; agency_id: string; city: string | null;
  neighborhood: string | null; address: string | null; phone: string | null; email: string | null;
  latitude: number | null; longitude: number | null; created_at: string;
};
type AgencyAgentsRow = {
  id: string; organization_id: string; agency_id: string; agent_id: string | null;
  role: string | null; confidence_score: number | null; detection_method: string | null;
  first_detected_at: string; last_verified_at: string | null;
};
type AgencyIdentityMatchesRow = {
  id: string; organization_id: string; agency_id: string; source: string; source_url: string | null;
  matched_name: string | null; confidence: number | null; evidence: unknown; created_at: string;
};
type AgencyProfilesRow = {
  id: string; organization_id: string; agency_id: string; specialties: string[]; service_areas: string[];
  languages: string[]; luxury: boolean; commercial: boolean; investments: boolean; rentals: boolean;
  projects: boolean; notes: string | null; created_at: string; updated_at: string;
};
type AgencyScoresRow = {
  id: string; organization_id: string; agency_id: string; market_strength: number | null;
  growth: number | null; digital: number | null; luxury: number | null; inventory: number | null;
  coverage: number | null; projects: number | null; reputation: number | null; momentum: number | null;
  overall: number | null; updated_at: string;
};
type AgencySignalsRow = {
  id: string; organization_id: string; agency_id: string; signal_type: string; severity: string | null;
  title: string; description: string | null; metadata: unknown; created_at: string;
};
type AgencyTimelineRow = {
  id: string; organization_id: string; agency_id: string; event_type: string; title: string;
  description: string | null; metadata: unknown; event_date: string; created_at: string;
};

// ── Phase 26.1 — Agency Identity Resolver ────────────────────────────────────
type AgencyAliasesRow = {
  id: string; organization_id: string; agency_id: string; alias: string;
  normalized_alias: string; source: string | null; created_at: string;
};
type AgencyResolutionCandidatesRow = {
  id: string; organization_id: string; raw_text: string; normalized_name: string;
  source: string | null; source_ref: string | null;
  status: "pending" | "accepted" | "rejected" | "auto_created" | "needs_review" | "enriched";
  confidence: number | null; matched_agency_id: string | null; evidence: unknown;
  // Phase 26.2 suggested_* columns (nullable, additive)
  suggested_name: string | null; suggested_display_name: string | null;
  suggested_brand_name: string | null; suggested_city: string | null;
  suggested_branch: string | null; suggested_aliases: unknown;
  resolved_at: string | null; created_at: string;
};

// ── Phase 25 — ZI Interactive Learning ───────────────────────────────────────
type ZiLearningProgressRow = {
  id: string; organization_id: string; user_id: string;
  kind: "tutorial" | "walkthrough" | "glossary" | "faq" | "path"; slug: string;
  status: "viewed" | "in_progress" | "completed"; favorite: boolean; last_step: number;
  created_at: string; updated_at: string;
};
type ZiTutorialsRow = {
  id: string; organization_id: string; slug: string; module: string | null; title: string;
  summary: string | null; steps: unknown; role_min: string; published: boolean; created_at: string; updated_at: string;
};
type ZiWalkthroughsRow = {
  id: string; organization_id: string; slug: string; module: string | null; title: string; goal: string | null;
  estimated_minutes: number; prerequisites: unknown; steps: unknown; common_mistakes: unknown; pro_tips: unknown;
  role_min: string; published: boolean; created_at: string; updated_at: string;
};
type ZiGlossaryRow = {
  id: string; organization_id: string; slug: string; term: string; definition: string;
  where_used: string | null; related: unknown; created_at: string; updated_at: string;
};
type ZiFaqRow = {
  id: string; organization_id: string; slug: string; module: string | null; question: string; answer: string;
  role_min: string; published: boolean; created_at: string; updated_at: string;
};

type Insertable<Row, Required extends keyof Row> = Pick<Row, Required> &
  Partial<Omit<Row, Required>>;

type TableShape<Row, Required extends keyof Row> = {
  Row: Row;
  Insert: Insertable<Row, Required>;
  Update: Partial<Row>;
  Relationships: [];
};

export interface Database {
  public: {
    Tables: {
      organizations: TableShape<OrganizationsRow, "name">;
      roles: TableShape<RolesRow, "org_id" | "key" | "name">;
      users: TableShape<UsersRow, "id" | "org_id" | "full_name" | "email">;
      buyers: TableShape<BuyersRow, "org_id" | "full_name">;
      sellers: TableShape<SellersRow, "org_id" | "full_name">;
      leads: TableShape<LeadsRow, "org_id" | "full_name">;
      projects: TableShape<ProjectsRow, "org_id" | "name">;
      units: TableShape<UnitsRow, "org_id" | "project_id" | "unit_number">;
      properties: TableShape<PropertiesRow, "org_id" | "title" | "type" | "price">;
      org_invitations: TableShape<OrgInvitationsRow, "org_id" | "email" | "token">;
      zi_conversations: TableShape<ZiConversationsRow, "organization_id" | "user_id">;
      zi_messages: TableShape<ZiMessagesRow, "organization_id" | "conversation_id" | "user_id" | "role" | "content">;
      zi_knowledge_articles: TableShape<ZiKnowledgeArticlesRow, "slug" | "title">;
      zi_knowledge_chunks: TableShape<ZiKnowledgeChunksRow, "article_id" | "slug" | "content">;
      zi_knowledge_sources: TableShape<ZiKnowledgeSourcesRow, "name">;
      zi_knowledge_feedback: TableShape<ZiKnowledgeFeedbackRow, "organization_id" | "user_id" | "question" | "rating">;
      zi_diagnostic_runs: TableShape<ZiDiagnosticRunsRow, "organization_id" | "correlation_id" | "issue_type" | "status">;
      agencies: TableShape<AgenciesRow, "organization_id" | "name" | "normalized_name" | "slug">;
      agency_branches: TableShape<AgencyBranchesRow, "organization_id" | "agency_id">;
      agency_agents: TableShape<AgencyAgentsRow, "organization_id" | "agency_id">;
      agency_identity_matches: TableShape<AgencyIdentityMatchesRow, "organization_id" | "agency_id" | "source">;
      agency_profiles: TableShape<AgencyProfilesRow, "organization_id" | "agency_id">;
      agency_scores: TableShape<AgencyScoresRow, "organization_id" | "agency_id">;
      agency_signals: TableShape<AgencySignalsRow, "organization_id" | "agency_id" | "signal_type" | "title">;
      agency_timeline: TableShape<AgencyTimelineRow, "organization_id" | "agency_id" | "event_type" | "title">;
      agency_aliases: TableShape<AgencyAliasesRow, "organization_id" | "agency_id" | "alias" | "normalized_alias">;
      agency_resolution_candidates: TableShape<AgencyResolutionCandidatesRow, "organization_id" | "raw_text">;
      zi_learning_progress: TableShape<ZiLearningProgressRow, "organization_id" | "user_id" | "kind" | "slug">;
      zi_tutorials: TableShape<ZiTutorialsRow, "organization_id" | "slug" | "title">;
      zi_walkthroughs: TableShape<ZiWalkthroughsRow, "organization_id" | "slug" | "title">;
      zi_glossary: TableShape<ZiGlossaryRow, "organization_id" | "slug" | "term" | "definition">;
      zi_faq: TableShape<ZiFaqRow, "organization_id" | "slug" | "question" | "answer">;
      property_media: TableShape<PropertyMediaRow, "org_id" | "property_id" | "url">;
      property_journeys: TableShape<
        PropertyJourneysRow,
        "org_id" | "property_id"
      >;
      property_intelligence_profiles: TableShape<
        PropertyIntelligenceProfilesRow,
        "org_id" | "property_id"
      >;
      property_blueprints: TableShape<PropertyBlueprintsRow, "name">;
      property_missions: TableShape<
        PropertyMissionsRow,
        "org_id" | "property_id" | "title"
      >;
      property_levers: TableShape<
        PropertyLeversRow,
        "org_id" | "property_id" | "title"
      >;
      property_risks: TableShape<
        PropertyRisksRow,
        "org_id" | "property_id" | "title"
      >;
      property_exposure_channels: TableShape<
        PropertyExposureChannelsRow,
        "org_id" | "property_id" | "channel"
      >;
      property_seller_touchpoints: TableShape<
        PropertySellerTouchpointsRow,
        "org_id" | "property_id"
      >;
      property_calendar_plans: TableShape<
        PropertyCalendarPlansRow,
        "org_id" | "property_id" | "title"
      >;
      property_score_events: TableShape<
        PropertyScoreEventsRow,
        "org_id" | "property_id" | "score_type"
      >;
      activity_events: TableShape<
        ActivityEventsRow,
        "org_id" | "event_type" | "entity_type" | "entity_id" | "title"
      >;
      entity_relationships: TableShape<
        EntityRelationshipsRow,
        | "org_id"
        | "source_entity_type"
        | "source_entity_id"
        | "target_entity_type"
        | "target_entity_id"
        | "relationship_type"
      >;
      communication_threads: TableShape<
        CommunicationThreadsRow,
        "org_id" | "channel"
      >;
      communication_messages: TableShape<
        CommunicationMessagesRow,
        "org_id" | "thread_id" | "direction" | "channel"
      >;
      communication_intelligence_profiles: TableShape<
        CommunicationIntelligenceProfilesRow,
        "org_id" | "entity_type" | "entity_id"
      >;
      communication_commitments: TableShape<
        CommunicationCommitmentsRow,
        "org_id" | "entity_type" | "entity_id" | "commitment_text"
      >;
      communication_followups: TableShape<
        CommunicationFollowupsRow,
        "org_id" | "entity_type" | "entity_id" | "title"
      >;
      communication_insights: TableShape<
        CommunicationInsightsRow,
        "org_id" | "entity_type" | "entity_id" | "insight_type" | "title"
      >;
      market_area_snapshots: TableShape<
        MarketAreaSnapshotsRow,
        "organization_id" | "locality_name"
      >;
      broker_profiles: TableShape<
        BrokerProfilesRow,
        "org_id" | "display_name" | "normalized_name"
      >;
      broker_aliases: TableShape<
        BrokerAliasesRow,
        "org_id" | "broker_id" | "alias_type" | "value" | "normalized_value"
      >;
      broker_sources: TableShape<
        BrokerSourcesRow,
        "org_id" | "broker_id" | "source_type"
      >;
      broker_service_areas: TableShape<
        BrokerServiceAreasRow,
        "org_id" | "broker_id" | "city_name"
      >;
      broker_discovery_runs: TableShape<
        BrokerDiscoveryRunsRow,
        "org_id" | "provider"
      >;
      broker_match_reviews: TableShape<
        BrokerMatchReviewsRow,
        "org_id"
      >;
      property_broker_matches: TableShape<
        PropertyBrokerMatchesRow,
        "org_id" | "broker_id"
      >;
      broker_logo_assets: TableShape<
        BrokerLogoAssetsRow,
        "org_id" | "broker_id"
      >;
      inventory_acquisition_profiles: TableShape<
        InventoryAcquisitionProfilesRow,
        "organization_id" | "external_listing_id"
      >;
      inventory_acquisition_actions: TableShape<
        InventoryAcquisitionActionsRow,
        "organization_id" | "acquisition_profile_id" | "action_type" | "title"
      >;
      inventory_acquisition_reviews: TableShape<
        InventoryAcquisitionReviewsRow,
        "organization_id" | "review_type" | "title"
      >;
      competitor_profiles: TableShape<
        CompetitorProfilesRow,
        "organization_id" | "display_name"
      >;
      competitor_market_positions: TableShape<
        CompetitorMarketPositionsRow,
        "organization_id" | "competitor_profile_id" | "locality"
      >;
      competitor_signals: TableShape<
        CompetitorSignalsRow,
        "organization_id" | "signal_type" | "title"
      >;
      deal_forecasts: TableShape<
        DealForecastsRow,
        "organization_id"
      >;
      pipeline_snapshots: TableShape<
        PipelineSnapshotsRow,
        "organization_id"
      >;
      deal_forecast_signals: TableShape<
        DealForecastSignalsRow,
        "organization_id" | "signal_type" | "title"
      >;
      team_intelligence_profiles: TableShape<
        TeamIntelligenceProfilesRow,
        "organization_id" | "user_id"
      >;
      team_performance_snapshots: TableShape<
        TeamPerformanceSnapshotsRow,
        "organization_id"
      >;
      agent_coaching_signals: TableShape<
        AgentCoachingSignalsRow,
        "organization_id" | "user_id" | "signal_type" | "title"
      >;
      office_intelligence_profiles: TableShape<
        OfficeIntelligenceProfilesRow,
        "organization_id"
      >;
      team_opportunity_leaks: TableShape<
        TeamOpportunityLeaksRow,
        "organization_id" | "leak_type" | "title"
      >;
      management_actions: TableShape<
        ManagementActionsRow,
        "organization_id" | "action_type" | "title"
      >;
      organization_revenue_profiles: TableShape<
        OrganizationRevenueProfilesRow,
        "organization_id"
      >;
      revenue_targets: TableShape<
        RevenueTargetsRow,
        "organization_id" | "period_start"
      >;
      revenue_leakage_events: TableShape<
        RevenueLeakageEventsRow,
        "organization_id" | "source" | "title"
      >;
      community_profiles: TableShape<
        CommunityProfilesRow,
        "organization_id" | "name"
      >;
      community_intelligence_profiles: TableShape<
        CommunityIntelligenceProfilesRow,
        "organization_id" | "community_id"
      >;
      property_marketing_profiles: TableShape<
        PropertyMarketingProfilesRow,
        "organization_id" | "property_id"
      >;
      buyer_segments: TableShape<
        BuyerSegmentsRow,
        "organization_id" | "segment_key" | "label"
      >;
      marketing_opportunity_signals: TableShape<
        MarketingOpportunitySignalsRow,
        "organization_id" | "signal_type" | "title"
      >;
      community_dna_profiles: TableShape<
        CommunityDnaProfilesRow,
        "organization_id" | "community_id"
      >;
      property_community_matches: TableShape<
        PropertyCommunityMatchesRow,
        "organization_id" | "property_id" | "community_id"
      >;
      distribution_plans: TableShape<
        DistributionPlansRow,
        "organization_id" | "property_id"
      >;
      distribution_plan_items: TableShape<
        DistributionPlanItemsRow,
        "organization_id" | "distribution_plan_id" | "community_id"
      >;
      daily_distribution_batches: TableShape<
        DailyDistributionBatchesRow,
        "organization_id"
      >;
      daily_distribution_items: TableShape<
        DailyDistributionItemsRow,
        "organization_id" | "batch_id"
      >;
      distribution_opportunity_signals: TableShape<
        DistributionOpportunitySignalsRow,
        "organization_id" | "signal_type" | "title"
      >;
      community_activity_logs: TableShape<
        CommunityActivityLogsRow,
        "organization_id" | "activity_type"
      >;
      community_lead_attribution: TableShape<
        CommunityLeadAttributionRow,
        "organization_id"
      >;
      distribution_queue: TableShape<
        DistributionQueueRow,
        "organization_id"
      >;
      social_interactions: TableShape<
        SocialInteractionsRow,
        "organization_id"
      >;
      social_leads: TableShape<
        SocialLeadsRow,
        "organization_id" | "social_interaction_id"
      >;
      social_followups: TableShape<
        SocialFollowupsRow,
        "organization_id"
      >;
      deal_profiles: TableShape<
        DealProfilesRow,
        "organization_id"
      >;
      deal_journeys: TableShape<
        DealJourneysRow,
        "organization_id" | "deal_profile_id" | "stage"
      >;
      deal_negotiations: TableShape<
        DealNegotiationsRow,
        "organization_id" | "deal_profile_id"
      >;
      deal_objections: TableShape<
        DealObjectionsRow,
        "organization_id" | "deal_profile_id" | "objection_type"
      >;
      deal_tasks: TableShape<
        DealTasksRow,
        "organization_id" | "deal_profile_id" | "title"
      >;
      geo_coverage_targets: TableShape<
        GeoCoverageTargetsRow,
        "organization_id" | "city_name"
      >;
      property_transactions: TableShape<
        PropertyTransactionsRow,
        "organization_id"
      >;
      transaction_sync_logs: TableShape<
        TransactionSyncLogsRow,
        "organization_id"
      >;
      property_research_reports: TableShape<
        PropertyResearchReportsRow,
        "organization_id"
      >;
      building_intelligence: TableShape<
        BuildingIntelligenceRow,
        "organization_id"
      >;
      street_intelligence: TableShape<
        StreetIntelligenceRow,
        "organization_id"
      >;
      transaction_opportunity_radar_alerts: TableShape<
        TransactionOpportunityRadarAlertsRow,
        "organization_id"
      >;
      graph_entities: TableShape<
        GraphEntitiesRow,
        "organization_id" | "entity_type" | "entity_id" | "title"
      >;
      graph_relationships: TableShape<
        GraphRelationshipsRow,
        "organization_id" | "source_entity_type" | "source_entity_id" | "target_entity_type" | "target_entity_id" | "relationship_type"
      >;
      graph_signals: TableShape<
        GraphSignalsRow,
        "organization_id" | "signal_type" | "title"
      >;
      agent_intelligence_profiles: TableShape<
        AgentIntelligenceProfilesRow,
        "organization_id" | "user_id"
      >;
      agent_locality_performance: TableShape<
        AgentLocalityPerformanceRow,
        "organization_id" | "user_id" | "locality"
      >;
      agent_property_type_performance: TableShape<
        AgentPropertyTypePerformanceRow,
        "organization_id" | "user_id" | "property_type"
      >;
      lead_routing_profiles: TableShape<
        LeadRoutingProfilesRow,
        "organization_id" | "lead_id"
      >;
      lead_routing_candidates: TableShape<
        LeadRoutingCandidatesRow,
        "organization_id" | "routing_profile_id" | "user_id"
      >;
      seller_intelligence_profiles: TableShape<
        SellerIntelligenceProfilesRow,
        "org_id" | "seller_id"
      >;
      seller_missions: TableShape<
        SellerMissionsRow,
        "org_id" | "seller_id" | "title"
      >;
      seller_risks: TableShape<
        SellerRisksRow,
        "org_id" | "seller_id" | "title"
      >;
      seller_touchpoints: TableShape<
        SellerTouchpointsRow,
        "org_id" | "seller_id"
      >;
      seller_commitments: TableShape<
        SellerCommitmentsRow,
        "org_id" | "seller_id" | "title"
      >;
      decision_intelligence_profiles: TableShape<
        DecisionIntelligenceProfilesRow,
        "org_id"
      >;
      attention_items: TableShape<
        AttentionItemsRow,
        "org_id" | "entity_type" | "entity_id" | "title"
      >;
      opportunity_signals: TableShape<
        OpportunitySignalsRow,
        "org_id" | "entity_type" | "entity_id" | "title"
      >;
      decision_queue: TableShape<
        DecisionQueueRow,
        "org_id" | "entity_type" | "entity_id" | "title"
      >;
      decision_recommendations: TableShape<
        DecisionRecommendationsRow,
        "org_id" | "title"
      >;
      buyer_intelligence_profiles: TableShape<
        BuyerIntelligenceProfilesRow,
        "org_id" | "buyer_id"
      >;
      buyer_missions: TableShape<BuyerMissionsRow, "org_id" | "buyer_id" | "title">;
      buyer_risks: TableShape<BuyerRisksRow, "org_id" | "buyer_id" | "title">;
      buyer_touchpoints: TableShape<BuyerTouchpointsRow, "org_id" | "buyer_id">;
      buyer_objections: TableShape<BuyerObjectionsRow, "org_id" | "buyer_id">;
      buyer_commitments: TableShape<BuyerCommitmentsRow, "org_id" | "buyer_id" | "title">;
      match_intelligence_profiles: TableShape<
        MatchIntelligenceProfilesRow,
        "org_id" | "buyer_id" | "property_id"
      >;
      match_risks: TableShape<MatchRisksRow, "org_id" | "match_id" | "title">;
      match_objections: TableShape<MatchObjectionsRow, "org_id" | "match_id">;
      match_opportunities: TableShape<MatchOpportunitiesRow, "org_id" | "match_id">;
      revenue_signals: TableShape<RevenueSignalsRow, "org_id">;
      property_sellers: TableShape<
        PropertySellersRow,
        "org_id" | "property_id" | "seller_id"
      >;
      external_listing_sources: TableShape<ExternalListingSourcesRow, "provider" | "name">;
      external_listings: TableShape<ExternalListingsRow, "org_id" | "source" | "source_id">;
      external_listing_history: TableShape<ExternalListingHistoryRow, "org_id" | "listing_id" | "change_type">;
      external_listing_duplicates: TableShape<ExternalListingDuplicatesRow, "org_id" | "listing_id">;
      import_jobs: TableShape<ImportJobsRow, "org_id" | "provider">;
      import_job_logs: TableShape<ImportJobLogsRow, "org_id" | "job_id" | "message">;
      deals: TableShape<DealsRow, "org_id" | "title">;
      opportunities: TableShape<OpportunitiesRow, "org_id" | "type" | "title">;
      matching_results: TableShape<MatchingResultsRow, "org_id" | "buyer_id" | "score">;
      activities: TableShape<ActivitiesRow, "org_id" | "type">;
      tasks: TableShape<TasksRow, "org_id" | "title">;
      notes: TableShape<NotesRow, "org_id" | "body">;
      meetings: TableShape<MeetingsRow, "org_id" | "title" | "start_at">;
      automations: TableShape<AutomationsRow, "org_id" | "name" | "trigger">;
      documents: TableShape<DocumentsRow, "org_id" | "title">;
      document_templates: TableShape<DocumentTemplatesRow, "template_key" | "name_he" | "doc_category">;
      document_versions: TableShape<DocumentVersionsRow, "organization_id" | "document_id">;
      document_participants: TableShape<DocumentParticipantsRow, "organization_id" | "document_id">;
      document_requests: TableShape<DocumentRequestsRow, "organization_id" | "document_id">;
      document_signatures: TableShape<DocumentSignaturesRow, "organization_id" | "document_id" | "signer_name">;
      document_audit_logs: TableShape<DocumentAuditLogsRow, "organization_id" | "event">;
      document_requirements: TableShape<DocumentRequirementsRow, "context" | "doc_category">;
      document_checklists: TableShape<DocumentChecklistsRow, "organization_id">;
      document_folders: TableShape<DocumentFoldersRow, "organization_id" | "name">;
      buyer_financial_profiles: TableShape<BuyerFinancialProfilesRow, "organization_id" | "buyer_id">;
      financing_signals: TableShape<FinancingSignalsRow, "organization_id" | "signal_type" | "title">;
      client_reviews: TableShape<ClientReviewsRow, "organization_id">;
      review_requests: TableShape<ReviewRequestsRow, "organization_id">;
      referrals: TableShape<ReferralsRow, "organization_id">;
      client_advocates: TableShape<ClientAdvocatesRow, "organization_id" | "client_type" | "client_id">;
      reputation_scores: TableShape<ReputationScoresRow, "organization_id" | "scope" | "scope_key">;
      reputation_signals: TableShape<ReputationSignalsRow, "organization_id" | "signal_type" | "title">;
      review_campaigns: TableShape<ReviewCampaignsRow, "organization_id" | "name">;
      ai_briefs: TableShape<AiBriefsRow, "organization_id">;
      ai_opportunities: TableShape<AiOpportunitiesRow, "organization_id" | "title">;
      ai_risks: TableShape<AiRisksRow, "organization_id" | "title">;
      ai_focus_items: TableShape<AiFocusItemsRow, "organization_id" | "title">;
      ai_growth_plans: TableShape<AiGrowthPlansRow, "organization_id" | "plan_type" | "title">;
      ai_simulations: TableShape<AiSimulationsRow, "organization_id" | "scenario_key" | "title">;
      community_comments: TableShape<CommunityCommentsRow, "organization_id">;
      messenger_threads: TableShape<MessengerThreadsRow, "organization_id">;
      social_account_sync_logs: TableShape<SocialAccountSyncLogsRow, "organization_id" | "event">;
      whatsapp_accounts: TableShape<WhatsappAccountsRow, "organization_id">;
      whatsapp_conversations: TableShape<WhatsappConversationsRow, "organization_id">;
      whatsapp_messages: TableShape<WhatsappMessagesRow, "organization_id">;
      whatsapp_drafts: TableShape<WhatsappDraftsRow, "organization_id" | "body">;
      whatsapp_call_events: TableShape<WhatsappCallEventsRow, "organization_id">;
      whatsapp_followups: TableShape<WhatsappFollowupsRow, "organization_id">;
      whatsapp_campaigns: TableShape<WhatsappCampaignsRow, "organization_id" | "name">;
      whatsapp_segments: TableShape<WhatsappSegmentsRow, "organization_id" | "name" | "segment_key">;
      whatsapp_smart_links: TableShape<WhatsappSmartLinksRow, "organization_id" | "slug">;
      whatsapp_smart_link_events: TableShape<WhatsappSmartLinkEventsRow, "organization_id">;
      whatsapp_knowledge_base: TableShape<WhatsappKnowledgeBaseRow, "organization_id" | "answer">;
      whatsapp_ai_actions: TableShape<WhatsappAiActionsRow, "organization_id" | "action_type" | "title">;
      whatsapp_daily_missions: TableShape<WhatsappDailyMissionsRow, "organization_id" | "title">;
      whatsapp_audit_logs: TableShape<WhatsappAuditLogsRow, "organization_id" | "event">;
      communication_events: TableShape<CommunicationEventsRow, "org_id" | "entity_type" | "entity_id">;
      communication_summaries: TableShape<CommunicationSummariesRow, "org_id" | "entity_type" | "entity_id">;
      communication_entities: TableShape<CommunicationEntitiesRow, "org_id" | "entity_type" | "entity_id" | "extracted_kind">;
      communication_objections: TableShape<CommunicationObjectionsRow, "org_id" | "entity_type" | "entity_id" | "objection_type">;
      communication_sentiment: TableShape<CommunicationSentimentRow, "org_id" | "entity_type" | "entity_id" | "sentiment">;
      communication_intents: TableShape<CommunicationIntentsRow, "org_id" | "entity_type" | "entity_id" | "intent">;
      communication_risks: TableShape<CommunicationRisksRow, "org_id" | "entity_type" | "entity_id" | "risk_type">;
      communication_opportunities: TableShape<CommunicationOpportunitiesRow, "org_id" | "entity_type" | "entity_id" | "opportunity_type">;
      client_memory: TableShape<ClientMemoryRow, "org_id" | "entity_type" | "entity_id">;
      conversation_memory: TableShape<ConversationMemoryRow, "org_id" | "entity_type" | "entity_id">;
      journeys: TableShape<JourneysRow, "org_id" | "journey_type" | "entity_type" | "entity_id">;
      journey_stages: TableShape<JourneyStagesRow, "journey_type" | "stage_key" | "label">;
      journey_events: TableShape<JourneyEventsRow, "org_id" | "entity_type" | "entity_id" | "event_type">;
      journey_milestones: TableShape<JourneyMilestonesRow, "org_id" | "entity_type" | "entity_id" | "milestone_key" | "label">;
      journey_risks: TableShape<JourneyRisksRow, "org_id" | "entity_type" | "entity_id" | "risk_type">;
      journey_opportunities: TableShape<JourneyOpportunitiesRow, "org_id" | "entity_type" | "entity_id" | "opportunity_type">;
      journey_scores: TableShape<JourneyScoresRow, "org_id">;
      journey_predictions: TableShape<JourneyPredictionsRow, "org_id" | "entity_type" | "entity_id">;
      journey_blockers: TableShape<JourneyBlockersRow, "org_id" | "entity_type" | "entity_id" | "blocker_type">;
      journey_velocity: TableShape<JourneyVelocityRow, "org_id" | "entity_type" | "entity_id">;
      zono_marketing_assets: TableShape<ZonoMarketingAssetsRow, "org_id" | "entity_type" | "entity_id" | "asset_type" | "file_url">;
      zono_marketing_dna_profiles: TableShape<ZonoMarketingDnaProfilesRow, "org_id" | "entity_type" | "entity_id">;
      zono_marketing_feedback: TableShape<ZonoMarketingFeedbackRow, "org_id" | "entity_type" | "entity_id" | "feedback_type">;
      zono_marketing_analysis_jobs: TableShape<ZonoMarketingAnalysisJobsRow, "org_id" | "entity_type" | "entity_id">;
      zono_marketing_briefs: TableShape<ZonoMarketingBriefsRow, "org_id" | "entity_type" | "entity_id" | "title">;
      zono_creative_concepts: TableShape<ZonoCreativeConceptsRow, "org_id" | "entity_type" | "entity_id" | "title" | "concept_type">;
      zono_campaigns: TableShape<ZonoCampaignsRow, "org_id" | "entity_type" | "entity_id" | "title" | "campaign_type">;
      zono_campaign_assets: TableShape<ZonoCampaignAssetsRow, "org_id" | "campaign_id" | "asset_type">;
      zono_creative_assets: TableShape<ZonoCreativeAssetsRow, "org_id" | "campaign_id" | "asset_type" | "title">;
      zono_copy_assets: TableShape<ZonoCopyAssetsRow, "org_id" | "entity_type" | "entity_id" | "copy_type">;
      zono_creative_outputs: TableShape<ZonoCreativeOutputsRow, "org_id" | "entity_type" | "entity_id" | "output_type">;
      zono_visual_assets: TableShape<ZonoVisualAssetsRow, "org_id" | "entity_type" | "entity_id" | "visual_type">;
      zono_quick_creative_requests: TableShape<ZonoQuickCreativeRequestsRow, "org_id" | "request_type">;
      zono_quick_creative_outputs: TableShape<ZonoQuickCreativeOutputsRow, "org_id" | "request_id" | "output_type" | "variant_name" | "format">;
      creative_generations: TableShape<CreativeGenerationsRow, "org_id" | "kind" | "status">;
      creative_generation_attempts: TableShape<CreativeGenerationAttemptsRow, "generation_id" | "org_id" | "attempt_number">;
      creative_qa_reports: TableShape<CreativeQaReportsRow, "generation_id" | "attempt_id" | "org_id">;
      zono_creative_candidates: TableShape<ZonoCreativeCandidatesRow, "org_id" | "request_id">;
      zono_creative_quality_reviews: TableShape<ZonoCreativeQualityReviewsRow, "org_id">;
      brand_identity_profiles: TableShape<BrandIdentityProfilesRow, "org_id" | "entity_type" | "entity_id">;
      brand_assets: TableShape<BrandAssetsRow, "org_id" | "entity_type" | "entity_id" | "asset_kind" | "url">;
      social_accounts: TableShape<SocialAccountsRow, "organization_id" | "provider">;
      community_deal_attribution: TableShape<CommunityDealAttributionRow, "organization_id">;
      notifications: TableShape<NotificationsRow, "org_id" | "user_id" | "title">;
      israel_localities: TableShape<IsraelLocalitiesRow, "locality_code" | "name_he">;
      israel_neighborhoods: TableShape<IsraelNeighborhoodsRow, "city_name" | "name_he" | "normalized_name">;
      organization_operating_localities: TableShape<
        OrgOperatingLocalitiesRow,
        "organization_id" | "locality_id"
      >;
      user_operating_localities: TableShape<
        UserOperatingLocalitiesRow,
        "user_id" | "locality_id"
      >;
      engine_runs: TableShape<EngineRunsRow, "engine_key">;
      audit_log: TableShape<AuditLogRow, "action" | "category">;
      notification_state: TableShape<NotificationStateRow, "user_id" | "item_key">;
      neighborhoods: TableShape<NeighborhoodsRow, "city_code" | "city_name" | "neighborhood_name">;
      neighborhood_enrichment_cities: TableShape<NeighborhoodEnrichmentCitiesRow, "city_code" | "city_name">;
      recommendation_profiles: TableShape<
        RecommendationProfilesRow,
        "organization_id" | "entity_type" | "entity_id"
      >;
      recommendations: TableShape<
        RecommendationsRow,
        "organization_id" | "source_entity_type" | "source_entity_id" | "target_entity_type" | "recommendation_type" | "title_hebrew"
      >;
      recommendation_packages: TableShape<
        RecommendationPackagesRow,
        "organization_id" | "package_type" | "entity_type" | "entity_id"
      >;
      recommendation_events: TableShape<
        RecommendationEventsRow,
        "organization_id" | "event_type"
      >;
      recommendation_feedback: TableShape<
        RecommendationFeedbackRow,
        "organization_id"
      >;
      recommendation_map_points: TableShape<
        RecommendationMapPointsRow,
        "organization_id"
      >;
      territory_profiles: TableShape<
        TerritoryProfilesRow,
        "organization_id" | "territory_type" | "territory_key"
      >;
      territory_signals: TableShape<
        TerritorySignalsRow,
        "organization_id" | "signal_type" | "title"
      >;
      territory_assignments: TableShape<
        TerritoryAssignmentsRow,
        "organization_id" | "territory_profile_id"
      >;
      territory_snapshots: TableShape<
        TerritorySnapshotsRow,
        "organization_id"
      >;
      territory_dna_profiles: TableShape<
        TerritoryDnaProfilesRow,
        "organization_id" | "territory_profile_id"
      >;
      street_territory_profiles: TableShape<
        StreetTerritoryProfilesRow,
        "organization_id" | "street"
      >;
      building_cluster_profiles: TableShape<
        BuildingClusterProfilesRow,
        "organization_id" | "cluster_key"
      >;
      client_portals: TableShape<
        ClientPortalsRow,
        "organization_id" | "portal_type" | "entity_type" | "entity_id" | "access_token_hash"
      >;
      client_portal_views: TableShape<
        ClientPortalViewsRow,
        "organization_id"
      >;
      client_portal_sections: TableShape<
        ClientPortalSectionsRow,
        "organization_id" | "section_type"
      >;
      client_portal_items: TableShape<
        ClientPortalItemsRow,
        "organization_id" | "item_type"
      >;
      office_websites: TableShape<
        OfficeWebsitesRow,
        "organization_id"
      >;
      office_website_leads: TableShape<
        OfficeWebsiteLeadsRow,
        "organization_id"
      >;
      office_website_events: TableShape<
        OfficeWebsiteEventsRow,
        "organization_id" | "event_type"
      >;
      agent_websites: TableShape<
        AgentWebsitesRow,
        "organization_id" | "user_id"
      >;
      agent_website_leads: TableShape<
        AgentWebsiteLeadsRow,
        "organization_id"
      >;
      agent_website_events: TableShape<
        AgentWebsiteEventsRow,
        "organization_id" | "event_type"
      >;
      automation_workflows: TableShape<AutomationWorkflowsRow, "organization_id" | "name">;
      automation_triggers: TableShape<AutomationTriggersRow, "organization_id" | "workflow_id" | "trigger_type">;
      automation_conditions: TableShape<AutomationConditionsRow, "organization_id" | "workflow_id" | "condition_type">;
      automation_steps: TableShape<AutomationStepsRow, "organization_id" | "workflow_id" | "action_type">;
      automation_runs: TableShape<AutomationRunsRow, "organization_id" | "workflow_id">;
      automation_run_logs: TableShape<AutomationRunLogsRow, "organization_id" | "run_id" | "message">;
      automation_actions: TableShape<AutomationActionsRow, "organization_id" | "run_id" | "action_type" | "title">;
      automation_templates: TableShape<AutomationTemplatesRow, "template_key" | "name" | "trigger_type">;
      automation_recommendations: TableShape<AutomationRecommendationsRow, "organization_id" | "title">;
      automation_copy_templates: TableShape<AutomationCopyTemplatesRow, "template_key" | "category" | "title_he" | "full_description_he" | "agent_guidance_he" | "manager_guidance_he" | "revenue_impact_he" | "decision_brain_summary_he">;
      automation_message_variants: TableShape<AutomationMessageVariantsRow, "template_key" | "channel" | "message_he">;
      automation_voices: TableShape<AutomationVoicesRow, "voice_key" | "name_he" | "description_he" | "tone_he">;
      automation_priority_labels: TableShape<AutomationPriorityLabelsRow, "label_key" | "label_he" | "description_he">;
      automation_microcopy: TableShape<AutomationMicrocopyRow, "scope" | "copy_key" | "text_he">;
    };
    Views: { [_ in never]: never };
    Functions: {
      current_org_id: { Args: Record<string, never>; Returns: string };
      current_role_key: { Args: Record<string, never>; Returns: string };
      has_min_role: { Args: { p_min: string }; Returns: boolean };
      journey_stage_for_status: { Args: { p_status: string }; Returns: JourneyStage };
      journey_progress_for_stage: { Args: { p_stage: JourneyStage }; Returns: number };
      is_org_member: { Args: { p_org: string }; Returns: boolean };
      role_rank: { Args: { p_key: string }; Returns: number };
      seed_org_default_roles: { Args: { p_org: string }; Returns: undefined };
    };
    Enums: {
      org_plan: OrgPlan;
      user_status: UserStatus;
      region: Region;
      preferred_channel: PreferredChannel;
      buyer_temperature: BuyerTemperature;
      seller_motivation: SellerMotivation;
      lead_source: LeadSource;
      lead_intent: LeadIntent;
      lead_stage: LeadStage;
      property_type: PropertyType;
      listing_kind: ListingKind;
      property_status: PropertyStatus;
      listing_tag: ListingTag;
      media_type: MediaType;
      project_type: ProjectType;
      project_status: ProjectStatus;
      unit_status: UnitStatus;
      opportunity_type: OpportunityType;
      opportunity_priority: OpportunityPriority;
      opportunity_status: OpportunityStatus;
      deal_type: DealType;
      deal_stage: DealStage;
      deal_status: DealStatus;
      matching_status: MatchingStatus;
      matching_source: MatchingSource;
      activity_type: ActivityType;
      activity_direction: ActivityDirection;
      journey_stage: JourneyStage;
      task_status: TaskStatus;
      task_priority: TaskPriority;
      meeting_type: MeetingType;
      meeting_status: MeetingStatus;
      document_type: DocumentType;
      document_status: DocumentStatus;
      automation_trigger: AutomationTrigger;
      automation_status: AutomationStatus;
      notification_level: NotificationLevel;
      notification_category: NotificationCategory;
    };
    CompositeTypes: { [_ in never]: never };
  };
}
