-- ============================================================================
-- ZONO LIVE ACTIVATION GATE · A3 — APPLY ALL PENDING MIGRATIONS (one paste).
-- Concatenation of migrations 20260907 → 20260926 in dependency order.
-- Every block is guarded (if not exists / drop-if-exists) and safe to re-run,
-- so already-applied migrations become no-ops. Paste whole into Supabase SQL
-- editor and Run, OR prefer 'supabase db push' if you have the CLI linked.
-- After running, execute docs/live-gate/verify_schema.sql (all ok=true).
-- ============================================================================


-- ####################################################################
-- ## 20260907120000_qa1_rls_coverage.sql
-- ####################################################################
-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 RLS COVERAGE PACK. STRICTLY ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Closes the QA.1 finding that many private tables lacked an explicit RLS
-- enablement. For every private, org-scoped table this:
--   (1) enables row level security (no-op if already enabled), and
--   (2) adds a UNIQUELY-NAMED "<table>_qa1_read" permissive SELECT policy
--       scoped to the caller's org via public.current_org_id().
-- Permissive policies OR together, so this can NEVER reduce access below an
-- existing policy; it only closes gaps where RLS/read-scoping was missing.
-- Writes continue to run under service_role (BYPASSRLS) per the canonical rule,
-- so NO insert/update/delete policies are added here (matches house pattern).
-- Public reference tables and no-tenant-column tables are intentionally skipped
-- (documented in the phase report and below).
-- Re-runnable: drop policy if exists guards every policy.
-- ============================================================================

