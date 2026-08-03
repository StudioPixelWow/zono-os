-- ============================================================================
-- ZONO Wave 1 — Unified person identity (ADDITIVE, NOT YET APPLIED).
-- Option C (progressive hybrid): create persons + person_roles ALONGSIDE the
-- existing leads/buyers/sellers. NOTHING is dropped, renamed, merged, or
-- rewritten. Existing rows keep working; reads/writes migrate domain-by-domain
-- behind a flag; legacy identity columns are deprecated only after validation.
-- Rollback: DROP the tables + the additive person_id columns (originals intact).
-- ============================================================================

create table if not exists public.persons (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  first_name        text,
  last_name         text,
  display_name      text,
  -- normalized identity keys (populated by the identity resolver; used for dedup)
  primary_phone_norm text,           -- last-9 Israeli key
  primary_email_norm text,           -- lowercased
  israeli_id        text,            -- ת"ז, optional
  language          text default 'he',
  source            text,
  campaign          text,
  assigned_agent_id uuid references public.users(id),
  consent_marketing boolean default false,
  consent_updated_at timestamptz,
  merge_status      text default 'active' check (merge_status in ('active','merged_into','under_review')),
  merged_into_id    uuid references public.persons(id),
  possible_duplicate boolean default false,
  archived_at       timestamptz,
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  metadata          jsonb default '{}'::jsonb
);

-- Multiple normalized phones/emails per person (one strong identity, many keys).
create table if not exists public.person_identifiers (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id       uuid not null references public.persons(id) on delete cascade,
  kind            text not null check (kind in ('phone','email','source_id')),
  value_norm      text not null,
  value_raw       text,
  created_at      timestamptz not null default now(),
  unique (organization_id, kind, value_norm)   -- dedup key, org-scoped
);

-- A person holds MANY roles WITHOUT duplicating identity. role_entity_id links
-- to the existing domain row (buyer/seller/lead/…) so history converges additively.
create table if not exists public.person_roles (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id       uuid not null references public.persons(id) on delete cascade,
  role            text not null check (role in
    ('lead','buyer','seller','landlord','tenant','property_owner','referral_partner',
     'lawyer','mortgage_pro','external_agent','supplier','team_member')),
  role_entity_table text,            -- e.g. 'buyers'
  role_entity_id    uuid,            -- e.g. buyers.id
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  unique (organization_id, person_id, role, role_entity_id)
);

-- Additive back-links on existing tables (nullable; backfilled during migration,
-- never required, so existing inserts keep working).
alter table public.leads   add column if not exists person_id uuid references public.persons(id);
alter table public.buyers  add column if not exists person_id uuid references public.persons(id);
alter table public.sellers add column if not exists person_id uuid references public.persons(id);

create index if not exists idx_persons_org on public.persons(organization_id);
create index if not exists idx_persons_phone on public.persons(organization_id, primary_phone_norm);
create index if not exists idx_persons_email on public.persons(organization_id, primary_email_norm);
create index if not exists idx_person_ident_lookup on public.person_identifiers(organization_id, kind, value_norm);
create index if not exists idx_person_roles_person on public.person_roles(organization_id, person_id);

-- RLS: org-scoped read; writes go through the org-scoped write boundary (service role).
alter table public.persons enable row level security;
alter table public.person_identifiers enable row level security;
alter table public.person_roles enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='persons' and policyname='persons_org_read') then
    create policy persons_org_read on public.persons for select using (organization_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where tablename='person_identifiers' and policyname='person_ident_org_read') then
    create policy person_ident_org_read on public.person_identifiers for select using (organization_id = public.current_org_id());
  end if;
  if not exists (select 1 from pg_policies where tablename='person_roles' and policyname='person_roles_org_read') then
    create policy person_roles_org_read on public.person_roles for select using (organization_id = public.current_org_id());
  end if;
end $$;

-- Reversible merge audit (merges never hard-delete; they set merge_status + link).
create table if not exists public.person_merge_log (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_person_id uuid not null,
  target_person_id uuid not null,
  merged_by       uuid references public.users(id),
  confidence      text,
  reasons         jsonb,
  reversible      boolean not null default true,
  created_at      timestamptz not null default now()
);
alter table public.person_merge_log enable row level security;
