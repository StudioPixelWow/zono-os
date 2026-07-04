-- ============================================================================
-- ZONO — PHASE 41.9 Release Candidate · Supabase LIVE-DB Verification Harness
-- ----------------------------------------------------------------------------
-- FINDING: the migration set under supabase/migrations/ is CODE-COMPLETE.
--   • 0 tables referenced by code (.from) are missing from migrations
--     (470 tables defined, 363 referenced by code — all present).
--   • 0 RPC functions called by code are missing (has_min_role,
--     seed_org_default_roles both defined).
--   • distribution_comments has every column the code uses (base engine +
--     phase3 + phase7 migrations); distribution_leads.source is plain TEXT
--     (no CHECK) so "facebook_group_comment" is valid; lead_source enum
--     already includes 'facebook'.
--   • zono_compute_cache, notifications, notification_state, storage buckets
--     all exist in migrations.
--
-- Therefore NO corrective CREATE/ALTER is strictly required IF the live DB has
-- every migration applied. The risk the phase calls out ("schema work
-- minimized since ~phase 34") is that the LIVE project may be BEHIND the
-- migration history. This script does NOT mutate anything — run it against the
-- live Supabase (SQL editor) to get the exact list of objects that are missing
-- on live, then apply the corresponding migration files.
--
-- Grouped as requested: Tables · Columns · Indexes · Policies · Functions ·
-- Storage · Views · Enums · Helpers. Every check is READ-ONLY.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0) SUMMARY COUNTS (quick "is my live DB behind?" signal)
-- Expected (from migrations): tables≈470, enums≈, functions≈15, buckets=7.
-- ─────────────────────────────────────────────────────────────────────────────
select 'tables'    as object_class, count(*)::text as live_count from pg_tables where schemaname='public'
union all select 'views',     count(*)::text from pg_views where schemaname='public'
union all select 'mat_views', count(*)::text from pg_matviews where schemaname='public'
union all select 'enums',     count(*)::text from pg_type t join pg_namespace n on n.oid=t.typnamespace where t.typtype='e' and n.nspname='public'
union all select 'functions', count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
union all select 'policies',  count(*)::text from pg_policies where schemaname='public'
union all select 'buckets',   count(*)::text from storage.buckets;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) TABLES — every table the CODE queries must exist on live.
-- Returns any that are MISSING. Empty result = all present.
-- ─────────────────────────────────────────────────────────────────────────────
with expected(tbl) as (values
  ('organizations'),('users'),('roles'),('org_invitations'),('org_plans'),
  ('leads'),('deals'),('buyers'),('sellers'),('properties'),('projects'),
  ('tasks'),('meetings'),('notes'),('activities'),('activity_events'),
  ('notifications'),('notification_state'),('opportunity_signals'),('attention_items'),
  ('deal_forecast_signals'),('revenue_leakage_events'),('transaction_opportunity_radar_alerts'),
  ('competitor_signals'),('marketing_opportunity_signals'),
  ('buyer_property_matches'),('property_broker_matches'),
  ('distribution_comments'),('distribution_leads'),('distribution_posts'),
  ('distribution_groups'),('distribution_campaigns'),('distribution_group_posts'),
  ('distribution_group_leads'),
  ('external_listings'),('external_listing_history'),('external_listing_duplicates'),
  ('inventory_acquisition_profiles'),('inventory_acquisition_actions'),('inventory_acquisition_reviews'),
  ('whatsapp_conversations'),('whatsapp_messages'),('whatsapp_drafts'),('whatsapp_call_events'),
  ('whatsapp_daily_missions'),('whatsapp_followups'),
  ('agent_websites'),('office_websites'),('agent_website_leads'),('office_website_leads'),
  ('property_valuations'),('valuation_reports'),('valuation_comparables'),
  ('zono_compute_cache'),('ai_copilot_cache'),('market_area_cache_state'),
  ('automation_workflows'),('automation_runs'),('automation_steps'),('automation_actions'),
  ('brokerage_offices'),('brokerage_agents'),('brokerage_external_listing_links'),
  ('territory_profiles'),('territory_snapshots'),
  ('documents'),('document_requests'),('document_signatures')
  -- NOTE: this is a high-signal subset of the ~363 code-referenced tables.
  -- If ANY row returns here, the live DB is behind the migration history —
  -- apply all pending files in supabase/migrations/ (they are idempotent).
)
select e.tbl as missing_table
from expected e
left join pg_tables t on t.schemaname='public' and t.tablename=e.tbl
where t.tablename is null
order by 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) COLUMNS — spot-check the columns the code writes that were added by LATER
-- migrations (most likely to be missing if live is behind). Empty = all present.
-- ─────────────────────────────────────────────────────────────────────────────
with expected(tbl, col) as (values
  ('distribution_comments','external_comment_id'),   -- phase3
  ('distribution_comments','author_profile_url'),    -- phase3
  ('distribution_comments','lead_intent_score'),     -- phase3
  ('distribution_comments','category'),              -- phase7
  ('distribution_comments','suggested_reply'),       -- phase7
  ('distribution_comments','should_create_lead'),    -- phase7
  ('distribution_comments','analysis_reason'),       -- phase7
  ('distribution_comments','lead_id'),               -- phase7
  ('distribution_comments','metadata'),              -- base (used by 41.1.1)
  ('distribution_leads','metadata'),                 -- base (used by 41.1.1 journey/crm link)
  ('distribution_leads','phone'),
  ('distribution_leads','comment_id'),('distribution_leads','campaign_id'),
  ('distribution_leads','post_id'),('distribution_leads','group_id'),('distribution_leads','property_id'),
  ('leads','property_id'),('leads','score'),('leads','message'),
  ('notifications','lead_id'),('notifications','href'),('notifications','category')
)
select e.tbl, e.col as missing_column
from expected e
left join information_schema.columns c
  on c.table_schema='public' and c.table_name=e.tbl and c.column_name=e.col
