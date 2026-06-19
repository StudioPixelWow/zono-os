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
  created_at: string;
  updated_at: string;
}

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
      organization_operating_localities: TableShape<
        OrgOperatingLocalitiesRow,
        "organization_id" | "locality_id"
      >;
      user_operating_localities: TableShape<
        UserOperatingLocalitiesRow,
        "user_id" | "locality_id"
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
