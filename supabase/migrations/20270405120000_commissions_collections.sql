-- ============================================================================
-- ZONO — Commissions & Collections domain (Epic 3 · Part 12)
-- ----------------------------------------------------------------------------
-- The commercial truth of a brokerage transaction: a commission per deal (side,
-- gross, VAT, net, and per-party shares — office/agent/manager/cooperating
-- broker/referral + adjustments), an approval gate (manager), and collections
-- against it (amount due/collected, due/collection dates, payment status,
-- invoice/receipt refs). Reversals are NON-DESTRUCTIVE — recorded as new rows in
-- collection_events (append-only). Not accounting software; the brokerage's
-- commercial record. Conventions: org_id; set_updated_at; RLS select=org,
-- write=org+agent, approve/delete=org+manager; collection_events insert-only.
-- ============================================================================

-- ── 1. commissions ───────────────────────────────────────────────────────────
create table if not exists public.commissions (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references public.organizations(id) on delete cascade,
  owner_id                  uuid references public.users(id) on delete set null,
  deal_id                   uuid not null references public.deals(id) on delete cascade,
  side                      text not null default 'sell' check (side in ('buy','sell','both')),
  gross_amount              integer not null default 0 check (gross_amount >= 0),
  vat_pct                   numeric(5,2) not null default 18,
  vat_amount                integer not null default 0 check (vat_amount >= 0),
  net_amount                integer not null default 0 check (net_amount >= 0),
  office_share              integer not null default 0 check (office_share >= 0),
  agent_share               integer not null default 0 check (agent_share >= 0),
  manager_share             integer not null default 0 check (manager_share >= 0),
  cooperating_broker_share  integer not null default 0 check (cooperating_broker_share >= 0),
  referral_share            integer not null default 0 check (referral_share >= 0),
  adjustments               integer not null default 0,
  status                    text not null default 'draft' check (status in ('draft','pending_approval','approved','cancelled')),
  approved_by               uuid references public.users(id) on delete set null,
  approved_at               timestamptz,
  notes                     text,
  created_by                uuid references public.users(id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index if not exists idx_commissions_org    on public.commissions (org_id);
create index if not exists idx_commissions_deal   on public.commissions (deal_id);
create index if not exists idx_commissions_status on public.commissions (org_id, status);

create trigger trg_commissions_updated_at
  before update on public.commissions
  for each row execute function public.set_updated_at();

-- ── 2. collections ───────────────────────────────────────────────────────────
create table if not exists public.collections (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  commission_id    uuid not null references public.commissions(id) on delete cascade,
  amount_due       integer not null default 0 check (amount_due >= 0),
  amount_collected integer not null default 0 check (amount_collected >= 0),
  due_date         date,
  collection_date  date,
  payment_status   text not null default 'pending' check (payment_status in ('pending','partial','paid','overdue')),
  invoice_ref      text,
  receipt_ref      text,
  notes            text,
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_collections_org        on public.collections (org_id);
create index if not exists idx_collections_commission on public.collections (commission_id);
create index if not exists idx_collections_status     on public.collections (org_id, payment_status);

create trigger trg_collections_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

-- ── 3. collection_events (append-only; reversals are new rows, not deletes) ───
create table if not exists public.collection_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations(id) on delete cascade,
  collection_id uuid not null references public.collections(id) on delete cascade,
  actor_id      uuid references public.users(id) on delete set null,
  event_type    text not null check (event_type in ('recorded','partial','reversed','marked_paid','marked_overdue','created')),
  amount        integer not null default 0,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_collection_events_col on public.collection_events (org_id, collection_id, created_at asc);

-- ── 4. RLS ───────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['commissions','collections'] loop
    execute format('alter table public.%I enable row level security;', t);
    if not exists (select 1 from pg_policies where schemaname='public' and policyname = t||'_select') then
      execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (org_id = public.current_org_id());$f$, t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and policyname = t||'_insert') then
      execute format($f$create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));$f$, t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and policyname = t||'_update') then
      execute format($f$create policy "%1$s_update" on public.%1$I for update to authenticated using (org_id = public.current_org_id() and public.has_min_role('agent')) with check (org_id = public.current_org_id());$f$, t);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and policyname = t||'_delete') then
      execute format($f$create policy "%1$s_delete" on public.%1$I for delete to authenticated using (org_id = public.current_org_id() and public.has_min_role('manager'));$f$, t);
    end if;
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
  end loop;

  execute 'alter table public.collection_events enable row level security';
  if not exists (select 1 from pg_policies where schemaname='public' and policyname='collection_events_select') then
    create policy collection_events_select on public.collection_events for select to authenticated using (org_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and policyname='collection_events_insert') then
    create policy collection_events_insert on public.collection_events for insert to authenticated with check (org_id = public.current_org_id() and public.has_min_role('agent'));
  end if;
  grant select, insert on public.collection_events to authenticated;
exception when insufficient_privilege or undefined_table then
  raise notice 'Skipped commissions/collections RLS (insufficient privilege).';
end $$;
