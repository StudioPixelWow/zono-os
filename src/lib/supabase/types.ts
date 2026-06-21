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
  created_at: string;
  updated_at: string;
}

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

/**
 * Insert/Update helpers: columns with database defaults (id, timestamps,
 * status/flag defaults) and nullable columns are optional on insert; every
 * column is optional on update.
 */
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
