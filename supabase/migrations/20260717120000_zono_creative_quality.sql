-- ============================================================================
-- ZONO Creative Quality Engine — candidates + quality reviews + output columns.
-- Generates many internal candidates, scores/critiques them, and surfaces only
-- the strongest. org_id-scoped with the standard ZONO RLS convention.
-- ============================================================================

create table if not exists public.zono_creative_candidates (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references public.organizations(id) on delete cascade,
  request_id                  uuid not null,
  entity_type                 text,
  entity_id                   uuid,
  candidate_family            text,
  generation_round            integer not null default 1,
  generated_image_url         text,
  final_composited_image_url  text,
  render_data                 jsonb not null default '{}'::jsonb,
  internal_prompt             text,
  creative_strategy           text,
  visual_hook                 text,
  property_primary_angle      text,
  quality_score               integer not null default 0,
  wow_score                   integer not null default 0,
  status                      text not null default 'candidate',
  is_selected                 boolean not null default false,
  is_rejected                 boolean not null default false,
  rejection_reason            text,
  quality_review_id           uuid,
  metadata                    jsonb not null default '{}'::jsonb,
  created_at                  timestamptz not null default now()
);
create index if not exists zono_cc_org_idx     on public.zono_creative_candidates(org_id);
create index if not exists zono_cc_request_idx on public.zono_creative_candidates(request_id);

create table if not exists public.zono_creative_quality_reviews (
  id                            uuid primary key default gen_random_uuid(),
  org_id                        uuid not null references public.organizations(id) on delete cascade,
  request_id                    uuid,
  output_id                     uuid,
  candidate_id                  text,
  entity_type                   text,
  entity_id                     uuid,
  review_round                  integer not null default 1,
  premium_score                 integer not null default 0,
  modern_score                  integer not null default 0,
  clean_score                   integer not null default 0,
  scroll_stop_score             integer not null default 0,
  brand_match_score             integer not null default 0,
  real_estate_relevance_score   integer not null default 0,
  hebrew_readability_score      integer not null default 0,
  rtl_score                     integer not null default 0,
  composition_score             integer not null default 0,
  trust_score                   integer not null default 0,
  conversion_score              integer not null default 0,
  wow_score                     integer not null default 0,
  property_truth_score          integer not null default 100,
  agent_authenticity_score      integer not null default 100,
  logo_authenticity_score       integer not null default 100,
  overall_quality_score         integer not null default 0,
  is_approved_for_display       boolean not null default false,
  is_rejected                   boolean not null default false,
  critic_summary                text,
  critic_problems               jsonb not null default '[]'::jsonb,
  improvement_instructions      jsonb not null default '[]'::jsonb,
  reject_reason                 text,
  approval_reason               text,
  created_at                    timestamptz not null default now()
);
create index if not exists zono_cqr_org_idx     on public.zono_creative_quality_reviews(org_id);
create index if not exists zono_cqr_request_idx on public.zono_creative_quality_reviews(request_id);

-- Quality columns on the two creative-output tables (idempotent).
alter table public.zono_quick_creative_outputs
  add column if not exists quality_status              text default 'pending',
  add column if not exists overall_quality_score       integer default 0,
  add column if not exists wow_score                   integer default 0,
  add column if not exists critic_summary              text,
  add column if not exists quality_review_id           uuid,
  add column if not exists generation_round            integer default 1,
  add column if not exists is_hidden_due_to_quality    boolean default false,
  add column if not exists used_inspiration_assets     jsonb default '[]'::jsonb,
  add column if not exists property_primary_angle      text,
  add column if not exists creative_selection_metadata jsonb default '{}'::jsonb;

alter table public.zono_creative_outputs
  add column if not exists quality_status              text default 'pending',
  add column if not exists overall_quality_score       integer default 0,
  add column if not exists wow_score                   integer default 0,
  add column if not exists critic_summary              text,
  add column if not exists quality_review_id           uuid,
  add column if not exists generation_round            integer default 1,
  add column if not exists is_hidden_due_to_quality    boolean default false,
  add column if not exists used_inspiration_assets     jsonb default '[]'::jsonb,
  add column if not exists property_primary_angle      text,
  add column if not exists creative_selection_metadata jsonb default '{}'::jsonb;

do $$
declare t text;
  tbls text[] := array['zono_creative_candidates','zono_creative_quality_reviews'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I;', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$I;', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$I;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (org_id = public.current_org_id() and public.has_min_role(''agent'')) with check (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role(''agent''));', t);
  end loop;
end $$;

grant select, insert, update, delete on public.zono_creative_candidates, public.zono_creative_quality_reviews to authenticated;
grant all privileges on public.zono_creative_candidates, public.zono_creative_quality_reviews to service_role;
