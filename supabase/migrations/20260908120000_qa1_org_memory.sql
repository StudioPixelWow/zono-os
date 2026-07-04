-- ============================================================================
-- ZONO — PHASE 34.2 · QA.1 DURABLE ORGANIZATIONAL MEMORY. ADDITIVE + IDEMPOTENT.
-- ----------------------------------------------------------------------------
-- Closes the QA.1 "Organizational Memory has no store" finding. The existing
-- Org-Memory engine derives on read from mission history; these tables give it a
-- DURABLE substrate so learning/patterns persist and can be trended. The engine
-- keeps derive-on-read as a FALLBACK; the store becomes the primary source.
-- Writes run under service_role (BYPASSRLS); authenticated gets org-scoped READ.
-- ============================================================================

-- ── Durable memory records ──────────────────────────────────────────────────
create table if not exists public.zono_org_memory (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  entity_type   text,                         -- buyer|seller|lead|property|office|org|...
  entity_id     text,
  memory_type   text not null,                -- fact|pattern|preference|outcome|lesson
  title         text not null,
  summary       text,
  evidence      jsonb not null default '[]'::jsonb,
  confidence    numeric,                       -- 0..1
  impact        text,                          -- low|medium|high
  source_module text,
  occurred_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists zom_org_idx     on public.zono_org_memory (org_id);
create index if not exists zom_entity_idx  on public.zono_org_memory (org_id, entity_type, entity_id);
create index if not exists zom_type_idx    on public.zono_org_memory (org_id, memory_type);
create index if not exists zom_occurred_idx on public.zono_org_memory (org_id, occurred_at desc);

-- ── Append-only event stream feeding memory ─────────────────────────────────
create table if not exists public.zono_org_memory_events (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  entity_type   text,
  entity_id     text,
  event_type    text not null,                 -- mission_completed|price_changed|deal_won|...
  title         text not null,
  summary       text,
  evidence      jsonb not null default '[]'::jsonb,
  impact        text,
  source_module text,
  occurred_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists zome_org_idx      on public.zono_org_memory_events (org_id);
create index if not exists zome_entity_idx   on public.zono_org_memory_events (org_id, entity_type, entity_id);
create index if not exists zome_type_idx     on public.zono_org_memory_events (org_id, event_type);
create index if not exists zome_occurred_idx on public.zono_org_memory_events (org_id, occurred_at desc);

-- ── Learned patterns (aggregated lessons) ───────────────────────────────────
create table if not exists public.zono_org_learning_patterns (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  entity_type   text,
  memory_type   text not null default 'pattern',
  title         text not null,
  summary       text,
  evidence      jsonb not null default '[]'::jsonb,
  confidence    numeric,
  impact        text,
  occurrences   integer not null default 1,
  source_module text,
  first_seen_at timestamptz,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists zolp_org_idx    on public.zono_org_learning_patterns (org_id);
create index if not exists zolp_entity_idx on public.zono_org_learning_patterns (org_id, entity_type);
create index if not exists zolp_conf_idx   on public.zono_org_learning_patterns (org_id, confidence desc);

alter table public.zono_org_memory            enable row level security;
alter table public.zono_org_memory_events     enable row level security;
alter table public.zono_org_learning_patterns enable row level security;

drop policy if exists zom_select on public.zono_org_memory;
create policy zom_select on public.zono_org_memory for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists zome_select on public.zono_org_memory_events;
create policy zome_select on public.zono_org_memory_events for select to authenticated
  using (org_id = public.current_org_id());

drop policy if exists zolp_select on public.zono_org_learning_patterns;
create policy zolp_select on public.zono_org_learning_patterns for select to authenticated
  using (org_id = public.current_org_id());
