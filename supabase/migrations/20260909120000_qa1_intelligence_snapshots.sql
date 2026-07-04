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
  using (public.is_zono_owner() or org_id = public.current_org_id());