do $$
declare r record;
begin
  for r in (
    select * from (values
      ('acquisition_signals','org_id'),
      ('activities','org_id'),
      ('activity_events','org_id'),
      ('agencies','organization_id'),
      ('agency_agents','organization_id'),
      ('agency_ai_feedback','organization_id'),
      ('agency_aliases','organization_id'),
      ('agency_branches','organization_id'),
      ('agency_entity_relationships','organization_id'),
      ('agency_identity_matches','organization_id'),
      ('agency_intelligence_audit_log','organization_id'),
      ('agency_intelligence_job_runs','organization_id'),
      ('agency_intelligence_policies','organization_id'),
      ('agency_intelligence_reports','organization_id'),
      ('agency_intelligence_sources','organization_id'),
      ('agency_profiles','organization_id'),
      ('agency_report_exports','organization_id'),
      ('agency_resolution_candidates','organization_id'),
      ('agency_scores','organization_id'),
      ('agency_signals','organization_id'),
      ('agency_territory_stats','organization_id'),
      ('agency_timeline','organization_id'),
      ('agent_coaching_signals','organization_id'),
      ('agent_intelligence_profiles','organization_id'),
      ('agent_locality_performance','organization_id'),
      ('agent_property_type_performance','organization_id'),
      ('agent_website_events','organization_id'),
      ('agent_website_leads','organization_id'),
      ('agent_websites','organization_id'),
      ('ai_briefs','organization_id'),
      ('ai_copilot_cache','org_id'),
      ('ai_focus_items','organization_id'),
      ('ai_growth_plans','organization_id'),
      ('ai_memory','organization_id'),
      ('ai_mission_drafts','organization_id'),
      ('ai_opportunities','organization_id'),
      ('ai_risks','organization_id'),
      ('ai_simulations','organization_id'),
      ('attention_items','org_id'),
      ('audit_log','organization_id'),
      ('automation_actions','organization_id'),
      ('automation_conditions','organization_id'),
      ('automation_recommendations','organization_id'),
      ('automation_run_logs','organization_id'),
      ('automation_runs','organization_id'),
      ('automation_steps','organization_id'),
      ('automation_triggers','organization_id'),
      ('automation_workflows','organization_id'),
      ('automations','org_id'),
      ('beta_enrollments','org_id'),
      ('bi_reports','org_id'),
      ('bi_snapshots','org_id'),
      ('brand_assets','org_id'),
      ('brand_identity_profiles','org_id'),
      ('broker_ai_coaching','organization_id'),
      ('broker_aliases','org_id'),
      ('broker_competitive_intelligence','organization_id'),
      ('broker_discovery_runs','org_id'),
      ('broker_gap_analysis','organization_id'),
      ('broker_growth_strategy','organization_id'),
      ('broker_logo_assets','org_id'),
      ('broker_market_intelligence','organization_id'),
      ('broker_match_reviews','org_id'),
      ('broker_profiles','org_id'),
      ('broker_service_areas','org_id'),
      ('broker_sources','org_id'),
      ('broker_winning_dna','organization_id'),
      ('brokerage_external_listing_links','organization_id'),
      ('brokerage_office_discovery_runs','organization_id'),
      ('brokerage_research_jobs','organization_id'),
      ('building_cluster_profiles','organization_id'),
      ('building_intelligence','organization_id'),
      ('buyer_commitments','org_id'),
      ('buyer_demand_profiles','org_id'),
      ('buyer_financial_profiles','organization_id'),
      ('buyer_geo_profiles','org_id'),
      ('buyer_intelligence_profiles','org_id'),
      ('buyer_missions','org_id'),
      ('buyer_objections','org_id'),
      ('buyer_property_matches','org_id'),
      ('buyer_risks','org_id'),
      ('buyer_segments','organization_id'),
      ('buyer_touchpoints','org_id'),
      ('buyers','org_id'),
      ('client_advocates','organization_id'),
      ('client_memory','org_id'),
      ('client_portal_items','organization_id'),
      ('client_portal_sections','organization_id'),
      ('client_portal_views','organization_id'),
      ('client_portals','organization_id'),
      ('client_reviews','organization_id'),
      ('communication_commitments','org_id'),
      ('communication_entities','org_id'),
      ('communication_events','org_id'),
      ('communication_followups','org_id'),
      ('communication_insights','org_id'),
      ('communication_intelligence_profiles','org_id'),
      ('communication_intents','org_id'),
      ('communication_messages','org_id'),
      ('communication_objections','org_id'),
      ('communication_opportunities','org_id'),
      ('communication_risks','org_id'),
      ('communication_sentiment','org_id'),
      ('communication_summaries','org_id'),
      ('communication_threads','org_id'),
      ('community_activity_logs','organization_id'),
      ('community_comments','organization_id'),
      ('community_deal_attribution','organization_id'),
      ('community_discovery_candidates','organization_id'),
      ('community_discovery_runs','organization_id'),
      ('community_dna_profiles','organization_id'),
      ('community_intelligence_profiles','organization_id'),
      ('community_lead_attribution','organization_id'),
      ('community_metrics','organization_id'),
      ('community_network_profiles','organization_id'),
      ('community_profiles','organization_id'),
      ('community_rankings','organization_id'),
      ('competitor_market_positions','organization_id'),
      ('competitor_profiles','organization_id'),
      ('competitor_signals','organization_id'),
      ('conversation_memory','org_id'),
      ('creative_dna_analysis_runs','org_id'),
      ('creative_dna_profiles','org_id'),
      ('creative_generation_attempts','org_id'),
      ('creative_generation_references','org_id'),
      ('creative_generations','org_id'),
      ('creative_qa_reports','org_id'),
      ('creative_reference_assets','org_id'),
      ('daily_distribution_batches','organization_id'),
      ('daily_distribution_items','organization_id'),
      ('deal_forecast_signals','organization_id'),
      ('deal_forecasts','organization_id'),
      ('deal_journeys','organization_id'),
      ('deal_negotiations','organization_id'),
      ('deal_objections','organization_id'),
      ('deal_profiles','organization_id'),
      ('deal_tasks','organization_id'),
      ('deals','org_id'),
      ('decision_intelligence_profiles','org_id'),
      ('decision_queue','org_id'),
      ('decision_recommendations','org_id'),
      ('demand_cluster_buyers','org_id'),
      ('demand_clusters','org_id'),
      ('demand_heatmap_cells','org_id'),
      ('distribution_analytics','org_id'),
      ('distribution_automations','org_id'),
      ('distribution_campaign_groups','org_id'),
      ('distribution_campaigns','org_id'),
      ('distribution_channels','org_id'),
      ('distribution_comments','org_id'),
      ('distribution_group_leads','org_id'),
      ('distribution_group_posts','org_id'),
      ('distribution_groups','org_id'),
      ('distribution_leads','org_id'),
      ('distribution_opportunity_signals','organization_id'),
      ('distribution_plan_items','organization_id'),
      ('distribution_plans','organization_id'),
      ('distribution_posts','org_id'),
      ('distribution_provider_connections','org_id'),
      ('distribution_provider_destinations','org_id'),
      ('distribution_publish_jobs','org_id'),
      ('distribution_queue','organization_id'),
      ('distribution_schedules','org_id'),
      ('distribution_variations','org_id'),
      ('document_audit_logs','organization_id'),
      ('document_checklists','organization_id'),
      ('document_folders','organization_id'),
      ('document_participants','organization_id'),
      ('document_requests','organization_id'),
      ('document_requirements','organization_id'),
      ('document_signatures','organization_id'),
      ('document_templates','organization_id'),
      ('document_versions','organization_id'),
      ('documents','org_id'),
      ('engine_runs','organization_id'),
      ('entity_relationships','org_id'),
      ('explainability_events','org_id'),
      ('external_listing_duplicates','org_id'),
      ('external_listing_history','org_id'),
      ('external_listing_sources','org_id'),
      ('external_listings','org_id'),
      ('facebook_connection_paths','org_id'),
      ('facebook_extension_instances','org_id'),
      ('facebook_extension_pairings','org_id'),
      ('financing_signals','organization_id'),
      ('geo_coverage_targets','organization_id'),
      ('graph_entities','organization_id'),
      ('graph_relationships','organization_id'),
      ('graph_signals','organization_id'),
      ('import_job_logs','org_id'),
      ('import_jobs','org_id'),
      ('inventory_acquisition_actions','organization_id'),
      ('inventory_acquisition_profiles','organization_id'),
      ('inventory_acquisition_reviews','organization_id'),
      ('journey_audit_log','org_id'),
      ('journey_blockers','org_id'),
      ('journey_delayed_actions','org_id'),
      ('journey_events','org_id'),
      ('journey_execution_steps','org_id'),
      ('journey_executions','org_id'),
      ('journey_milestones','org_id'),
      ('journey_opportunities','org_id'),
      ('journey_predictions','org_id'),
      ('journey_risks','org_id'),
      ('journey_scores','org_id'),
      ('journey_sla_rules','org_id'),
      ('journey_stages','org_id'),
      ('journey_templates','org_id'),
      ('journey_triggers','org_id'),
      ('journey_velocity','org_id'),
      ('journey_workflow_versions','org_id'),
      ('journey_workflows','org_id'),
      ('journeys','org_id'),
      ('lead_routing_candidates','organization_id'),
      ('lead_routing_profiles','organization_id'),
      ('leads','org_id'),
      ('legal_documents','organization_id'),
      ('mai_model_calibration','organization_id'),
      ('management_actions','organization_id'),
      ('market_acceptance_aggregates','organization_id'),
      ('market_acceptance_scores','organization_id'),
      ('market_area_leaders','organization_id'),
      ('market_area_snapshots','organization_id'),
      ('market_listing_events','organization_id'),
      ('market_listing_lifecycle','organization_id'),
      ('market_listing_signals','organization_id'),
      ('marketing_opportunity_signals','organization_id'),
      ('match_intelligence_profiles','org_id'),
      ('match_objections','org_id'),
      ('match_opportunities','org_id'),
      ('match_risks','org_id'),
      ('matching_results','org_id'),
      ('meetings','org_id'),
      ('messenger_threads','organization_id'),
      ('notes','org_id'),
      ('notification_state','organization_id'),
      ('notifications','org_id'),
      ('office_coaching_items','org_id'),
      ('office_goals','org_id'),
      ('office_intelligence_profiles','organization_id'),
      ('office_intelligence_snapshots','org_id'),
      ('office_reports','org_id'),
      ('office_website_events','organization_id'),
      ('office_website_leads','organization_id'),
      ('office_websites','organization_id'),
      ('onboarding_progress','org_id'),
      ('opportunities','org_id'),
      ('opportunity_signals','org_id'),
      ('org_invitations','org_id'),
      ('org_market_property_links','org_id'),
      ('org_plans','org_id'),
      ('organization_operating_localities','organization_id'),
      ('organization_revenue_profiles','organization_id'),
      ('pipeline_snapshots','organization_id'),
      ('platform_audit_log','org_id'),
      ('projects','org_id'),
      ('properties','org_id'),
      ('property_alerts','org_id'),
      ('property_broker_matches','org_id'),
      ('property_calendar_plans','org_id'),
      ('property_community_matches','organization_id'),
      ('property_exposure_channels','org_id'),
      ('property_intelligence_profiles','org_id'),
      ('property_journeys','org_id'),
      ('property_levers','org_id'),
      ('property_marketing_profiles','organization_id'),
      ('property_media','org_id'),
      ('property_missions','org_id'),
      ('property_opportunity_scores','org_id'),
      ('property_radar_settings','org_id'),
      ('property_research_reports','organization_id'),
      ('property_risks','org_id'),
      ('property_score_events','org_id'),
      ('property_seller_touchpoints','org_id'),
      ('property_sellers','org_id'),
      ('property_sync_runs','org_id'),
      ('property_sync_sources','org_id'),
      ('property_sync_watermarks','org_id'),
      ('property_transactions','organization_id'),
      ('property_valuations','organization_id'),
      ('radar_competitor_alerts','org_id'),
      ('radar_competitor_area_metrics','org_id'),
      ('radar_competitor_listing_links','org_id'),
      ('radar_competitor_profiles','org_id'),
      ('radar_seller_followups','org_id'),
      ('radar_seller_outcomes','org_id'),
      ('radar_seller_profiles','org_id'),
      ('radar_seller_signals','org_id'),
      ('radar_seller_touchpoints','org_id'),
      ('rain_edges','organization_id'),
      ('rain_nodes','organization_id'),
      ('recommendation_events','organization_id'),
      ('recommendation_feedback','organization_id'),
      ('recommendation_map_points','organization_id'),
      ('recommendation_packages','organization_id'),
      ('recommendation_profiles','organization_id'),
      ('recommendations','organization_id'),
      ('referrals','organization_id'),
      ('reputation_scores','organization_id'),
      ('reputation_signals','organization_id'),
      ('revenue_leakage_events','organization_id'),
      ('revenue_signals','org_id'),
      ('revenue_targets','organization_id'),
      ('review_campaigns','organization_id'),
      ('review_requests','organization_id'),
      ('seller_commitments','org_id'),
      ('seller_geo_profiles','org_id'),
      ('seller_intelligence_profiles','org_id'),
      ('seller_missions','org_id'),
      ('seller_risks','org_id'),
      ('seller_touchpoints','org_id'),
      ('sellers','org_id'),
      ('social_account_sync_logs','organization_id'),
      ('social_accounts','organization_id'),
      ('social_connection_vault','organization_id'),
      ('social_followups','organization_id'),
      ('social_interactions','organization_id'),
      ('social_leads','organization_id'),
      ('street_intelligence','organization_id'),
      ('street_territory_profiles','organization_id'),
      ('support_impersonation_log','org_id'),
      ('tasks','org_id'),
      ('team_intelligence_profiles','organization_id'),
      ('team_opportunity_leaks','organization_id'),
      ('team_performance_snapshots','organization_id'),
      ('territory_assignments','organization_id'),
      ('territory_centroids','org_id'),
      ('territory_dna_profiles','organization_id'),
      ('territory_profiles','organization_id'),
      ('territory_signals','organization_id'),
      ('territory_snapshots','organization_id'),
      ('transaction_opportunity_radar_alerts','organization_id'),
      ('transaction_sync_logs','organization_id'),
      ('units','org_id'),
      ('usage_events','org_id'),
      ('user_feedback','org_id'),
      ('users','org_id'),
      ('valuation_accuracy','organization_id'),
      ('valuation_adjustments','organization_id'),
      ('valuation_broker_sold_properties','organization_id'),
      ('valuation_comparables','organization_id'),
      ('valuation_explanations','organization_id'),
      ('valuation_history','organization_id'),
      ('valuation_market_snapshots','organization_id'),
      ('valuation_report_sends','organization_id'),
      ('valuation_reports','organization_id'),
      ('valuation_weight_results','organization_id'),
      ('whatsapp_accounts','organization_id'),
      ('whatsapp_ai_actions','organization_id'),
      ('whatsapp_audit_logs','organization_id'),
      ('whatsapp_call_events','organization_id'),
      ('whatsapp_campaigns','organization_id'),
      ('whatsapp_conversations','organization_id'),
      ('whatsapp_daily_missions','organization_id'),
      ('whatsapp_drafts','organization_id'),
      ('whatsapp_followups','organization_id'),
      ('whatsapp_knowledge_base','organization_id'),
      ('whatsapp_messages','organization_id'),
      ('whatsapp_segments','organization_id'),
      ('whatsapp_smart_link_events','organization_id'),
      ('whatsapp_smart_links','organization_id'),
      ('zi_conversations','organization_id'),
      ('zi_diagnostic_runs','organization_id'),
      ('zi_knowledge_feedback','organization_id'),
      ('zi_learning_progress','organization_id'),
      ('zi_messages','organization_id'),
      ('zono_agent_inbox','organization_id'),
      ('zono_agent_memory','organization_id'),
      ('zono_agent_performance','organization_id'),
      ('zono_agent_runs','organization_id'),
      ('zono_agents','organization_id'),
      ('zono_api_audit','organization_id'),
      ('zono_api_keys','organization_id'),
      ('zono_campaign_assets','org_id'),
      ('zono_campaigns','org_id'),
      ('zono_copy_assets','org_id'),
      ('zono_creative_assets','org_id'),
      ('zono_creative_candidates','org_id'),
      ('zono_creative_concepts','org_id'),
      ('zono_creative_outputs','org_id'),
      ('zono_creative_quality_reviews','org_id'),
      ('zono_marketing_analysis_jobs','org_id'),
      ('zono_marketing_assets','org_id'),
      ('zono_marketing_briefs','org_id'),
      ('zono_marketing_dna_profiles','org_id'),
      ('zono_marketing_feedback','org_id'),
      ('zono_missions','organization_id'),
      ('zono_orchestrator_locks','organization_id'),
      ('zono_orchestrator_runs','organization_id'),
      ('zono_quick_creative_outputs','org_id'),
      ('zono_quick_creative_requests','org_id'),
      ('zono_visual_assets','org_id'),
      ('zono_webhooks','organization_id'),
      ('zono_workflows','organization_id')
    ) as x(tbl, orgcol)
  ) loop
    -- skip tables that do not exist in THIS database (migrations may define more
    -- tables than a given project has applied) — makes the pack safe everywhere.
    continue when to_regclass('public.' || r.tbl) is null;
    -- enable RLS (idempotent)
    execute format('alter table public.%I enable row level security;', r.tbl);
    -- additive, uniquely-named org-scoped read policy
    execute format('drop policy if exists %I on public.%I;', r.tbl||'_qa1_read', r.tbl);
    execute format(
      'create policy %I on public.%I for select to authenticated using (%I = public.current_org_id());',
      r.tbl||'_qa1_read', r.tbl, r.orgcol);
  end loop;
