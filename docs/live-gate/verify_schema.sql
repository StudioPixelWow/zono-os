-- ============================================================================
-- ZONO LIVE ACTIVATION GATE · A3 — post-migration schema verification.
-- Run in the Supabase SQL editor (or psql) AFTER `supabase db push`.
-- Every row returned should show ok = true. Any ok = false = GATE FAILURE.
-- Read-only; makes no changes.
-- ============================================================================
with checks as (
  -- Kernel outbox + ledger
  select 'domain_events table' k, to_regclass('public.domain_events') is not null v
  union all select 'domain_event_deliveries table', to_regclass('public.domain_event_deliveries') is not null
  union all select 'domain_events idempotency uniq', exists(select 1 from pg_indexes where indexname='domain_events_idem_uniq')
  union all select 'domain_events drain index', exists(select 1 from pg_indexes where indexname='domain_events_pending_idx')
  union all select 'deliveries uniq (event,subscriber)', exists(select 1 from pg_constraint where conname='domain_event_deliveries_uniq')
  -- Timeline
  union all select 'activity_events.event_id', exists(select 1 from information_schema.columns where table_name='activity_events' and column_name='event_id')
  union all select 'activity_events.source', exists(select 1 from information_schema.columns where table_name='activity_events' and column_name='source')
  union all select 'activity_events.visibility', exists(select 1 from information_schema.columns where table_name='activity_events' and column_name='visibility')
  union all select 'activity_events projection uniq', exists(select 1 from pg_indexes where indexname='activity_events_event_projection_uniq')
  -- Search
  union all select 'search_documents table', to_regclass('public.search_documents') is not null
  union all select 'search_documents uniq', exists(select 1 from pg_constraint where conname='search_documents_uniq')
  union all select 'search_documents trgm gin', exists(select 1 from pg_indexes where indexname='search_documents_trgm_idx')
  -- Graph lifecycle
  union all select 'entity_relationships.last_seen_at', exists(select 1 from information_schema.columns where table_name='entity_relationships' and column_name='last_seen_at')
  union all select 'entity_relationships.valid_to', exists(select 1 from information_schema.columns where table_name='entity_relationships' and column_name='valid_to')
  union all select 'entity_relationships.source_event_id', exists(select 1 from information_schema.columns where table_name='entity_relationships' and column_name='source_event_id')
  union all select 'entity_relationships 6-part uniq', exists(select 1 from pg_constraint where conname='entity_relationships_uniq')
  -- Canonical AI memory
  union all select 'ai_memory.scope_type', exists(select 1 from information_schema.columns where table_name='ai_memory' and column_name='scope_type')
  union all select 'ai_memory.identity_key', exists(select 1 from information_schema.columns where table_name='ai_memory' and column_name='identity_key')
  union all select 'ai_memory.normalized_fact_key', exists(select 1 from information_schema.columns where table_name='ai_memory' and column_name='normalized_fact_key')
  union all select 'ai_memory.sensitivity', exists(select 1 from information_schema.columns where table_name='ai_memory' and column_name='sensitivity')
  union all select 'ai_memory.superseded_by', exists(select 1 from information_schema.columns where table_name='ai_memory' and column_name='superseded_by')
  union all select 'ai_memory identity active uniq', exists(select 1 from pg_indexes where indexname='ai_memory_identity_active_uniq')
  -- Recommendation lifecycle (broker)
  union all select 'recommendation_events table', to_regclass('public.recommendation_events') is not null
  -- Meeting lifecycle
  union all select 'meetings.completed_at', exists(select 1 from information_schema.columns where table_name='meetings' and column_name='completed_at')
  union all select 'meetings.outcome', exists(select 1 from information_schema.columns where table_name='meetings' and column_name='outcome')
  -- Canonical deal + seller linkage + lead conversion
  union all select 'deals canonical id present', to_regclass('public.deals') is not null
  union all select 'property_sellers linkage', to_regclass('public.property_sellers') is not null
  union all select 'leads.converted (any conv col)', exists(select 1 from information_schema.columns where table_name='leads' and column_name in ('converted_buyer_id','converted_seller_id','converted_at','converted_to'))
  -- Notifications idempotency
  union all select 'notifications.event_id', exists(select 1 from information_schema.columns where table_name='notifications' and column_name='event_id')
  union all select 'notifications event uniq', exists(select 1 from pg_indexes where indexname='notifications_event_uniq')
  -- Ask persistence + cache
  union all select 'zono_ask_conversations', to_regclass('public.zono_ask_conversations') is not null
  union all select 'zono_ask_messages', to_regclass('public.zono_ask_messages') is not null
  union all select 'zono_compute_cache', to_regclass('public.zono_compute_cache') is not null
  -- CORRECTED ai_memory private gate (STAB-1): qa1_read policy must include the private predicate
  union all select 'ai_memory_qa1_read policy exists', exists(select 1 from pg_policies where tablename='ai_memory' and policyname='ai_memory_qa1_read')
  union all select 'ai_memory_qa1_read gated (NOT org-only)', exists(
    select 1 from pg_policies where tablename='ai_memory' and policyname='ai_memory_qa1_read'
    and (qual ilike '%visibility%' and qual ilike '%auth.uid()%'))
)
select k as check, v as ok from checks order by v asc, k;  -- failures (ok=false) float to the top
