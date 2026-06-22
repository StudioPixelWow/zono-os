-- ============================================================================
-- ZONO — Creative Studio · Real Estate Creative Concept Engine (Phase 3)
-- ----------------------------------------------------------------------------
-- Strategic marketing brain: Entity → Marketing DNA → Creative Concepts.
-- NO ad/design/visual generation — concepts (strategy) only. org_id + RLS.
-- ============================================================================
create table public.zono_creative_concepts (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  entity_type             text not null,
  entity_id               uuid not null,
  marketing_dna_profile_id uuid references public.zono_marketing_dna_profiles(id) on delete set null,
  title                    text not null,
  concept_type             text not null,
  description              text,
  marketing_angle          text,
  emotional_trigger        text,
  visual_hook              text,
  copy_hook                text,
  recommended_layout       text,
  recommended_cta_style    text,
  recommended_audience     text,
  reasoning                text,
  confidence_score         integer not null default 0 check (confidence_score between 0 and 100),
  is_favorite              boolean not null default false,
  is_approved              boolean not null default false,
  status                   text not null default 'active',
  generation_metadata      jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index zono_concepts_org_idx     on public.zono_creative_concepts(org_id);
create index zono_concepts_entity_idx  on public.zono_creative_concepts(entity_type, entity_id);
create index zono_concepts_type_idx    on public.zono_creative_concepts(concept_type);
create index zono_concepts_status_idx  on public.zono_creative_concepts(status);

create trigger trg_zono_concepts_updated before update on public.zono_creative_concepts for each row execute function public.set_updated_at();

alter table public.zono_creative_concepts enable row level security;
create policy "zono_creative_concepts_select" on public.zono_creative_concepts for select to authenticated using (org_id = public.current_org_id());
create policy "zono_creative_concepts_insert" on public.zono_creative_concepts for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));
create policy "zono_creative_concepts_update" on public.zono_creative_concepts for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent')) with check (org_id = public.current_org_id());
create policy "zono_creative_concepts_delete" on public.zono_creative_concepts for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent'));

grant select, insert, update, delete on public.zono_creative_concepts to authenticated;
grant all privileges on public.zono_creative_concepts to service_role;