end $$;

-- ── Intentionally SKIPPED — no tenant column (require manual review) ─────────
--   automation_templates
--   brokerage_activity_areas
--   brokerage_agents
--   brokerage_broker_identity
--   brokerage_change_log
--   brokerage_completeness
--   brokerage_contact_points
--   brokerage_coverage
--   brokerage_data_conflicts
--   brokerage_data_health_snapshots
--   brokerage_data_sources
--   brokerage_duplicate_cluster_members
--   brokerage_duplicate_clusters
--   brokerage_entity_dna
--   brokerage_entity_snapshots
--   brokerage_graph_edges
--   brokerage_graph_nodes
--   brokerage_identity_matches
--   brokerage_market_dna
--   brokerage_market_share
--   brokerage_neighborhood_stats
--   brokerage_office_candidates
--   brokerage_office_evidence
--   brokerage_office_graph_edges
--   brokerage_office_locations
--   brokerage_office_merge_suggestions
--   brokerage_offices
--   brokerage_predictions
--   brokerage_refresh_diffs
--   brokerage_refresh_runs
--   brokerage_relationship_discoveries
--   brokerage_research_dossier
--   brokerage_timeline_events
--   legal_document_audit_log
--   legal_document_signatures
--   legal_template_fields
--   legal_template_sections
--   legal_templates
--   market_area_cache_state
--   market_property_events
--   market_property_sources
--   market_sync_runs
--   market_sync_watermarks
--   neighborhood_enrichment_cities
--   organizations
--   provider_qa_daily_metrics
--   provider_schema_events
--   provider_schema_fingerprints
--   user_operating_localities
--   zono_workflow_history
--   zono_workflow_steps


-- ####################################################################
-- ## 20260908120000_qa1_org_memory.sql
-- ####################################################################
-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 DURABLE ORGANIZATIONAL MEMORY. ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Closes the QA.1 "Organizational Memory has no store" finding. The existing
-- Org-Memory engine derives on read from mission history; these tables give it a
-- DURABLE substrate so learning/patterns persist and can be trended. The engine
-- keeps derive-on-read as a FALLBACK; the store becomes the primary source.
-- Writes run under service_role (BYPASSRLS); authenticated gets org-scoped READ.
-- ============================================================================

