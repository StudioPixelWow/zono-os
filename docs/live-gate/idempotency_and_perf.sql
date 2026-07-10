-- ============================================================================
-- ZONO LIVE ACTIVATION GATE · A8 idempotency + A10 performance baseline.
-- Read-only diagnostics. Run after A7 smoke flows + a re-drain.
-- ============================================================================

-- ── A8.1 — duplicate detection across every read model (all must be 0) ───────
select 'activity_events dup projections' as check, count(*) as dups from (
  select org_id, event_id, entity_type, entity_id, count(*) c
  from public.activity_events where event_id is not null
  group by 1,2,3,4 having count(*) > 1) x
union all
select 'search_documents dup entities', count(*) from (
  select organization_id, entity_type, entity_id, count(*) c
  from public.search_documents group by 1,2,3 having count(*) > 1) x
union all
select 'entity_relationships dup edges', count(*) from (
  select org_id, source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, count(*) c
  from public.entity_relationships group by 1,2,3,4,5,6 having count(*) > 1) x
union all
select 'ai_memory dup active identity', count(*) from (
  select organization_id, identity_key, count(*) c
  from public.ai_memory where active and identity_key is not null
  group by 1,2 having count(*) > 1) x
union all
select 'notifications dup per event', count(*) from (
  select org_id, event_id, count(*) c
  from public.notifications where event_id is not null
  group by 1,2 having count(*) > 1) x
union all
select 'deliveries dup per (event,subscriber)', count(*) from (
  select event_id, subscriber, count(*) c
  from public.domain_event_deliveries group by 1,2 having count(*) > 1) x
union all
select 'domain_events dup idempotency_key', count(*) from (
  select organization_id, idempotency_key, count(*) c
  from public.domain_events where idempotency_key is not null
  group by 1,2 having count(*) > 1) x;
-- Every dups value MUST be 0. Any > 0 = idempotency GATE FAILURE.

-- ── A8.2 — the constraints that enforce the above (evidence for the report) ──
select conname, contype from pg_constraint
where conname in ('search_documents_uniq','entity_relationships_uniq','domain_event_deliveries_uniq')
union all
select indexname, 'partial-unique' from pg_indexes
where indexname in ('activity_events_event_projection_uniq','ai_memory_identity_active_uniq',
                    'notifications_event_uniq','domain_events_idem_uniq');

-- ── A10 — performance baseline. Run each EXPLAIN and record p50/p95 from
--          repeated timed runs (\timing on in psql). Replace :org with a real org.
-- \timing on
-- \set org '<a real organization uuid>'

-- drain scan (the hot outbox query)
explain (analyze, buffers) select * from public.domain_events
  where processing_status in ('pending','processing','failed')
  order by occurred_at asc limit 300;

-- timeline read (entity cockpit)
explain (analyze, buffers) select * from public.activity_events
  where org_id = :'org' order by occurred_at desc limit 30;

-- search (trigram)
explain (analyze, buffers) select entity_type, entity_id from public.search_documents
  where organization_id = :'org' and normalized_text ilike '%דירה%' limit 20;

-- graph (active edges for an entity)
explain (analyze, buffers) select * from public.entity_relationships
  where org_id = :'org' and status = 'active' order by last_seen_at desc limit 20;

-- memory (active org memory)
explain (analyze, buffers) select * from public.ai_memory
  where organization_id = :'org' and active order by confidence desc limit 20;

-- row counts (context for the latency numbers)
select 'domain_events' t, count(*) rows from public.domain_events
union all select 'activity_events', count(*) from public.activity_events
union all select 'search_documents', count(*) from public.search_documents
union all select 'entity_relationships', count(*) from public.entity_relationships
union all select 'ai_memory', count(*) from public.ai_memory
union all select 'domain_event_deliveries', count(*) from public.domain_event_deliveries;
