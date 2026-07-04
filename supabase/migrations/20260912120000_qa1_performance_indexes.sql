-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 PERFORMANCE INDEX PACK. ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Hot-path composite indexes for the derive-on-read read patterns identified in
-- QA.1. Each index is created only if BOTH the table exists in this database
-- (to_regclass guard) — so the pack is safe on any project — and the index does
-- not already exist. Real column names verified against the live migrations
-- (property_transactions.organization_id / neighborhood_name; distribution_posts
-- .org_id; community_comments.organization_id). No table rewrites, no drops.
-- ============================================================================

do $$
declare s record;
begin
  for s in (
    select * from (values
      ('property_transactions', 'qa1_ptx_city_street_date_idx',       'property_transactions (city_name, street, deal_date desc)'),
      ('property_transactions', 'qa1_ptx_city_hood_date_idx',         'property_transactions (city_name, neighborhood_name, deal_date desc)'),
      ('distribution_posts',    'qa1_dpost_org_status_sched_idx',     'distribution_posts (org_id, status, scheduled_at)'),
      ('distribution_posts',    'qa1_dpost_org_prop_created_idx',     'distribution_posts (org_id, property_id, created_at desc)'),
      ('community_comments',    'qa1_ccomment_org_prop_created_idx',  'community_comments (organization_id, property_id, created_at desc)'),
      ('zono_agent_inbox',      'qa1_zai_org_status_created_idx',     'zono_agent_inbox (organization_id, status, created_at desc)'),
      ('zono_workflows',        'qa1_zw_org_entity_status_idx',       'zono_workflows (organization_id, entity_type, entity_id, status)'),
      ('zono_missions',         'qa1_zm_org_entity_status_idx',       'zono_missions (organization_id, entity_type, entity_id, status)')
    ) as x(tbl, idx, def)
  ) loop
    continue when to_regclass('public.' || s.tbl) is null;
    execute format('create index if not exists %I on public.%s;', s.idx, s.def);
  end loop;
end $$;

-- NOTE: zono_api_audit already has (organization_id, at desc) [zaa_org_at_idx];
-- the API audit hot path is already covered — no new index needed.