-- ── Durable memory records ──────────────────────────────────────────────────
create table if not exists public.zono_org_memory (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  entity_type   text,                         -- buyer|seller|lead|property|office|org|...
  entity_id     text,
  memory_type   text not null,                -- fact|pattern|preference|outcome|lesson
  title         text not null,
  summary       text,
  evidence      jsonb not null default '[]'::jsonb,
  confidence    numeric,                       -- 0..1
  impact        text,                          -- low|medium|high
  source_module text,
  occurred_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists zom_org_idx     on public.zono_org_memory (org_id);
create index if not exists zom_entity_idx  on public.zono_org_memory (org_id, entity_type, entity_id);
create index if not exists zom_type_idx    on public.zono_org_memory (org_id, memory_type);
create index if not exists zom_occurred_idx on public.zono_org_memory (org_id, occurred_at desc);

-- ── Append-only event stream feeding memory ─────────────────────────────────
create table if not exists public.zono_org_memory_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  entity_type   text,
  entity_id     text,
  event_type    text not null,                 -- mission_completed|price_changed|deal_won|...
  title         text not null,
  summary       text,
  evidence      jsonb not null default '[]'::jsonb,
  impact        text,
  source_module text,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists zome_org_idx      on public.zono_org_memory_events (org_id);
create index if not exists zome_entity_idx   on public.zono_org_memory_events (org_id, entity_type, entity_id);
create index if not exists zome_type_idx     on public.zono_org_memory_events (org_id, event_type);
create index if not exists zome_occurred_idx on public.zono_org_memory_events (org_id, occurred_at desc);

-- ── Learned patterns (aggregated lessons) ───────────────────────────────────
create table if not exists public.zono_org_learning_patterns (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  entity_type   text,
  memory_type   text not null default 'pattern',
  title         text not null,
  summary       text,
  evidence      jsonb not null default '[]'::jsonb,
  confidence    numeric,
  impact        text,
  occurrences   integer not null default 1,
  source_module text,
  first_seen_at timestamptz,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists zolp_org_idx    on public.zono_org_learning_patterns (org_id);
create index if not exists zolp_entity_idx on public.zono_org_learning_patterns (org_id, entity_type);
create index if not exists zolp_conf_idx   on public.zono_org_learning_patterns (org_id, confidence desc);

alter table public.zono_org_memory            enable row level security;
alter table public.zono_org_memory_events     enable row level security;
alter table public.zono_org_learning_patterns enable row level security;

drop policy if exists zom_select on public.zono_org_memory;
create policy zom_select on public.zono_org_memory for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists zome_select on public.zono_org_memory_events;
create policy zome_select on public.zono_org_memory_events for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists zolp_select on public.zono_org_learning_patterns;
create policy zolp_select on public.zono_org_learning_patterns for select to authenticated
  using (org_id = public.current_org_id());


-- ####################################################################
-- ## 20260909120000_qa1_intelligence_snapshots.sql
-- ####################################################################
-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 INTELLIGENCE SNAPSHOTS. ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Closes the QA.1 "derive-on-read intelligence cannot be trended" finding. One
-- generic table stores point-in-time computed intelligence (Truth scores, CoS
-- org score, listing/buyer/seller/lead health, office growth, market domination,
-- street/building intel, competitive position, ...). Modules are NOT forced to
-- write immediately — a reusable repository (src/lib/intelligence-store) offers
-- opt-in snapshot writes/reads. Writes run under service_role; authenticated
-- gets org-scoped READ.
-- ============================================================================

create table if not exists public.zono_intelligence_snapshots (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  entity_type   text not null,                 -- property|buyer|seller|lead|office|org|street|building|area
  entity_id     text,
  kind          text not null,                 -- truth|cos_org|listing_health|buyer_health|... (namespaced)
  score         numeric,
  confidence    numeric,
  truth_score   numeric,
  payload       jsonb not null default '{}'::jsonb,
  source_module text,
  computed_at   timestamptz not null default now(),
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists zis_org_idx      on public.zono_intelligence_snapshots (org_id);
create index if not exists zis_entity_idx   on public.zono_intelligence_snapshots (org_id, entity_type, entity_id);
create index if not exists zis_kind_idx     on public.zono_intelligence_snapshots (org_id, kind);
create index if not exists zis_computed_idx on public.zono_intelligence_snapshots (org_id, kind, computed_at desc);
create index if not exists zis_expires_idx  on public.zono_intelligence_snapshots (expires_at);

alter table public.zono_intelligence_snapshots enable row level security;

drop policy if exists zis_select on public.zono_intelligence_snapshots;
create policy zis_select on public.zono_intelligence_snapshots for select to authenticated
  using (org_id = public.current_org_id());


-- ####################################################################
-- ## 20260910120000_qa1_compute_cache.sql
-- ####################################################################
-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 COMPUTE CACHE. ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Closes the QA.1 "no cache tier for heavy assemblers" finding. A generic,
-- org-scoped, TTL'd key/value cache for expensive multi-engine assemblies
-- (AI Home, Ask ZONO, Chief of Staff, Orchestrator, Market Domination, Area
-- Portal aggregates). Helpers live in src/lib/compute-cache
-- (getCache/setCache/invalidateCache). Every key is org-scoped — no cross-org
-- or unscoped public caching. Writes run under service_role; authenticated gets
-- org-scoped READ.
-- ============================================================================

create table if not exists public.zono_compute_cache (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  namespace   text not null,                   -- ai_home|ask_zono|cos|orchestrator|market_domination|area_aggregates
  cache_key   text not null,
  payload     jsonb not null default '{}'::jsonb,
  version     text,
  computed_at timestamptz not null default now(),
  expires_at  timestamptz,
  unique (org_id, namespace, cache_key)
);
create index if not exists zcc_lookup_idx  on public.zono_compute_cache (org_id, namespace, cache_key);
create index if not exists zcc_expires_idx on public.zono_compute_cache (expires_at);

alter table public.zono_compute_cache enable row level security;

drop policy if exists zcc_select on public.zono_compute_cache;
create policy zcc_select on public.zono_compute_cache for select to authenticated
  using (org_id = public.current_org_id());


-- ####################################################################
-- ## 20260911120000_qa1_ask_conversations.sql
-- ####################################################################
-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 ASK ZONO CONVERSATION LOG. ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Closes the QA.1 "Ask ZONO conversations are not persisted" finding. Durable
-- log for audit, follow-up continuity, learning and future analytics. Private
-- to the org — never exposed on public routes. Writes run under service_role;
-- authenticated gets org-scoped READ (a user reads their own org's threads).
-- ============================================================================

create table if not exists public.zono_ask_conversations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null,
  user_id     uuid,
  session_id  text not null,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists zac_org_idx     on public.zono_ask_conversations (org_id);
create index if not exists zac_session_idx on public.zono_ask_conversations (org_id, session_id);
create index if not exists zac_updated_idx on public.zono_ask_conversations (org_id, updated_at desc);

create table if not exists public.zono_ask_messages (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null,
  conversation_id uuid references public.zono_ask_conversations(id) on delete cascade,
  session_id      text,
  user_id         uuid,
  question        text,
  answer          text,
  intent          text,
  source_engines  jsonb not null default '[]'::jsonb,
  evidence        jsonb not null default '[]'::jsonb,
  confidence      numeric,
  limitations     text,
  created_at      timestamptz not null default now()
);
create index if not exists zam_org_idx     on public.zono_ask_messages (org_id);
create index if not exists zam_conv_idx    on public.zono_ask_messages (conversation_id, created_at);
create index if not exists zam_created_idx on public.zono_ask_messages (org_id, created_at desc);

alter table public.zono_ask_conversations enable row level security;
alter table public.zono_ask_messages      enable row level security;

drop policy if exists zac_select on public.zono_ask_conversations;
create policy zac_select on public.zono_ask_conversations for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists zam_select on public.zono_ask_messages;
create policy zam_select on public.zono_ask_messages for select to authenticated
  using (org_id = public.current_org_id());


-- ####################################################################
-- ## 20260912120000_qa1_performance_indexes.sql
-- ####################################################################
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


-- ####################################################################
-- ## 20260913120000_whatsapp_cloud_hardening.sql
-- ####################################################################
-- ============================================================================
-- 💬 ZONO — WhatsApp Cloud API hardening (48.1). Additive, idempotent.
-- Adds the Meta account identifiers needed for MULTI-TENANT routing
-- (phone_number_id → organization) + webhook health tracking. No new table:
-- approved templates are stored in the existing whatsapp_accounts.metadata jsonb.
-- ============================================================================
alter table public.whatsapp_accounts
  add column if not exists phone_number_id       text,
  add column if not exists waba_id               text,
  add column if not exists business_account_id   text,
  add column if not exists display_phone_number  text,
  add column if not exists last_webhook_at       timestamptz;

-- Routing index: resolve the org from an incoming webhook's phone_number_id fast.
create unique index if not exists whatsapp_accounts_phone_number_id_uidx
  on public.whatsapp_accounts (phone_number_id)
  where phone_number_id is not null;


-- ####################################################################
-- ## 20260914120000_facebook_connection_per_user.sql
-- ####################################################################
-- ============================================================================
-- ZONO — Facebook connection is PER USER / PER BROKER (not org-global).
-- ----------------------------------------------------------------------------
-- The Facebook OAuth identity + token belong to the individual broker who
-- connected, NOT the whole office. Previously distribution_provider_connections
-- had unique(org_id, provider), so one broker's Facebook connection was global
-- ("Maya connected for everyone"). We add a per-connection `user_id` and make
-- Facebook rows unique per (org_id, provider, user_id) while keeping the other
-- providers (whatsapp/instagram/pages/groups/marketplace) org-scoped.
-- No token is exposed; tokens stay encrypted at rest.
-- ============================================================================

-- 1) Per-connection owner. NULL = org-scoped provider; NOT NULL = user-scoped.
alter table public.distribution_provider_connections
  add column if not exists user_id uuid references public.users(id) on delete cascade;

-- 2) Backfill: attribute existing Facebook connections to the broker who created
--    them, so the currently-connected broker stays connected to THEIR OWN
--    account (other brokers must connect their own).
update public.distribution_provider_connections
  set user_id = created_by
  where provider = 'facebook' and user_id is null and created_by is not null;

-- 3) Replace the org-global uniqueness with a scope-aware scheme.
alter table public.distribution_provider_connections
  drop constraint if exists distribution_provider_connections_org_id_provider_key;

-- Org-scoped providers (user_id IS NULL): one row per (org, provider).
create unique index if not exists uq_dpc_org_provider_orgscope
  on public.distribution_provider_connections (org_id, provider)
  where user_id is null;

-- User-scoped providers (Facebook OAuth identity): one row per (org, provider, user).
create unique index if not exists uq_dpc_org_provider_user
  on public.distribution_provider_connections (org_id, provider, user_id)
  where user_id is not null;

-- Fast lookups by owner.
create index if not exists idx_dpc_user
  on public.distribution_provider_connections (user_id);


-- ####################################################################
-- ## 20260915120000_whatsapp_session_per_user.sql
-- ####################################################################
-- ============================================================================
-- ZONO — Per-user WhatsApp SESSION (temporary QR / WhatsApp-Web provider phase).
-- ----------------------------------------------------------------------------
-- Each broker connects THEIR OWN personal WhatsApp (scoped organization_id +
-- user_id). Sessions are never shared and never global. This reuses the existing
-- whatsapp_accounts table (no new inbox/schema) — we only add per-user scoping
-- and the fields the swappable provider needs (session ref + QR + granular state
-- in metadata). The QR/session provider is TEMPORARY and swappable for the
-- official Cloud API later without touching Inbox / AI / CRM / Timeline.
-- Session material lives server-side only and is never exposed to the client.
-- ============================================================================

-- 1) Per-session owner + provider kind + opaque session reference.
alter table public.whatsapp_accounts
  add column if not exists user_id uuid references public.users(id) on delete cascade;
