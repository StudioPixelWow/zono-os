-- ============================================================================
-- ZONO — 0047 · Notification state (read / archived / pinned)
-- ----------------------------------------------------------------------------
-- The Notification Center aggregates live signals from every engine (Decision
-- Brain, forecast, revenue, transactions, competitors, marketing, social…) into
-- one feed. This table stores only per-user overlay state (read/archive/pin) on
-- those aggregated items — keyed by a stable item_key (source:id). User-owned.
-- Idempotent.
-- ============================================================================

create table if not exists public.notification_state (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  item_key         text not null,
  state            text not null default 'read',   -- read | archived | pinned
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint notification_state_uniq unique (user_id, item_key)
);

create index if not exists notification_state_user_idx on public.notification_state(user_id);

drop trigger if exists trg_notification_state_updated on public.notification_state;
create trigger trg_notification_state_updated before update on public.notification_state
  for each row execute function public.set_updated_at();

alter table public.notification_state enable row level security;

drop policy if exists "notification_state_select" on public.notification_state;
create policy "notification_state_select" on public.notification_state for select to authenticated using (user_id = auth.uid());
drop policy if exists "notification_state_insert" on public.notification_state;
create policy "notification_state_insert" on public.notification_state for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "notification_state_update" on public.notification_state;
create policy "notification_state_update" on public.notification_state for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notification_state_delete" on public.notification_state;
create policy "notification_state_delete" on public.notification_state for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.notification_state to authenticated;
grant all privileges on public.notification_state to service_role;
