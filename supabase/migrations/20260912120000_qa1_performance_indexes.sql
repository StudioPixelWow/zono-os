-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 PERFORMANCE INDEX PACK. ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Hot-path composite indexes for the derive-on-read read patterns identified in
-- QA.1. All use `create index if not exists` and REAL column names verified
-- against the live migrations (note: property_transactions uses organization_id
-- + neighborhood_name; distribution_posts uses org_id; community_comments uses
-- organization_id). No table rewrites, no drops.
-- ============================================================================

-- Street & Building Intelligence (reads property_transactions by city/street/date)
create index if not exists qa1_ptx_city_street_date_idx
  on public.property_transactions (city_name, street, deal_date desc);
create index if not exists qa1_ptx_city_hood_date_idx
  on public.property_transactions (city_name, neighborhood_name, deal_date desc);

-- Distribution scheduling & per-property marketing log
create index if not exists qa1_dpost_org_status_sched_idx
  on public.distribution_posts (org_id, status, scheduled_at);
create index if not exists qa1_dpost_org_prop_created_idx
  on public.distribution_posts (org_id, property_id, created_at desc);

-- Community comments per property
create index if not exists qa1_ccomment_org_prop_created_idx
  on public.community_comments (organization_id, property_id, created_at desc);

-- Agent inbox time-ordered feed
create index if not exists qa1_zai_org_status_created_idx
  on public.zono_agent_inbox (organization_id, status, created_at desc);

-- Workflow / mission dedup + entity lookups
create index if not exists qa1_zw_org_entity_status_idx
  on public.zono_workflows (organization_id, entity_type, entity_id, status);
create index if not exists qa1_zm_org_entity_status_idx
  on public.zono_missions (organization_id, entity_type, entity_id, status);

-- NOTE: zono_api_audit already has (organization_id, at desc) [zaa_org_at_idx];
-- the API audit hot path is already covered — no new index needed.
