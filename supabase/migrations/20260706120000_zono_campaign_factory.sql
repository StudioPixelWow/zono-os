-- ============================================================================
-- ZONO — Property Campaign Factory (Phase 4)
-- ----------------------------------------------------------------------------
-- The marketing PLANNING brain: Entity → DNA → Concepts → Campaign structure.
-- A property/project generates a COMPLETE campaign (multiple planned assets),
-- not a single ad. NO final designs / visuals / image prompts here — planning
-- only. org_id + org-scoped RLS. generation_metadata holds the Campaign DNA.
-- ============================================================================

create table public.zono_campaigns (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  entity_type             text not null,
  entity_id               uuid not null,
  title                    text not null,
  campaign_type            text not null,
  objective                text,
  target_audience          text,
  marketing_angle          text,
  campaign_summary         text,
  reasoning                text,
  status                   text not null default 'draft',
  marketing_dna_profile_id uuid references public.zono_marketing_dna_profiles(id) on delete set null,
  source_concept_id        uuid references public.zono_creative_concepts(id) on delete set null,
  generation_metadata      jsonb not null default '{}'::jsonb,
  created_by               uuid references public.users(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index zono_campaigns_org_idx    on public.zono_campaigns(org_id);
create index zono_campaigns_entity_idx on public.zono_campaigns(entity_type, entity_id);
create index zono_campaigns_status_idx on public.zono_campaigns(status);

create table public.zono_campaign_assets (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  campaign_id          uuid not null references public.zono_campaigns(id) on delete cascade,
  asset_type           text not null,
  title                text,
  purpose              text,
  recommended_message  text,
  recommended_cta      text,
  audience_variant     text,
  priority             integer not null default 1,
  status               text not null default 'planned',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index zono_campaign_assets_org_idx      on public.zono_campaign_assets(org_id);
create index zono_campaign_assets_campaign_idx on public.zono_campaign_assets(campaign_id);

create trigger trg_zono_campaigns_updated before update on public.zono_campaigns for each row execute function public.set_updated_at();
create trigger trg_zono_campaign_assets_updated before update on public.zono_campaign_assets for each row execute function public.set_updated_at();

do $$
declare t text;
  tbls text[] := array['zono_campaigns','zono_campaign_assets'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (org_id = public.current_org_id() and public.has_min_role(''agent'')) with check (org_id = public.current_org_id());', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role(''agent''));', t);
  end loop;
end $$;

grant select, insert, update, delete on public.zono_campaigns, public.zono_campaign_assets to authenticated;
grant all privileges on public.zono_campaigns, public.zono_campaign_assets to service_role;
