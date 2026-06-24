-- ============================================================================
-- ZONO — Distribution Phase 3 (additive columns to connect the UI to real data)
-- ----------------------------------------------------------------------------
-- The 9 distribution tables already exist (20260718120000_distribution_engine).
-- This migration ADDITIVELY adds the columns the Phase-3 spec references that
-- did not yet exist, plus their indexes. Existing columns are reused via the
-- repository layer (e.g. spec `url`→group_url, `area`→locality, `target_audience`
-- →audience, `campaign_goal`→objective). Idempotent: every change uses
-- IF NOT EXISTS so re-running is safe. RLS + updated_at triggers already exist
-- on these tables and automatically cover new columns.
-- ============================================================================

-- 3. distribution_campaign_groups — when the group was selected into the campaign.
alter table public.distribution_campaign_groups
  add column if not exists selected_at timestamptz not null default now();

-- 4. distribution_variations — link a variation to the post it produced + the
--    explicit hook line + a dedicated lead score (lead_score in the spec; the
--    table already had prediction_score, which the repo maps to lead_score too).
alter table public.distribution_variations
  add column if not exists post_id    uuid references public.distribution_posts(id) on delete set null,
  add column if not exists hook       text,
  add column if not exists lead_score integer not null default 0 check (lead_score between 0 and 100);
create index if not exists distribution_variations_post_idx on public.distribution_variations(post_id);

-- 6. distribution_comments — external identity of the comment + author profile +
--    a numeric buyer-intent score.
alter table public.distribution_comments
  add column if not exists external_comment_id text,
  add column if not exists author_profile_url  text,
  add column if not exists lead_intent_score   integer not null default 0 check (lead_intent_score between 0 and 100);
create index if not exists distribution_comments_external_idx on public.distribution_comments(org_id, external_comment_id);

-- 8. distribution_analytics — per-post analytics + raw funnel counters + rate.
alter table public.distribution_analytics
  add column if not exists post_id         uuid references public.distribution_posts(id) on delete cascade,
  add column if not exists impressions     integer not null default 0,
  add column if not exists clicks          integer not null default 0,
  add column if not exists conversion_rate numeric(5,2) not null default 0;
create index if not exists distribution_analytics_post_idx on public.distribution_analytics(post_id);

-- 9. distribution_automations — tie an automation to a campaign + unified config +
--    the next scheduled run time.
alter table public.distribution_automations
  add column if not exists campaign_id  uuid references public.distribution_campaigns(id) on delete cascade,
  add column if not exists config_json  jsonb not null default '{}'::jsonb,
  add column if not exists next_run_at  timestamptz;
create index if not exists distribution_automations_campaign_idx on public.distribution_automations(campaign_id);
create index if not exists distribution_automations_next_run_idx on public.distribution_automations(org_id, next_run_at);
