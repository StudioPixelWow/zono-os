-- ============================================================================
-- ZONO — Creative Asset Generator (Phase 5)
-- ----------------------------------------------------------------------------
-- Approved Campaign → structured marketing ASSETS (plans, not final designs).
-- NO final images / Gemini visuals / editable designs here. org_id + RLS.
-- generation_metadata holds sub-scores + provider. Design objects arrive in
-- Phase 6 (Design Generation Engine).
-- ============================================================================
create table public.zono_creative_assets (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  campaign_id          uuid not null references public.zono_campaigns(id) on delete cascade,
  campaign_asset_id    uuid references public.zono_campaign_assets(id) on delete set null,
  asset_type           text not null,
  title                text not null,
  objective            text,
  audience             text,
  marketing_angle      text,
  emotional_trigger    text,
  visual_hook          text,
  copy_hook            text,
  cta_style            text,
  recommended_layout   text,
  priority             integer not null default 1,
  reasoning            text,
  campaign_match_score      integer not null default 0 check (campaign_match_score between 0 and 100),
  audience_match_score      integer not null default 0 check (audience_match_score between 0 and 100),
  conversion_potential_score integer not null default 0 check (conversion_potential_score between 0 and 100),
  marketing_strength_score  integer not null default 0 check (marketing_strength_score between 0 and 100),
  asset_score          integer not null default 0 check (asset_score between 0 and 100),
  asset_status         text not null default 'draft',
  is_favorite          boolean not null default false,
  is_approved          boolean not null default false,
  generation_metadata  jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index zono_creative_assets_org_idx      on public.zono_creative_assets(org_id);
create index zono_creative_assets_campaign_idx on public.zono_creative_assets(campaign_id);
create index zono_creative_assets_status_idx   on public.zono_creative_assets(asset_status);

create trigger trg_zono_creative_assets_updated before update on public.zono_creative_assets for each row execute function public.set_updated_at();

alter table public.zono_creative_assets enable row level security;
create policy "zono_creative_assets_select" on public.zono_creative_assets for select to authenticated using (org_id = public.current_org_id());
create policy "zono_creative_assets_insert" on public.zono_creative_assets for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));
create policy "zono_creative_assets_update" on public.zono_creative_assets for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent')) with check (org_id = public.current_org_id());
create policy "zono_creative_assets_delete" on public.zono_creative_assets for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent'));

grant select, insert, update, delete on public.zono_creative_assets to authenticated;
grant all privileges on public.zono_creative_assets to service_role;
