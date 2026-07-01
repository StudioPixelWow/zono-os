-- ============================================================================
-- ZONO — Universal Mission Engine™ (Phase 27.5). STRICTLY ADDITIVE.
-- ----------------------------------------------------------------------------
-- Persists executable missions derived from AI decisions. ENTITY-AGNOSTIC:
-- entity_type/entity_id can reference ANY business entity (office, broker,
-- property, seller, buyer, lead, territory, valuation, campaign, …). Nothing
-- executes automatically — status gates every mission/task. Justified: an
-- execution system requires durable mission/task/history state that no existing
-- table models. No changes to valuation / discovery / decision-engine schema.
-- ============================================================================

create table if not exists public.zono_missions (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid,
  source_decision  text,
  entity_type      text not null,
  entity_id        text,
  entity_name      text,
  mission_type     text not null,
  priority         integer not null default 50,
  business_impact  text not null default 'medium',   -- high | medium | low
  confidence       integer not null default 50,
  reason           text,
  goal             text,
  expected_outcome text,
  status           text not null default 'WAITING_FOR_APPROVAL',
  owner            text,
  tasks            jsonb not null default '[]'::jsonb,
  history          jsonb not null default '[]'::jsonb,
  evidence         jsonb not null default '[]'::jsonb,
  metadata         jsonb not null default '{}'::jsonb,
  due_at           timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz,
  created_by       uuid
);
create index if not exists zm_entity_idx   on public.zono_missions (entity_type, entity_id);
create index if not exists zm_org_idx      on public.zono_missions (organization_id, status);
create index if not exists zm_status_idx   on public.zono_missions (status);
create index if not exists zm_updated_idx  on public.zono_missions (updated_at desc);

alter table public.zono_missions enable row level security;

-- Org members read their org's missions (zono owner sees all). All writes go
-- through the service-role layer (bypasses RLS).
drop policy if exists zm_select on public.zono_missions;
create policy zm_select on public.zono_missions for select to authenticated
  using (public.is_zono_owner() or organization_id = public.current_org_id());

grant select on public.zono_missions to authenticated;
grant all    on public.zono_missions to service_role;
