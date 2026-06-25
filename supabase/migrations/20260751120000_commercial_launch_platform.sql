-- ============================================================================
-- ZONO — Phase 21: Commercial Launch Platform™ & Enterprise Readiness
--
-- Launch/operations scaffolding only. NO business logic, NO changes to existing
-- tables, NO new business capabilities. Six additive, org-scoped tables:
--
--   A. beta_enrollments        — beta mode per org / per user.
--   B. user_feedback           — built-in feedback (bug/suggestion/…).
--   C. onboarding_progress     — per-org onboarding checklist (8 steps).
--   D. usage_events            — product usage analytics (non-sensitive only).
--   E. org_plans               — plan/license + billing-prep columns.
--   F. support_impersonation_log — append-only read-only impersonation audit.
--
-- Conventions: current_org_id(), has_min_role(), set_updated_at(). Idempotent.
-- ============================================================================

-- A. beta_enrollments — null user_id = org-wide enrollment ---------------------
create table if not exists public.beta_enrollments (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid references public.users(id) on delete cascade,  -- null = whole org
  enabled     boolean not null default true,
  channel     text not null default 'beta',     -- beta / canary / internal
  note        text,
  updated_by  uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists be_org_user_uidx
  on public.beta_enrollments (org_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index if not exists be_org_idx on public.beta_enrollments(org_id);

drop trigger if exists trg_beta_enrollments_updated on public.beta_enrollments;
create trigger trg_beta_enrollments_updated before update on public.beta_enrollments
  for each row execute function public.set_updated_at();

-- B. user_feedback -------------------------------------------------------------
create table if not exists public.user_feedback (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  user_id        uuid references public.users(id) on delete set null,
  feedback_type  text not null default 'suggestion',   -- bug / suggestion / missing_feature / performance
  title          text,
  body           text not null default '',
  page           text,                                  -- current route
  severity       text,                                  -- low / medium / high (optional)
  status         text not null default 'open',          -- open / triaged / resolved / wont_fix
  -- Auto-captured context (non-sensitive): browser, app version, role, ids.
  context        jsonb not null default '{}'::jsonb,
  correlation_id text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists uf_org_idx    on public.user_feedback(org_id, created_at desc);
create index if not exists uf_type_idx   on public.user_feedback(org_id, feedback_type);
create index if not exists uf_status_idx on public.user_feedback(org_id, status);

drop trigger if exists trg_user_feedback_updated on public.user_feedback;
create trigger trg_user_feedback_updated before update on public.user_feedback
  for each row execute function public.set_updated_at();

-- C. onboarding_progress — one row per org; steps map step_key → ISO timestamp -
create table if not exists public.onboarding_progress (
  org_id        uuid primary key references public.organizations(id) on delete cascade,
  steps         jsonb not null default '{}'::jsonb,   -- { "org_created": "2026-...", ... }
  dismissed     boolean not null default false,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_onboarding_progress_updated on public.onboarding_progress;
create trigger trg_onboarding_progress_updated before update on public.onboarding_progress
  for each row execute function public.set_updated_at();

-- D. usage_events — lightweight product analytics (NEVER business content) -----
create table if not exists public.usage_events (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid references public.users(id) on delete set null,
  category    text not null,                 -- feature / screen / workflow / automation / ai / performance / error
  name        text not null,                 -- e.g. "property_radar.sync", "screen.view:/command"
  role_key    text,                          -- denormalized role (no PII)
  props       jsonb not null default '{}'::jsonb,  -- non-sensitive counters/labels only
  occurred_at timestamptz not null default now()
);
create index if not exists ue_org_time_idx on public.usage_events(org_id, occurred_at desc);
create index if not exists ue_cat_idx      on public.usage_events(org_id, category);
create index if not exists ue_name_idx     on public.usage_events(org_id, name);

-- E. org_plans — plan/license + billing prep (no payment flow yet) -------------
create table if not exists public.org_plans (
  org_id                  uuid primary key references public.organizations(id) on delete cascade,
  plan                    text not null default 'starter',  -- starter / professional / office / enterprise
  status                  text not null default 'active',   -- active / trialing / past_due / canceled
  trial_ends_at           timestamptz,
  limits                  jsonb not null default '{}'::jsonb,  -- soft usage limits per plan
  -- Billing prep only — populated later by Stripe integration; nullable now.
  stripe_customer_id      text,
  stripe_subscription_id  text,
  current_period_end      timestamptz,
  updated_by              uuid references public.users(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

drop trigger if exists trg_org_plans_updated on public.org_plans;
create trigger trg_org_plans_updated before update on public.org_plans
  for each row execute function public.set_updated_at();

-- F. support_impersonation_log — append-only audit of read-only impersonation --
create table if not exists public.support_impersonation_log (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  admin_user_id   uuid references public.users(id) on delete set null,
  target_user_id  uuid references public.users(id) on delete set null,
  reason          text,
  read_only       boolean not null default true,
  correlation_id  text,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz
);
create index if not exists sil_org_idx on public.support_impersonation_log(org_id, started_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
do $$
begin
  -- beta_enrollments: members read their org; admin+ writes.
  execute 'alter table public.beta_enrollments enable row level security';
  execute 'drop policy if exists "be_select" on public.beta_enrollments';
  execute 'create policy "be_select" on public.beta_enrollments for select to authenticated using (org_id = public.current_org_id())';
  execute 'drop policy if exists "be_write" on public.beta_enrollments';
  execute 'create policy "be_write" on public.beta_enrollments for all to authenticated using (org_id = public.current_org_id() and public.has_min_role(''admin'')) with check (org_id = public.current_org_id() and public.has_min_role(''admin''))';

  -- user_feedback: members may read their org''s feedback + insert their own;
  -- manager+ may update (triage). No deletes from the app.
  execute 'alter table public.user_feedback enable row level security';
  execute 'drop policy if exists "uf_select" on public.user_feedback';
  execute 'create policy "uf_select" on public.user_feedback for select to authenticated using (org_id = public.current_org_id())';
  execute 'drop policy if exists "uf_insert" on public.user_feedback';
  execute 'create policy "uf_insert" on public.user_feedback for insert to authenticated with check (org_id = public.current_org_id())';
  execute 'drop policy if exists "uf_update" on public.user_feedback';
  execute 'create policy "uf_update" on public.user_feedback for update to authenticated using (org_id = public.current_org_id() and public.has_min_role(''manager'')) with check (org_id = public.current_org_id() and public.has_min_role(''manager''))';

  -- onboarding_progress: members read; manager+ writes.
  execute 'alter table public.onboarding_progress enable row level security';
  execute 'drop policy if exists "op_select" on public.onboarding_progress';
  execute 'create policy "op_select" on public.onboarding_progress for select to authenticated using (org_id = public.current_org_id())';
  execute 'drop policy if exists "op_write" on public.onboarding_progress';
  execute 'create policy "op_write" on public.onboarding_progress for all to authenticated using (org_id = public.current_org_id() and public.has_min_role(''manager'')) with check (org_id = public.current_org_id() and public.has_min_role(''manager''))';

  -- usage_events: members may insert their own org events; admin+ may read.
  execute 'alter table public.usage_events enable row level security';
  execute 'drop policy if exists "ue_insert" on public.usage_events';
  execute 'create policy "ue_insert" on public.usage_events for insert to authenticated with check (org_id = public.current_org_id())';
  execute 'drop policy if exists "ue_select" on public.usage_events';
  execute 'create policy "ue_select" on public.usage_events for select to authenticated using (org_id = public.current_org_id() and public.has_min_role(''admin''))';

  -- org_plans: members read their plan; admin+ writes (server uses service role).
  execute 'alter table public.org_plans enable row level security';
  execute 'drop policy if exists "opl_select" on public.org_plans';
  execute 'create policy "opl_select" on public.org_plans for select to authenticated using (org_id = public.current_org_id())';
  execute 'drop policy if exists "opl_write" on public.org_plans';
  execute 'create policy "opl_write" on public.org_plans for all to authenticated using (org_id = public.current_org_id() and public.has_min_role(''admin'')) with check (org_id = public.current_org_id() and public.has_min_role(''admin''))';

  -- support_impersonation_log: admin+ read their org; append-only via service role.
  execute 'alter table public.support_impersonation_log enable row level security';
  execute 'drop policy if exists "sil_select" on public.support_impersonation_log';
  execute 'create policy "sil_select" on public.support_impersonation_log for select to authenticated using (org_id = public.current_org_id() and public.has_min_role(''admin''))';
end $$;

-- Grants
do $$
declare t text;
begin
  foreach t in array array['beta_enrollments','user_feedback','onboarding_progress','usage_events','org_plans','support_impersonation_log'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;
