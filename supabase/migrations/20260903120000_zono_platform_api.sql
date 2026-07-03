-- ============================================================================
-- ZONO — Platform API™ & Integration Hub (Phase 31.0). STRICTLY ADDITIVE.
-- ----------------------------------------------------------------------------
-- API keys (personal/org) with scopes + rate limits, an audit log, and webhook
-- subscriptions. Secrets are stored HASHED (sha256); the plaintext is shown once.
-- The API exposes existing engines read-only + approval-gated actions — nothing
-- auto-executes. No changes to existing tables / protected-engine schema.
-- ============================================================================

create table if not exists public.zono_api_keys (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid,
  name               text not null,
  key_type           text not null default 'organization',   -- personal | organization
  public_id          text not null unique,                   -- shown; used for lookup
  secret_hash        text not null,                          -- sha256(secret)
  scopes             jsonb not null default '[]'::jsonb,
  rate_limit_per_min integer not null default 120,
  last_used_at       timestamptz,
  created_at         timestamptz not null default now(),
  revoked_at         timestamptz,
  created_by         uuid
);
create index if not exists zak_org_idx on public.zono_api_keys (organization_id);
create index if not exists zak_pub_idx on public.zono_api_keys (public_id);

create table if not exists public.zono_api_audit (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid,
  key_id           uuid,
  key_name         text,
  method           text not null,
  path             text not null,
  scope            text,
  status           integer not null,
  ip               text,
  at               timestamptz not null default now()
);
create index if not exists zaa_key_at_idx on public.zono_api_audit (key_id, at desc);
create index if not exists zaa_org_at_idx on public.zono_api_audit (organization_id, at desc);

create table if not exists public.zono_webhooks (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid,
  url               text not null,
  events            jsonb not null default '[]'::jsonb,
  secret_hash       text,                                    -- sha256(signing secret)
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  last_delivery_at  timestamptz,
  last_status       integer,
  created_by        uuid
);
create index if not exists zwh_org_idx on public.zono_webhooks (organization_id, active);

alter table public.zono_api_keys  enable row level security;
alter table public.zono_api_audit enable row level security;
alter table public.zono_webhooks  enable row level security;

-- Org members read their org's keys/audit/webhooks (never the secret_hash in UI).
-- All writes + secret lookups go through the service-role layer (bypasses RLS).
drop policy if exists zak_select on public.zono_api_keys;
create policy zak_select on public.zono_api_keys for select to authenticated
  using (public.is_zono_owner() or organization_id = public.current_org_id());
drop policy if exists zaa_select on public.zono_api_audit;
create policy zaa_select on public.zono_api_audit for select to authenticated
  using (public.is_zono_owner() or organization_id = public.current_org_id());
drop policy if exists zwh_select on public.zono_webhooks;
create policy zwh_select on public.zono_webhooks for select to authenticated
  using (public.is_zono_owner() or organization_id = public.current_org_id());

grant select on public.zono_api_keys  to authenticated;
grant select on public.zono_api_audit to authenticated;
grant select on public.zono_webhooks  to authenticated;
grant all    on public.zono_api_keys  to service_role;
grant all    on public.zono_api_audit to service_role;
grant all    on public.zono_webhooks  to service_role;
