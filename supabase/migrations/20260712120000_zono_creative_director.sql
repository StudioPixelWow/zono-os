-- ============================================================================
-- ZONO — Creative Director Prompt Engine (internal layer)
-- ----------------------------------------------------------------------------
-- Adds internal creative-direction fields + Creative-Director scoring to the
-- quick-creative + creative-output tables. Internal prompt is never shown to
-- normal users (admin/debug only). org_id/RLS unchanged (columns inherit).
-- ============================================================================
alter table public.zono_quick_creative_outputs
  add column if not exists internal_prompt            text,
  add column if not exists creative_strategy          text,
  add column if not exists visual_hook                text,
  add column if not exists scroll_stop_reason         text,
  add column if not exists creative_director_metadata jsonb not null default '{}'::jsonb,
  add column if not exists scroll_stop_score          integer not null default 0,
  add column if not exists creative_director_score    integer not null default 0,
  add column if not exists anti_ai_score              integer not null default 0,
  add column if not exists rtl_readability_score      integer not null default 0;

alter table public.zono_creative_outputs
  add column if not exists internal_prompt            text,
  add column if not exists creative_strategy          text,
  add column if not exists visual_hook                text,
  add column if not exists scroll_stop_reason         text,
  add column if not exists creative_director_metadata jsonb not null default '{}'::jsonb,
  add column if not exists scroll_stop_score          integer not null default 0,
  add column if not exists creative_director_score    integer not null default 0,
  add column if not exists anti_ai_score              integer not null default 0,
  add column if not exists rtl_readability_score      integer not null default 0;
