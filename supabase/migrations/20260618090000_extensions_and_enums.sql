-- ============================================================================
-- ZONO — 0001 · Extensions & Enum types
-- ----------------------------------------------------------------------------
-- Foundational types for the whole schema. Enums mirror the TypeScript unions
-- in src/types and are referenced by every table migration that follows.
-- Money is stored as integer whole shekels (₪) throughout — never floats.
-- ============================================================================

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists citext;      -- case-insensitive email columns

-- ── Tenancy & access ────────────────────────────────────────────────────────
create type org_plan        as enum ('starter', 'pro', 'team', 'enterprise');
create type user_status      as enum ('active', 'invited', 'suspended', 'disabled');

-- ── Geography ────────────────────────────────────────────────────────────────
create type region as enum (
  'north', 'haifa', 'sharon', 'center', 'tel_aviv',
  'jerusalem', 'shfela', 'south', 'west_bank', 'eilat'
);

-- ── Contacts ─────────────────────────────────────────────────────────────────
create type preferred_channel as enum ('phone', 'whatsapp', 'email', 'sms');
create type buyer_temperature  as enum ('hot', 'warm', 'cold');
create type seller_motivation  as enum ('urgent', 'motivated', 'exploring');

create type lead_source as enum (
  'yad2', 'madlan', 'facebook', 'instagram', 'website', 'referral',
  'sign_call', 'open_house', 'cold_outreach', 'portal', 'partner', 'other'
);
create type lead_intent as enum ('buyer', 'seller', 'both', 'investor', 'renter', 'unknown');
create type lead_stage  as enum (
  'new', 'contacted', 'qualified', 'nurturing', 'converted', 'lost', 'disqualified'
);

-- ── Inventory: properties / projects / units ─────────────────────────────────
create type property_type as enum (
  'apartment', 'garden_apartment', 'penthouse', 'duplex', 'private_house',
  'cottage', 'studio', 'commercial', 'office', 'land', 'other'
);
create type listing_kind   as enum ('sale', 'rent');
create type property_status as enum (
  'draft', 'active', 'under_offer', 'in_contract', 'sold', 'rented', 'withdrawn', 'archived'
);

create type project_type as enum (
  'residential', 'mixed_use', 'commercial', 'urban_renewal', 'luxury', 'other'
);
create type project_status as enum (
  'planning', 'pre_sale', 'selling', 'sold_out', 'on_hold', 'completed', 'cancelled'
);
create type unit_status as enum ('available', 'reserved', 'on_hold', 'sold', 'unavailable');

-- ── Pipeline ─────────────────────────────────────────────────────────────────
create type opportunity_type as enum (
  'new_match', 'price_drop', 'expiring_exclusivity', 'buyer_reengage',
  'market_shift', 'new_lead', 'stale_deal', 'document_pending', 'follow_up', 'other'
);
create type opportunity_priority as enum ('high', 'medium', 'low');
create type opportunity_status   as enum ('open', 'snoozed', 'acted', 'dismissed', 'expired');

create type deal_type   as enum ('sale', 'rent', 'project_sale');
create type deal_stage   as enum (
  'new', 'qualified', 'negotiation', 'agreement', 'contract', 'closing', 'won', 'lost'
);
create type deal_status  as enum ('open', 'won', 'lost', 'on_hold');

create type matching_status as enum (
  'new', 'presented', 'viewing_scheduled', 'viewed', 'rejected', 'offer_made', 'accepted', 'expired'
);
create type matching_source as enum ('engine', 'manual');

-- ── Engagement ───────────────────────────────────────────────────────────────
create type activity_type as enum (
  'call', 'whatsapp', 'email', 'sms', 'note', 'meeting', 'viewing',
  'system', 'status_change', 'document', 'task'
);
create type activity_direction as enum ('inbound', 'outbound', 'internal');

create type task_status   as enum ('todo', 'in_progress', 'blocked', 'done', 'cancelled');
create type task_priority as enum ('low', 'medium', 'high', 'urgent');

create type meeting_type as enum (
  'viewing', 'open_house', 'meeting', 'call', 'signing', 'valuation', 'inspection', 'other'
);
create type meeting_status as enum (
  'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'rescheduled'
);

-- ── Documents & automation ───────────────────────────────────────────────────
create type document_type as enum (
  'exclusivity_agreement', 'listing_agreement', 'sale_contract', 'rental_contract',
  'offer', 'disclosure', 'id_document', 'mortgage', 'invoice', 'brochure', 'other'
);
create type document_status as enum (
  'draft', 'pending_signature', 'partially_signed', 'signed', 'expired', 'archived', 'cancelled'
);

create type automation_trigger as enum (
  'lead_created', 'lead_stage_changed', 'property_listed', 'price_changed',
  'match_created', 'deal_stage_changed', 'document_signed', 'meeting_scheduled',
  'task_overdue', 'exclusivity_expiring', 'schedule', 'manual'
);
create type automation_status as enum ('active', 'paused', 'draft', 'archived');

-- ── Notifications ────────────────────────────────────────────────────────────
create type notification_level as enum ('info', 'success', 'warning', 'critical');
create type notification_category as enum (
  'task_due', 'followup_due', 'price_change', 'new_lead', 'new_match',
  'document_pending', 'exclusivity_expiring', 'deal_update', 'meeting_reminder',
  'mention', 'market_event', 'system'
);
