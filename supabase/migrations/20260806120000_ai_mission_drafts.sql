-- ============================================================================
-- ZONO — AI Mission Planner™ (Phase 27.4). Reviewable mission DRAFTS only.
-- ----------------------------------------------------------------------------
-- Reasoning becomes planning; planning does NOT become execution without
-- approval. Drafts are evidence-backed, traceable, reviewable, editable, and
-- explicitly approved before any future conversion to a real task (next phase).
-- This table never executes anything — it stores draft proposals + their
-- evidence. Org-scoped RLS. Strictly additive (no changes to existing tables).
-- ============================================================================

create table if not exists public.ai_mission_drafts (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null,
  user_id             uuid,
  broker_id           uuid,
  source_type         text not null,   -- reasoning_gateway | broker_coach | growth_strategy | gap_analysis | action_center | alert | market_event | decision_brain | manual
  source_id           text,
  status              text not null default 'draft',   -- draft | ready_for_review | approved | rejected | converted | expired
  priority            text not null default 'medium',  -- urgent | high | medium | low
  category            text not null,   -- acquisition | pricing | follow_up | market_watch | seller_risk | buyer_match | competition | valuation | marketing | admin
  title               text not null,
  summary             text,
  recommended_action  text,
  expected_outcome    text,
  estimated_impact    numeric,
  confidence          numeric not null default 0,
  related_entity_type text,
  related_entity_id   text,
  evidence            jsonb not null default '[]'::jsonb,
  generated_from      jsonb not null default '[]'::jsonb,
  blocked_by          jsonb not null default '[]'::jsonb,
  metadata            jsonb not null default '{}'::jsonb,
  reviewed_at         timestamptz,
  reviewed_by         uuid,
  converted_task_id   uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists amd_org_status_idx   on public.ai_mission_drafts (organization_id, status, priority);
create index if not exists amd_org_created_idx   on public.ai_mission_drafts (organization_id, created_at desc);
create index if not exists amd_broker_idx        on public.ai_mission_drafts (broker_id);
create index if not exists amd_entity_idx        on public.ai_mission_drafts (related_entity_type, related_entity_id);

-- Dedupe: no two ACTIVE drafts for the same org + source + category + entity.
create unique index if not exists amd_dedupe_active_idx on public.ai_mission_drafts (
  organization_id, source_type, coalesce(source_id, ''), category, coalesce(related_entity_id, '')
) where status in ('draft', 'ready_for_review', 'approved');

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.ai_mission_drafts enable row level security;

-- Org members may read their org's drafts.
drop policy if exists "ai_mission_drafts_select" on public.ai_mission_drafts;
create policy "ai_mission_drafts_select" on public.ai_mission_drafts for select to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('agent'));

-- Authenticated org users (agent+) may create drafts (server actions only).
drop policy if exists "ai_mission_drafts_insert" on public.ai_mission_drafts;
create policy "ai_mission_drafts_insert" on public.ai_mission_drafts for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_min_role('agent'));

-- Approve/reject/edit: owner/admin/manager OR the assigned broker only.
drop policy if exists "ai_mission_drafts_update" on public.ai_mission_drafts;
create policy "ai_mission_drafts_update" on public.ai_mission_drafts for update to authenticated
  using (organization_id = public.current_org_id() and (public.has_min_role('manager') or broker_id = auth.uid()))
  with check (organization_id = public.current_org_id() and (public.has_min_role('manager') or broker_id = auth.uid()));

grant select, insert, update on public.ai_mission_drafts to authenticated;
grant all on public.ai_mission_drafts to service_role;
