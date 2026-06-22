-- ============================================================================
-- ZONO — Copy Generation Engine (Phase 6)
-- ----------------------------------------------------------------------------
-- Approved creative asset → all marketing COPY (headlines, body, CTA, story,
-- carousel slides, WhatsApp, scripts). NO designs / visuals / image providers.
-- org_id + RLS. metadata holds review sub-scores + provider.
-- ============================================================================
create table public.zono_copy_assets (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  creative_asset_id    uuid references public.zono_creative_assets(id) on delete cascade,
  campaign_id          uuid references public.zono_campaigns(id) on delete set null,
  entity_type          text not null,
  entity_id            uuid not null,
  copy_type            text not null,
  title                text,
  headline             text,
  subheadline          text,
  body                 text,
  cta                  text,
  platform             text,
  language             text not null default 'he',
  tone                 text,
  audience             text,
  reasoning            text,
  status               text not null default 'generated',
  confidence_score     integer not null default 0 check (confidence_score between 0 and 100),
  metadata             jsonb not null default '{}'::jsonb,
  is_approved          boolean not null default false,
  is_favorite          boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index zono_copy_org_idx      on public.zono_copy_assets(org_id);
create index zono_copy_asset_idx    on public.zono_copy_assets(creative_asset_id);
create index zono_copy_entity_idx   on public.zono_copy_assets(entity_type, entity_id);
create index zono_copy_status_idx   on public.zono_copy_assets(status);

create trigger trg_zono_copy_updated before update on public.zono_copy_assets for each row execute function public.set_updated_at();

alter table public.zono_copy_assets enable row level security;
create policy "zono_copy_assets_select" on public.zono_copy_assets for select to authenticated using (org_id = public.current_org_id());
create policy "zono_copy_assets_insert" on public.zono_copy_assets for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));
create policy "zono_copy_assets_update" on public.zono_copy_assets for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent')) with check (org_id = public.current_org_id());
create policy "zono_copy_assets_delete" on public.zono_copy_assets for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent'));

grant select, insert, update, delete on public.zono_copy_assets to authenticated;
grant all privileges on public.zono_copy_assets to service_role;