alter table public.whatsapp_accounts
  add column if not exists provider_kind text;         -- 'bridge' | 'cloud' | 'none'
alter table public.whatsapp_accounts
  add column if not exists session_ref text;           -- opaque handle to the bridge session
alter table public.whatsapp_accounts
  add column if not exists last_connected_at timestamptz;

-- 2) Replace the org-global uniqueness with a scope-aware scheme so the existing
--    org-scoped Cloud row (user_id NULL) and per-broker QR sessions coexist.
alter table public.whatsapp_accounts
  drop constraint if exists wa_accounts_uniq;

-- Org-scoped rows (user_id NULL) — one per (org, provider). Keeps the Cloud row.
create unique index if not exists uq_wa_accounts_org_provider_orgscope
  on public.whatsapp_accounts (organization_id, provider)
  where user_id is null;

-- User-scoped sessions — one per (org, provider, user).
create unique index if not exists uq_wa_accounts_org_provider_user
  on public.whatsapp_accounts (organization_id, provider, user_id)
  where user_id is not null;

create index if not exists idx_wa_accounts_user
  on public.whatsapp_accounts (user_id);


-- ####################################################################
-- ## 20260916120000_meetings_lifecycle.sql
-- ####################################################################
-- ============================================================================
-- ZONO OS 2.0 — Stage 0.4 · Meeting lifecycle (ADDITIVE, reversible).
-- Adds outcome capture + completion/cancellation metadata + follow-up link to
-- the EXISTING meetings table. The meeting_status enum already supports
-- scheduled/confirmed/completed/cancelled/no_show/rescheduled — no enum change.
-- No data rewrite. All columns nullable. Reversible by dropping the columns.
-- ============================================================================
alter table public.meetings add column if not exists completed_at        timestamptz;
alter table public.meetings add column if not exists outcome             text;
alter table public.meetings add column if not exists cancellation_reason text;
alter table public.meetings add column if not exists follow_up_task_id   uuid references public.tasks(id) on delete set null;

-- Fast "completed meetings" reporting (KPI) without scanning.
create index if not exists idx_meetings_org_status on public.meetings (org_id, status);


-- ####################################################################
-- ## 20260917120000_deal_canonical_identity.sql
-- ####################################################################
-- ============================================================================
-- ZONO OS 2.0 — Stage 0.1 · Canonical Deal Identity (ADDITIVE, reversible).
-- Decision: public.deals is the ONE canonical Deal. deal_profiles becomes a 1:1
-- intelligence projection linked by deal_profiles.deal_id (column already
-- exists). This migration only enforces the 1:1 invariant and speeds lookups.
-- No data merge here (the TS reconcile layer links/creates rows using verified
-- relationships only, and flags nothing ambiguous). Reversible by dropping the
-- two indexes.
-- ============================================================================

-- One projection per canonical deal (nulls allowed = match-derived, not yet linked).
create unique index if not exists deal_profiles_deal_id_uniq
  on public.deal_profiles (deal_id)
  where deal_id is not null;

-- Fast canonical<->projection joins.
create index if not exists deal_profiles_deal_id_idx
  on public.deal_profiles (deal_id);

-- ----------------------------------------------------------------------------
-- MIGRATION DIAGNOSTICS (run manually; read-only — nothing is merged by this file):
--   -- canonical deals total
--   select count(*) from public.deals where org_id = :org;
--   -- projections total / linked / unlinked
--   select count(*) filter (where deal_id is not null) as linked,
--          count(*) filter (where deal_id is null)     as unlinked,
--          count(*) as total
--   from public.deal_profiles where organization_id = :org;
--   -- canonical open deals with NO projection (must be surfaced by Deals OS)
--   select d.id from public.deals d
--   where d.org_id = :org and d.status = 'open'
--     and not exists (select 1 from public.deal_profiles p where p.deal_id = d.id);
--   -- duplicate-projection candidates (should be 0 after the unique index)
--   select deal_id, count(*) from public.deal_profiles
--   where deal_id is not null group by deal_id having count(*) > 1;
-- ----------------------------------------------------------------------------


-- ####################################################################
-- ## 20260918120000_seller_linkage_bridge.sql
-- ####################################################################
-- ============================================================================
-- ZONO OS 2.0 — Stage 0.3 · Seller linkage migration (ADDITIVE, reversible).
-- Decision: property_sellers is the CANONICAL seller↔property relationship
-- (multi-seller, roles). Legacy properties.seller_id becomes compatibility-only:
-- it holds ONE primary seller and is kept in sync (never used to represent
-- co-owners). This migration backfills BOTH directions so no reader is starved:
--   A) legacy → canonical: create a property_sellers link for any property that
--      has a legacy seller_id but no canonical link.
--   B) canonical → legacy: set the legacy primary from the canonical link for
--      any property whose legacy column is null (fixes the current starvation of
--      the ~9 modules still reading properties.seller_id).
-- Nothing is deleted. Idempotent (guards prevent duplicates). No fabrication:
-- only real, existing seller↔property rows are linked.
-- ============================================================================

-- A) legacy → canonical (only where the seller still exists in the same org).
insert into public.property_sellers
  (org_id, property_id, seller_id, relationship_type, is_primary, is_decision_maker, can_sign, status)
select p.org_id, p.id, p.seller_id, 'owner', true, true, true, 'active'
from public.properties p
where p.seller_id is not null
  and exists (select 1 from public.sellers s where s.id = p.seller_id and s.org_id = p.org_id)
  and not exists (
    select 1 from public.property_sellers ps
    where ps.property_id = p.id and ps.seller_id = p.seller_id and ps.relationship_type = 'owner'
  )
on conflict (org_id, property_id, seller_id, relationship_type) do nothing;

-- B) canonical → legacy (primary link wins; only fills nulls, never overwrites).
update public.properties p
set seller_id = sub.seller_id
from (
  select distinct on (property_id) property_id, seller_id
  from public.property_sellers
  where status = 'active'
  order by property_id, is_primary desc, created_at asc
) sub
where sub.property_id = p.id and p.seller_id is null;

