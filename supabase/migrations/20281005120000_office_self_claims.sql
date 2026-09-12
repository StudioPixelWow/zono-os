-- ============================================================================
-- ZONO — office_self_claims (ADDITIVE, NON-DESTRUCTIVE, idempotent).
--
-- Records a user's decision about which observed office is THEIR office ("my
-- office"). This is the durable, identity-first anchor the "My Office vs Market"
-- experience resolves against — and it captures NEGATIVE evidence too: a user can
-- reject a candidate ("this is not my office"), and the resolver will never
-- suggest it again. Nothing here overwrites the observed graph; a claim is an
-- overlay, not a mutation of brokerage_offices / memberships.
--
-- Conflicts are preserved, not silenced: (user_id, office_id) is unique so a
-- decision updates in place, but a confirmed office and a listing-agency signal
-- that disagree are surfaced by the resolver rather than one clobbering the other.
-- ============================================================================
create table if not exists public.office_self_claims (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  org_id       uuid,
  office_id    uuid not null,
  decision     text not null default 'confirmed' check (decision in ('confirmed','rejected')),
  confidence   text,
  evidence     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, office_id)
);

create index if not exists office_self_claims_user_idx on public.office_self_claims (user_id);
create index if not exists office_self_claims_office_idx on public.office_self_claims (office_id);
create index if not exists office_self_claims_decision_idx on public.office_self_claims (user_id, decision);

alter table public.office_self_claims enable row level security;

-- A user may read and manage only their OWN claims.
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='office_self_claims' and policyname='office_self_claims_own_select') then
    create policy office_self_claims_own_select on public.office_self_claims for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='office_self_claims' and policyname='office_self_claims_own_write') then
    create policy office_self_claims_own_write on public.office_self_claims for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