where c.column_name is null
order by 1,2;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) INDEXES — hot query patterns used by 41.1.1 / distribution / journeys.
-- Report presence; add any that read FALSE (idempotent CREATE INDEX given).
-- ─────────────────────────────────────────────────────────────────────────────
select 'distribution_leads(metadata->>crm_lead_id)  [journey CRM-link lookup]' as index_purpose,
       exists(select 1 from pg_indexes where schemaname='public' and tablename='distribution_leads'
              and indexdef ilike '%crm_lead_id%') as present
union all
select 'distribution_leads(org_id,status)',
       exists(select 1 from pg_indexes where schemaname='public' and tablename='distribution_leads'
              and indexdef ilike '%org_id%' and indexdef ilike '%status%')
union all
select 'distribution_comments(org_id,external_comment_id)',
       exists(select 1 from pg_indexes where schemaname='public' and tablename='distribution_comments'
              and indexdef ilike '%external_comment_id%');

-- Recommended (only if the corresponding row above is FALSE) — safe & idempotent:
-- CREATE INDEX IF NOT EXISTS distribution_leads_crm_lead_idx
--   ON public.distribution_leads ((metadata->>'crm_lead_id')) WHERE metadata ? 'crm_lead_id';
-- CREATE INDEX IF NOT EXISTS distribution_leads_org_status_idx
--   ON public.distribution_leads (org_id, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) POLICIES / RLS — every public table should have RLS enabled (org isolation).
-- Returns tables WITHOUT RLS. Expected: empty (RLS coverage packs applied).
-- ─────────────────────────────────────────────────────────────────────────────
select c.relname as table_without_rls
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relrowsecurity=false
order by 1;

-- Tables with RLS ENABLED but ZERO policies (locked out — also a problem):
select c.relname as rls_enabled_but_no_policy
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relrowsecurity=true
  and not exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname)
order by 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) FUNCTIONS / HELPERS — RPCs called by code + governance helpers must exist.
-- Empty = all present.
-- ─────────────────────────────────────────────────────────────────────────────
with expected(fn) as (values
  ('has_min_role'),('seed_org_default_roles'),('current_org_id'),('current_role_key'),
  ('is_org_member'),('is_zono_owner'),('role_rank'),('set_updated_at'),
  ('brokerage_allowed_cities'),('brokerage_city_visible'),
  ('create_property_journey'),('journey_progress_for_stage'),('journey_stage_for_status'),
  ('legal_documents_lock_signed')
)
select e.fn as missing_function
from expected e
left join (select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') f
  on f.proname=e.fn
where f.proname is null
order by 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) STORAGE — buckets the app writes to. Empty = all present.
-- ─────────────────────────────────────────────────────────────────────────────
with expected(bucket) as (values
  ('documents'),('property-media'),('logos'),('agent-photos'),
  ('office-assets'),('creative-references'),('public-site-media')
)
select e.bucket as missing_bucket
from expected e
left join storage.buckets b on b.id=e.bucket
where b.id is null
order by 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) ENUMS — enum values the code inserts must be present. Empty = all present.
-- ─────────────────────────────────────────────────────────────────────────────
with expected(enum_name, val) as (values
  ('lead_source','facebook'),('lead_source','yad2'),('lead_source','madlan'),
  ('lead_source','website'),('lead_source','referral'),
  ('lead_stage','new'),('lead_intent','buyer'),
  ('notification_category','new_lead'),('notification_category','system'),
  ('notification_level','info')
)
select e.enum_name, e.val as missing_enum_value
from expected e
left join (
  select t.typname as enum_name, en.enumlabel as val
  from pg_type t join pg_enum en on en.enumtypid=t.oid
  join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'
) live on live.enum_name=e.enum_name and live.val=e.val
where live.val is null
order by 1,2;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) VIEWS / MATERIALIZED VIEWS — code references none by name; nothing expected.
-- (Listed for completeness; empty result set is correct.)
-- ─────────────────────────────────────────────────────────────────────────────
select 'no code-referenced views/materialized views expected' as note;

-- ============================================================================
-- HOW TO REMEDIATE IF ANY SECTION RETURNS ROWS:
--   The migration files ARE the corrective SQL and are idempotent
--   (create table if not exists / add column if not exists / create policy
--   guarded by drop). Apply the un-applied files in supabase/migrations/ in
--   filename order. Do NOT hand-write new CREATE statements — that would drift
--   the migration history from the live DB.
-- ============================================================================