-- ----------------------------------------------------------------------------
-- MIGRATION DIAGNOSTICS (run manually; read-only):
--   -- properties with a legacy seller but no canonical link (should be 0 after A)
--   select count(*) from public.properties p
--   where p.seller_id is not null and not exists (
--     select 1 from public.property_sellers ps where ps.property_id = p.id and ps.seller_id = p.seller_id);
--   -- properties with a canonical link but null legacy (should be 0 after B)
--   select count(*) from public.properties p
--   where p.seller_id is null and exists (
--     select 1 from public.property_sellers ps where ps.property_id = p.id and ps.status = 'active');
--   -- multi-seller properties (co-owners — legacy holds only the primary)
--   select property_id, count(*) from public.property_sellers
--   where status = 'active' group by property_id having count(*) > 1;
--   -- cross-org anomalies (must be 0)
--   select ps.id from public.property_sellers ps join public.properties p on p.id = ps.property_id
--   where p.org_id <> ps.org_id;
-- ----------------------------------------------------------------------------


-- ####################################################################
-- ## 20260919120000_domain_events_kernel.sql
-- ####################################################################
-- ============================================================================
-- ZONO OS 2.0 — Stage 1 · Event Kernel · domain_events store (ADDITIVE).
-- The durable propagation backbone. Every major business mutation emits one
-- append-only, org-scoped, typed domain event here. This is NOT a replacement
-- for domain tables — it is the spine subscribers (timeline, automation,
-- notifications, search, graph, memory) will consume in later stages.
-- Append-only: authenticated may INSERT (own org) + SELECT (own org); no
-- UPDATE/DELETE for app users. Processing/retry is done by the service role.
-- Idempotency via a unique idempotency_key (nullable = no dedup requested).
-- ============================================================================
create table if not exists public.domain_events (
  id                 uuid primary key default gen_random_uuid(),
  event_type         text not null,
  event_version      smallint not null default 1,
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  actor_user_id      uuid references public.users(id) on delete set null,
  entity_type        text not null,
  entity_id          text not null,
  correlation_id     uuid,
  causation_id       uuid,
  payload            jsonb not null default '{}'::jsonb,
  metadata           jsonb not null default '{}'::jsonb,
  idempotency_key    text,
  occurred_at        timestamptz not null default now(),
  processed_at       timestamptz,
  processing_status  text not null default 'pending',   -- pending | processing | done | failed
  retry_count        smallint not null default 0,
  error_summary      text,
  created_at         timestamptz not null default now()
);

-- Idempotency: one event per key (per org). NULL keys are unconstrained.
create unique index if not exists domain_events_idem_uniq
  on public.domain_events (organization_id, idempotency_key)
  where idempotency_key is not null;

-- Read/scan patterns.
create index if not exists domain_events_org_time_idx   on public.domain_events (organization_id, occurred_at desc);
create index if not exists domain_events_org_type_idx   on public.domain_events (organization_id, event_type, occurred_at desc);
create index if not exists domain_events_entity_idx     on public.domain_events (organization_id, entity_type, entity_id);
-- Outbox scan for subscribers (only unprocessed rows).
create index if not exists domain_events_pending_idx    on public.domain_events (processing_status, occurred_at)
  where processing_status in ('pending', 'processing', 'failed');

alter table public.domain_events enable row level security;

-- Scoped read for org members.
drop policy if exists "domain_events_select" on public.domain_events;
create policy "domain_events_select" on public.domain_events for select to authenticated
  using (organization_id = public.current_org_id());

-- Append-only insert (own org). No UPDATE/DELETE for app users (service role bypasses RLS).
drop policy if exists "domain_events_insert" on public.domain_events;
create policy "domain_events_insert" on public.domain_events for insert to authenticated
  with check (organization_id = public.current_org_id());


-- ####################################################################
-- ## 20260920120000_broker_recommendation_lifecycle.sql
-- ####################################################################
-- ============================================================================
-- ZONO — Broker Intelligence · Recommendation Lifecycle (Broker OS · Phase 3)
-- ----------------------------------------------------------------------------
-- The shared Broker-Intelligence priority queue is computed LIVE from real data
-- (it does not persist recommendation rows). But the broker's DECISIONS on those
-- recommendations must persist and travel to every surface: Accept / Dismiss /
-- Snooze / Completed / Done-elsewhere / Reject. Nothing disappears silently.
--
-- We persist an APPEND-ONLY event log keyed by the recommendation's STABLE
-- identity `rec_key` = "entityType:entityId:actionClass" (see priority.recKey).
-- The current state of a recommendation = its most recent event. This same log
-- feeds Phase 4's learning loop (real historical outcomes, not AI guessing).
--
-- Org column convention: organization_id. RLS via current_org_id()/has_min_role.
-- Idempotent: safe to re-run.
-- ============================================================================

create table if not exists public.broker_recommendation_events (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  -- Stable recommendation identity ("entityType:entityId:actionClass").
  rec_key           text not null,
  -- Denormalized identity parts (for learning-loop aggregation + filtering).
  entity_type       text not null,
  entity_id         text not null,
  area              text,
  action_class      text,
  -- The lifecycle decision.
  action            text not null,
  -- For snooze: when the recommendation should resurface.
  snooze_until      timestamptz,
  -- Snapshot at decision time (fuels the learning loop — real outcomes).
  title             text,
  confidence        integer,
  priority          integer,
  note              text,
  actor_user_id     uuid references public.users(id) on delete set null,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  constraint broker_recommendation_events_action_chk check (action in (
    'accepted','dismissed','snoozed','completed','done_elsewhere','rejected'
  ))
);

-- Latest-per-key lookups per org (drives queue filtering) + time-ordered reads.
create index if not exists broker_recommendation_events_org_key_idx
  on public.broker_recommendation_events (organization_id, rec_key, created_at desc);
create index if not exists broker_recommendation_events_org_created_idx
  on public.broker_recommendation_events (organization_id, created_at desc);
-- Learning-loop aggregation by outcome.
create index if not exists broker_recommendation_events_org_action_idx
  on public.broker_recommendation_events (organization_id, action);

-- Row-level security: strictly org-scoped; agents may read + append.
alter table public.broker_recommendation_events enable row level security;

drop policy if exists "broker_rec_events_select" on public.broker_recommendation_events;
create policy "broker_rec_events_select" on public.broker_recommendation_events for select to authenticated
  using (organization_id = public.current_org_id());

drop policy if exists "broker_rec_events_insert" on public.broker_recommendation_events;
create policy "broker_rec_events_insert" on public.broker_recommendation_events for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_min_role('agent'));

-- Append-only by design: no update/delete policies (history is immutable).

grant select, insert on public.broker_recommendation_events to authenticated;
grant all privileges on public.broker_recommendation_events to service_role;


-- ####################################################################
-- ## 20260921120000_timeline_kernel_guarantee.sql
-- ####################################################################
-- ============================================================================
-- ZONO OS 2.0 — STAGE 2 · Timeline as a Kernel Guarantee
-- ----------------------------------------------------------------------------
-- Makes activity_events the ONE canonical timeline read model that every domain
-- event projects into. We do NOT create another timeline system and we do NOT
-- delete any source ledger — we only harden the existing activity_events so the
-- Event Kernel can project idempotently, fan an event onto multiple related
-- entity timelines, carry provenance (source) and respect visibility.
--
-- Changes to public.activity_events (all additive / widening — safe, idempotent):
--   1. event_id     — the originating domain_events.id (idempotency anchor).
--   2. source       — provenance: 'kernel' | 'imperative' | 'backfill' | 'bridge'.
--   3. visibility   — 'internal' | 'private' | 'shared' | 'public' (portal safety).
--   4. entity_id / related_entity_id widened uuid → text (external_listing and
--      other non-uuid subjects can now have a timeline).
--   5. Partial UNIQUE (org_id, event_id, entity_type, entity_id) WHERE event_id
--      is not null — the idempotency guarantee: reprocessing an event (and each
--      of its related-entity projections) can never create a duplicate row.
--   6. Pagination/read indexes for the shared timeline reader.
--
-- domain_events needs no schema change: retry_count / error_summary /
-- processed_at / processing_status already implement the outbox state machine;
-- the 'processing' claim + dead-letter transitions are enforced in code.
-- ============================================================================

-- 1–3) New columns -----------------------------------------------------------
alter table public.activity_events
  add column if not exists event_id   uuid,
  add column if not exists source     text,
  add column if not exists visibility text not null default 'internal';

