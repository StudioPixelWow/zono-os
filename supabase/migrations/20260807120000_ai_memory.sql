-- ============================================================================
-- ZONO — AI Memory & Personal Context™ (Phase 27.7). Persistent, structured,
-- user-controlled AI memory. Strictly additive (one new table). Every memory
-- has a source, confidence, visibility, owner; can be edited/archived/deleted/
-- expired. Never stores secrets (enforced in the app layer). Org-scoped RLS.
-- ============================================================================

create table if not exists public.ai_memory (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  user_id          uuid,
  memory_type      text not null,   -- user_preference | broker_preference | office_preference | working_style | favorite_area | faq | pinned_intelligence | dismissed_insight | decision | rule | manual_note | context
  title            text not null,
  summary          text,
  memory_value     jsonb not null default '{}'::jsonb,
  source_type      text not null,   -- manual | reasoning_gateway | mission_planner | action_center | broker_coach | decision_brain | user_action
  source_id        text,
  confidence       numeric not null default 0,
  visibility       text not null default 'private',  -- private | office | organization | system
  status           text not null default 'active',   -- active | archived | expired | deleted
  expires_at       timestamptz,
  last_used_at     timestamptz,
  usage_count      integer not null default 0,
  pinned           boolean not null default false,
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists aim_org_status_idx on public.ai_memory (organization_id, status, pinned);
create index if not exists aim_org_user_idx   on public.ai_memory (organization_id, user_id);
create index if not exists aim_type_idx        on public.ai_memory (memory_type);
create index if not exists aim_expires_idx     on public.ai_memory (expires_at);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.ai_memory enable row level security;

-- Read: org members; private memories only by their owner.
drop policy if exists "ai_memory_select" on public.ai_memory;
create policy "ai_memory_select" on public.ai_memory for select to authenticated
  using (
    organization_id = public.current_org_id() and public.has_min_role('agent')
    and (visibility in ('office', 'organization', 'system') or user_id = auth.uid())
  );

-- Insert: an org user may create a memory they own.
drop policy if exists "ai_memory_insert" on public.ai_memory;
create policy "ai_memory_insert" on public.ai_memory for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_min_role('agent') and user_id = auth.uid());

-- Update/delete: the owner, or a manager (for office/org/system memories).
drop policy if exists "ai_memory_update" on public.ai_memory;
create policy "ai_memory_update" on public.ai_memory for update to authenticated
  using (organization_id = public.current_org_id() and (user_id = auth.uid() or public.has_min_role('manager')))
  with check (organization_id = public.current_org_id() and (user_id = auth.uid() or public.has_min_role('manager')));

drop policy if exists "ai_memory_delete" on public.ai_memory;
create policy "ai_memory_delete" on public.ai_memory for delete to authenticated
  using (organization_id = public.current_org_id() and (user_id = auth.uid() or public.has_min_role('manager')));

grant select, insert, update, delete on public.ai_memory to authenticated;
grant all on public.ai_memory to service_role;
