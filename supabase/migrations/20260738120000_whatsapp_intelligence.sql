-- ============================================================================
-- ZONO — WhatsApp Intelligence Platform (Phase 27, additive + idempotent).
-- ----------------------------------------------------------------------------
-- Turns each WhatsApp conversation into structured business intelligence on top
-- of the existing whatsapp_* tables: role/intent detection, AI summary, CRM links
-- (buyer/seller), missed-response tracking, and a generated personal portal.
--
-- HARD RULES: Meta-compliant only. No fake messages. No unofficial providers.
-- These columns store DERIVED intelligence over REAL ingested messages; the
-- ingestion path stays the official WhatsApp Cloud API webhook.
-- ============================================================================

alter table public.whatsapp_conversations
  add column if not exists detected_role    text,        -- buyer | seller | investor | unknown
  add column if not exists intent_score      numeric,    -- 0..100 confidence of detected intent
  add column if not exists needs_response    boolean not null default false,
  add column if not exists last_inbound_at   timestamptz,
  add column if not exists analyzed_at        timestamptz,
  add column if not exists property_intent    jsonb not null default '{}'::jsonb,  -- {rooms,budget,area,...} real-extracted
  add column if not exists crm_synced_at      timestamptz,
  add column if not exists portal_token       text;

create index if not exists wa_conv_needs_response_idx
  on public.whatsapp_conversations(organization_id) where needs_response = true;
create index if not exists wa_conv_role_idx
  on public.whatsapp_conversations(organization_id, detected_role);