-- Constrain visibility to the known set (idempotent add).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'activity_events_visibility_chk'
  ) then
    alter table public.activity_events
      add constraint activity_events_visibility_chk
      check (visibility in ('internal','private','shared','public'));
  end if;
end $$;

-- 4) Widen entity ids uuid → text so text-keyed subjects (external_listing,
--    integration connections, etc.) can carry a timeline. uuid casts cleanly.
do $$
begin
  if (select data_type from information_schema.columns
        where table_schema='public' and table_name='activity_events' and column_name='entity_id') = 'uuid' then
    alter table public.activity_events alter column entity_id type text using entity_id::text;
  end if;
  if (select data_type from information_schema.columns
        where table_schema='public' and table_name='activity_events' and column_name='related_entity_id') = 'uuid' then
    alter table public.activity_events alter column related_entity_id type text using related_entity_id::text;
  end if;
end $$;

-- 5) Idempotency guarantee: one row per (org, event, target timeline). Kernel
--    projections and deterministic backfill rows both flow through this key, so
--    repeated processing is a no-op. Imperative rows (event_id null) are exempt.
create unique index if not exists activity_events_event_projection_uniq
  on public.activity_events (org_id, event_id, entity_type, entity_id)
  where event_id is not null;

-- 6) Read/pagination indexes for the shared timeline reader (subject + related,
--    stable newest-first ordering, visibility & source filters).
create index if not exists activity_events_entity_time_idx
  on public.activity_events (org_id, entity_type, entity_id, occurred_at desc);
create index if not exists activity_events_related_time_idx
  on public.activity_events (org_id, related_entity_type, related_entity_id, occurred_at desc);
create index if not exists activity_events_visibility_idx
  on public.activity_events (org_id, visibility);
create index if not exists activity_events_event_id_idx
  on public.activity_events (event_id) where event_id is not null;

-- Backfill provenance for existing rows: everything already in the table was
-- written imperatively (logActivityEvent) before the kernel projector existed.
update public.activity_events set source = 'imperative' where source is null;


-- ####################################################################
-- ## 20260922120000_kernel_subscriber_deliveries.sql
-- ####################################################################
-- ============================================================================
-- ZONO OS 2.0 — STAGE 3 · Automation + Notifications Subscribers
-- ----------------------------------------------------------------------------
-- Makes the Event Kernel the ONLY source that activates downstream systems.
-- This migration adds two things — NO new engine, NO parallel queue:
--
--   1. domain_event_deliveries — a lightweight per-subscriber delivery ledger.
--      The outbox row (domain_events) carries ONE aggregate status; but Stage 3
--      fans each event to multiple subscribers (timeline / notification /
--      automation / recommendation / graph / memory). This ledger records the
--      outcome PER subscriber (done | duplicate | failed | skipped) with latency,
--      giving idempotency (unique event_id+subscriber) AND the PART-7 metrics
--      (processed / failed / duplicates / avg latency / last processed).
--
--   2. notifications.event_id — the notification subscriber had NO idempotency;
--      reprocessing an event could double-notify. A partial unique on
--      (org_id, event_id) makes kernel notifications idempotent.
--
-- Org column convention here follows each table: domain_event_deliveries uses
-- organization_id; notifications already uses org_id. RLS org-scoped. Idempotent.
-- ============================================================================

-- 1) Per-subscriber delivery ledger --------------------------------------------
create table if not exists public.domain_event_deliveries (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  event_id         uuid not null,
  subscriber       text not null,           -- timeline | notification | automation | recommendation | graph | memory
  status           text not null,           -- done | duplicate | failed | skipped
  attempts         smallint not null default 1,
  latency_ms       integer,
  error            text,
  metadata         jsonb not null default '{}'::jsonb,
  processed_at     timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  constraint domain_event_deliveries_status_chk
    check (status in ('done','duplicate','failed','skipped')),
  -- One outcome per (event, subscriber) → idempotent reprocessing.
  constraint domain_event_deliveries_uniq unique (event_id, subscriber)
);

create index if not exists domain_event_deliveries_org_sub_idx
  on public.domain_event_deliveries (organization_id, subscriber, processed_at desc);
create index if not exists domain_event_deliveries_org_status_idx
  on public.domain_event_deliveries (organization_id, status);
create index if not exists domain_event_deliveries_event_idx
  on public.domain_event_deliveries (event_id);

alter table public.domain_event_deliveries enable row level security;

drop policy if exists "domain_event_deliveries_select" on public.domain_event_deliveries;
create policy "domain_event_deliveries_select" on public.domain_event_deliveries for select to authenticated
  using (organization_id = public.current_org_id());
-- Writes are service-role only (the outbox processor). No insert/update policy
-- for authenticated → append happens under the service role.

grant select on public.domain_event_deliveries to authenticated;
grant all privileges on public.domain_event_deliveries to service_role;

-- 2) Notification idempotency --------------------------------------------------
alter table public.notifications
  add column if not exists event_id uuid;

create unique index if not exists notifications_event_uniq
  on public.notifications (org_id, event_id)
  where event_id is not null;

create index if not exists notifications_org_created_idx
  on public.notifications (org_id, created_at desc);


-- ####################################################################
-- ## 20260923120000_search_documents.sql
-- ####################################################################
-- ============================================================================
-- ZONO OS 2.0 — STAGE 4 · BATCH 4.1 · Canonical Search Projection
-- ----------------------------------------------------------------------------
-- ONE canonical, event-driven search projection every major entity feeds into.
-- We do NOT build a second command palette and we do NOT replace the existing
-- Command Center UI — this is the read model the global search will cut over to
-- (Batch 4.2). The Event Kernel search subscriber upserts/soft-deletes rows here;
-- a backfill seeds history. Legacy live multi-table search stays as fallback.
--
-- SAFETY: normalized_text/keywords carry ONLY broadly-searchable, non-sensitive
-- text (titles, city, status, public identifiers, normalized phone). Private
-- notes, raw legal document text, tokens, webhook payloads and signing secrets
-- are NEVER indexed (enforced in the pure document builder, not here).
-- Org column: organization_id. RLS org-scoped read; writes are service-role.
-- ============================================================================

create extension if not exists pg_trgm;

create table if not exists public.search_documents (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  entity_type       text not null,
  entity_id         text not null,              -- text: supports non-uuid subjects (external_listing…)
  title             text not null,
  subtitle          text,
  normalized_text   text not null default '',   -- fuzzy/full-text haystack (safe fields only)
  keywords          text[] not null default '{}',
  route             text not null,              -- real in-app route to open the entity
  owner_user_id     uuid references public.users(id) on delete set null,
  visibility        text not null default 'internal',
  metadata          jsonb not null default '{}'::jsonb,
  source_updated_at timestamptz,                -- when the source entity last changed
  indexed_at        timestamptz not null default now(),
  deleted_at        timestamptz,                -- soft-delete (archive/remove) — hidden from search
  event_id          uuid,                       -- last domain event that (re)indexed it
  constraint search_documents_uniq unique (organization_id, entity_type, entity_id),
  constraint search_documents_visibility_chk check (visibility in ('internal','private','shared','public'))
);

-- Lookup + filter indexes.
create index if not exists search_documents_org_idx        on public.search_documents (organization_id);
create index if not exists search_documents_org_type_idx   on public.search_documents (organization_id, entity_type);
create index if not exists search_documents_entity_idx     on public.search_documents (entity_type, entity_id);
create index if not exists search_documents_owner_idx      on public.search_documents (organization_id, owner_user_id);
create index if not exists search_documents_updated_idx    on public.search_documents (organization_id, source_updated_at desc);
-- Fuzzy (Hebrew-friendly) + full-text over the safe haystack. Only live rows.
create index if not exists search_documents_trgm_idx
  on public.search_documents using gin (normalized_text gin_trgm_ops);
create index if not exists search_documents_fts_idx
  on public.search_documents using gin (to_tsvector('simple', normalized_text));

alter table public.search_documents enable row level security;

