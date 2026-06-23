-- ============================================================================
-- ZONO — Creative Image Generation QA + Regeneration engine
-- ----------------------------------------------------------------------------
-- Tracks every AI ad generation, each attempt, and each QA report so the user
-- only ever sees an APPROVED image while all attempts are kept for debugging.
-- ============================================================================

create table if not exists public.creative_generations (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  property_id          uuid references public.properties(id) on delete set null,
  campaign_id          uuid,
  request_id           uuid,
  output_id            uuid,
  kind                 text not null default 'property',          -- property | sold | testimonial
  status               text not null default 'pending',           -- pending|generating|qa_running|regenerating|approved|failed|manual_review
  selected_template    text,
  brand_profile_id     uuid,
  source_manifest_json jsonb not null default '{}'::jsonb,
  final_image_url      text,
  approved_attempt_id  uuid,
  attempts_count       integer not null default 0,
  overall_score        integer not null default 0,
  created_by           uuid references public.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table if not exists public.creative_generation_attempts (
  id                        uuid primary key default gen_random_uuid(),
  generation_id             uuid not null references public.creative_generations(id) on delete cascade,
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  attempt_number            integer not null,
  prompt                    text,
  correction_prompt         text,
  image_url                 text,
  qa_status                 text,                                  -- passed | failed
  qa_report_json            jsonb not null default '{}'::jsonb,
  text_accuracy_score       integer not null default 0,
  numeric_accuracy_score    integer not null default 0,
  brand_score               integer not null default 0,
  layout_score              integer not null default 0,
  readability_score         integer not null default 0,
  asset_integrity_score     integer not null default 0,
  real_estate_relevance_score integer not null default 0,
  overall_score             integer not null default 0,
  fail_reasons              jsonb not null default '[]'::jsonb,
  created_at                timestamptz not null default now()
);

create table if not exists public.creative_qa_reports (
  id                     uuid primary key default gen_random_uuid(),
  generation_id          uuid not null references public.creative_generations(id) on delete cascade,
  attempt_id             uuid not null references public.creative_generation_attempts(id) on delete cascade,
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  ocr_text               text,
  expected_text_manifest jsonb not null default '{}'::jsonb,
  mismatches_json        jsonb not null default '[]'::jsonb,
  critical_failures_json jsonb not null default '[]'::jsonb,
  visual_findings_json   jsonb not null default '{}'::jsonb,
  score_json             jsonb not null default '{}'::jsonb,
  passed                 boolean not null default false,
  created_at             timestamptz not null default now()
);

create index if not exists creative_gen_org_idx       on public.creative_generations(org_id);
create index if not exists creative_gen_property_idx   on public.creative_generations(property_id);
create index if not exists creative_gen_status_idx     on public.creative_generations(status);
create index if not exists creative_gen_att_gen_idx    on public.creative_generation_attempts(generation_id);
create index if not exists creative_qa_gen_idx         on public.creative_qa_reports(generation_id);

create trigger trg_creative_gen_updated before update on public.creative_generations
  for each row execute function public.set_updated_at();

do $$
declare t text;
  tbls text[] := array['creative_generations','creative_generation_attempts','creative_qa_reports'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (org_id = public.current_org_id() and public.has_min_role(''agent'')) with check (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role(''manager''));', t);
  end loop;
end $$;

grant select, insert, update, delete on public.creative_generations, public.creative_generation_attempts, public.creative_qa_reports to authenticated;
grant all privileges on public.creative_generations, public.creative_generation_attempts, public.creative_qa_reports to service_role;
