-- ============================================================================
-- ZONO — PHASE 26.2: Agency Auto-Builder + Clean Office Identity™
-- ----------------------------------------------------------------------------
-- Additive columns that let the auto-builder turn messy raw text into a clean,
-- professional agency identity (brand/franchise, display name, confidence,
-- evidence, status). Idempotent. No UI, no scraping.
-- ============================================================================

alter table public.agencies
  add column if not exists brand_name         text,
  add column if not exists franchise_name     text,
  add column if not exists display_name       text,
  add column if not exists created_from       text,           -- 'auto_builder' | 'manual' | 'import'
  add column if not exists creation_confidence numeric,
  add column if not exists identity_status    text not null default 'auto_created',
  add column if not exists identity_metadata  jsonb not null default '{}'::jsonb;

-- Constrain identity_status to the known vocabulary (drop+add to stay idempotent).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'agencies_identity_status_chk') then
    alter table public.agencies
      add constraint agencies_identity_status_chk
      check (identity_status in ('verified','auto_created','needs_review','merged','ignored'));
  end if;
end $$;

create index if not exists agencies_org_brand_idx on public.agencies(organization_id, brand_name) where brand_name is not null;

-- Resolution-candidate suggestions produced by the auto-builder.
alter table public.agency_resolution_candidates
  add column if not exists suggested_name          text,
  add column if not exists suggested_display_name  text,
  add column if not exists suggested_brand_name    text,
  add column if not exists suggested_city          text,
  add column if not exists suggested_branch        text,
  add column if not exists suggested_aliases       jsonb not null default '[]'::jsonb;