drop policy if exists "search_documents_select" on public.search_documents;
create policy "search_documents_select" on public.search_documents for select to authenticated
  using (organization_id = public.current_org_id());
-- Writes are service-role only (kernel search subscriber + backfill).

grant select on public.search_documents to authenticated;
grant all privileges on public.search_documents to service_role;


-- ####################################################################
-- ## 20260924120000_graph_edge_lifecycle.sql
-- ####################################################################
-- ============================================================================
-- ZONO OS 2.0 — STAGE 4 · BATCH 4.3 · Incremental Knowledge Graph lifecycle
-- ----------------------------------------------------------------------------
-- CANONICAL DECISION: public.entity_relationships is the ONE live relationship
-- substrate. The graph_* tables remain analytics/query PROJECTIONS and the
-- universal-graph / relationship-graph libraries remain READERS/BUILDERS. We do
-- NOT create another graph table family.
--
-- The Event Kernel graph subscriber keeps this table fresh incrementally
-- (create / update / retire) instead of relying on 24h rebuilds. Stable edge
-- identity is the EXISTING unique key
--   (org_id, source_entity_type, source_entity_id,
--    target_entity_type, target_entity_id, relationship_type)
-- so repeated event processing upserts the same edge — never a duplicate.
--
-- This migration only ADDS lifecycle columns (additive, safe, idempotent):
--   • last_seen_at    — refreshed on every incremental touch (drift detection)
--   • valid_from      — when the relationship became active
--   • valid_to        — set when an edge is retired (history preserved, not deleted)
--   • source_event_id — provenance: the domain event that last wrote the edge
-- Existing readers are unaffected (all new columns are nullable/defaulted).
-- ============================================================================

alter table public.entity_relationships
  add column if not exists last_seen_at    timestamptz not null default now(),
  add column if not exists valid_from      timestamptz not null default now(),
  add column if not exists valid_to        timestamptz,
  add column if not exists source_event_id uuid;

-- Fast "active edges for entity" reads + reconciliation scans.
create index if not exists entity_relationships_active_idx
  on public.entity_relationships (org_id, status, last_seen_at desc);
create index if not exists entity_relationships_source_event_idx
  on public.entity_relationships (source_event_id) where source_event_id is not null;


-- ####################################################################
-- ## 20260925120000_canonical_ai_memory.sql
-- ####################################################################
-- ============================================================================
-- ZONO OS 2.0 — STAGE 4 · BATCH 4.4 · Canonical AI Memory
-- ----------------------------------------------------------------------------
-- CANONICAL DECISION: public.ai_memory is THE single canonical durable memory
-- store. We EXTEND it (additive) with the Stage-4 scopes / lifecycle / provenance
-- fields rather than creating a competing table. The other memory concepts are
-- demoted to compatibility / backfill inputs or current-state projections:
--   • zono_org_memory / zono_org_memory_events → legacy/compat + backfill source
--   • intelligence profiles                    → current-state projections (not memory)
--   • domain_events                            → evidence/provenance (not memory)
--   • Ask ZONO state                           → conversation store (scope=conversation)
--
-- Every canonical memory carries: scope, entity refs, a concise fact + a
-- normalized fact + a stable identity key, provenance (explicit|derived|inferred),
-- sensitivity, confidence, validity window, supersession chain, and the source
-- domain event. Idempotency + "one active per identity" are enforced by a partial
-- unique index on (organization_id, identity_key) WHERE active. Existing rows are
-- untouched (all new columns nullable/defaulted; legacy rows have identity_key NULL
-- so they're exempt from the new unique index). RLS is NOT changed here — the
-- existing ai_memory policies (visibility private|office|organization|system +
-- user_id) remain the privacy gate.
-- ============================================================================

alter table public.ai_memory
  add column if not exists scope_type          text not null default 'organization', -- organization | user | entity | conversation
  add column if not exists entity_type         text,
  add column if not exists entity_id           text,
  add column if not exists conversation_id     uuid,
  add column if not exists fact                text,
  add column if not exists normalized_fact     text,
  add column if not exists normalized_fact_key text,        -- the dimension (e.g. "budget") — stable across values
  add column if not exists identity_key        text,        -- deterministic identity for idempotency + supersession
  add column if not exists source_event_id     uuid,
  add column if not exists source_entity_refs  jsonb not null default '[]'::jsonb,
  add column if not exists sensitivity         text not null default 'internal',      -- normal | internal | confidential | restricted
  add column if not exists explicit_or_inferred text not null default 'inferred',     -- explicit | derived | inferred
  add column if not exists valid_from          timestamptz not null default now(),
  add column if not exists valid_to            timestamptz,
  add column if not exists last_confirmed_at   timestamptz,
  add column if not exists superseded_by       uuid,
  add column if not exists active              boolean not null default true;

-- Constrain the controlled vocabularies (idempotent).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_memory_scope_chk') then
    alter table public.ai_memory add constraint ai_memory_scope_chk
      check (scope_type in ('organization','user','entity','conversation'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_memory_provenance_chk') then
    alter table public.ai_memory add constraint ai_memory_provenance_chk
      check (explicit_or_inferred in ('explicit','derived','inferred'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_memory_sensitivity_chk') then
    alter table public.ai_memory add constraint ai_memory_sensitivity_chk
      check (sensitivity in ('normal','internal','confidential','restricted'));
  end if;
end $$;

-- Backfill `active` from the existing status enum for legacy rows.
update public.ai_memory set active = (status = 'active') where identity_key is null;

-- ONE active memory per stable identity → idempotent ingestion + clean supersession.
create unique index if not exists ai_memory_identity_active_uniq
  on public.ai_memory (organization_id, identity_key)
  where active and identity_key is not null;

-- Read paths: entity memory, scope, provenance, source event.
create index if not exists ai_memory_entity_idx
  on public.ai_memory (organization_id, entity_type, entity_id) where active;
create index if not exists ai_memory_scope_idx
  on public.ai_memory (organization_id, scope_type) where active;
create index if not exists ai_memory_source_event_idx
  on public.ai_memory (source_event_id) where source_event_id is not null;


-- ####################################################################
-- ## 20260926120000_ai_memory_private_gate_fix.sql
-- ####################################################################
-- ============================================================================
-- ZONO OS 2.0 — STABILIZATION · Fix ai_memory broker-private RLS leak.
-- ----------------------------------------------------------------------------
-- PROBLEM: the QA.1 coverage pack (20260907120000_qa1_rls_coverage.sql) added a
-- permissive SELECT policy `ai_memory_qa1_read` gated ONLY by
--   organization_id = current_org_id()
-- Postgres OR-combines permissive policies, so this OVERRODE the private gate in
-- `ai_memory_select` (20260807120000_ai_memory.sql), letting any org member read
-- any other broker's visibility='private' / scope_type='user' memory.
--
-- FIX: re-scope `ai_memory_qa1_read` to the SAME predicate as `ai_memory_select`
-- so OR-combining is safe (both gated identically). Private memory is visible
-- ONLY to its owner; office/organization/system memory is org-wide; managers get
-- no extra READ access to others' private rows (matches the base SELECT policy —
-- manager elevation exists only on UPDATE/DELETE, unchanged here).
--
-- Strictly additive + idempotent + re-runnable. No data change. Non-breaking:
-- it can only REDUCE over-broad read access back to the intended boundary.
-- Rollback: `drop policy if exists "ai_memory_qa1_read" on public.ai_memory;`
-- (leaving `ai_memory_select` as the sole, correct gate).
-- ============================================================================

alter table public.ai_memory enable row level security;

drop policy if exists "ai_memory_qa1_read" on public.ai_memory;

create policy "ai_memory_qa1_read" on public.ai_memory
  for select to authenticated
  using (
    organization_id = public.current_org_id()
    and public.has_min_role('agent')
    and (visibility in ('office', 'organization', 'system') or user_id = auth.uid())
  );

-- Sanity note (not executed): after this migration the EFFECTIVE SELECT condition
-- is (ai_memory_select OR ai_memory_qa1_read) = the same private/owner gate, so a
-- broker can never read another broker's private/user-scoped memory in the org.

