-- ============================================================================
-- ZONO — Automation & Workflow OS (orchestration layer)
-- ----------------------------------------------------------------------------
-- Turns ZONO from "knows what should happen" into "prepares, tracks and
-- orchestrates what should happen". Every automation is HUMAN-SUPERVISED,
-- AUDITABLE, REVERSIBLE and PERMISSION-AWARE. No autonomous communication.
--
-- Lifecycle: trigger fires -> run created (status 'pending_review') with
-- prepared action instances -> a human approves -> actions applied (real
-- artifacts: task / opportunity / notification / activity / decision signal),
-- each recording its target for REVERSAL -> run can be reversed.
--
-- Tables:
--   automation_workflows       workflow definitions (name, type, enabled)
--   automation_triggers        trigger defs attached to a workflow
--   automation_conditions      condition defs attached to a workflow
--   automation_steps           ordered action steps (the definition)
--   automation_runs            one execution of a workflow
--   automation_run_logs        per-step audit log lines for a run
--   automation_actions         prepared action instances per run (reversible)
--   automation_templates       library of prebuilt workflows (8 defaults)
--   automation_recommendations Decision-Brain-fed "create this workflow" hints
--
-- Org column: organization_id. Idempotent. RLS: org-scoped select; workflow
-- definitions are manager-gated, runs/actions allow agent on own entities.
-- ============================================================================

-- ── workflows ───────────────────────────────────────────────────────────────
create table if not exists public.automation_workflows (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  created_by         uuid references public.users(id) on delete set null,
  name               text not null,
  description        text,
  category           text not null default 'lead',
  status             text not null default 'draft',
  is_enabled         boolean not null default false,
  trigger_type       text not null default 'manual',
  scope              text not null default 'org',
  owner_user_id      uuid references public.users(id) on delete set null,
  require_approval   boolean not null default true,
  run_count          integer not null default 0,
  last_run_at        timestamptz,
  opportunities_generated integer not null default 0,
  tasks_generated    integer not null default 0,
  template_key       text,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint automation_workflows_status_chk check (status in ('draft','active','paused','archived')),
  constraint automation_workflows_category_chk check (category in (
    'lead','buyer','seller','property','deal','portal','website','marketing',
    'distribution','recommendation','revenue','territory','recruitment')),
  constraint automation_workflows_scope_chk check (scope in ('org','agent'))
);

-- ── triggers ────────────────────────────────────────────────────────────────
create table if not exists public.automation_triggers (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  workflow_id        uuid not null references public.automation_workflows(id) on delete cascade,
  trigger_type       text not null,
  config             jsonb not null default '{}'::jsonb,
  is_enabled         boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── conditions ──────────────────────────────────────────────────────────────
create table if not exists public.automation_conditions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  workflow_id        uuid not null references public.automation_workflows(id) on delete cascade,
  condition_type     text not null,
  operator           text not null default 'gte',
  value_number       numeric,
  value_text         text,
  config             jsonb not null default '{}'::jsonb,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ── steps (action definitions) ───────────────────────────────────────────────
create table if not exists public.automation_steps (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  workflow_id        uuid not null references public.automation_workflows(id) on delete cascade,
  step_order         integer not null default 0,
  action_type        text not null,
  title              text,
  config             jsonb not null default '{}'::jsonb,
  is_enabled         boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint automation_steps_action_chk check (action_type in (
    'create_task','create_follow_up','create_recommendation','create_activity',
    'create_alert','assign_user','change_status','create_opportunity',
    'create_decision_signal','create_dashboard_card','create_notification','create_queue_item'))
);

-- ── runs ────────────────────────────────────────────────────────────────────
create table if not exists public.automation_runs (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  workflow_id        uuid not null references public.automation_workflows(id) on delete cascade,
  triggered_by       uuid references public.users(id) on delete set null,
  trigger_type       text not null default 'manual',
  entity_type        text,
  entity_id          uuid,
  entity_label       text,
  owner_user_id      uuid references public.users(id) on delete set null,
  status             text not null default 'pending_review',
  blocked_reason     text,
  error_message      text,
  actions_prepared   integer not null default 0,
  actions_applied    integer not null default 0,
  opportunities_generated integer not null default 0,
  reviewed_by        uuid references public.users(id) on delete set null,
  reviewed_at        timestamptz,
  applied_at         timestamptz,
  reversed_at        timestamptz,
  metadata           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint automation_runs_status_chk check (status in (
    'pending_review','approved','applied','failed','blocked','reversed','rejected'))
);

-- ── run logs (audit) ──────────────────────────────────────────────────────────
create table if not exists public.automation_run_logs (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  run_id             uuid not null references public.automation_runs(id) on delete cascade,
  workflow_id        uuid references public.automation_workflows(id) on delete set null,
  level              text not null default 'info',
  message            text not null,
  step_action_type   text,
  created_at         timestamptz not null default now(),
  constraint automation_run_logs_level_chk check (level in ('info','success','warning','error'))
);

-- ── actions (prepared instances, reversible) ─────────────────────────────────
create table if not exists public.automation_actions (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  run_id             uuid not null references public.automation_runs(id) on delete cascade,
  workflow_id        uuid references public.automation_workflows(id) on delete set null,
  action_type        text not null,
  title              text not null,
  description        text,
  entity_type        text,
  entity_id          uuid,
  payload            jsonb not null default '{}'::jsonb,
  status             text not null default 'prepared',
  applied_table      text,
  applied_id         uuid,
  applied_at         timestamptz,
  reversed_at        timestamptz,
  error_message      text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint automation_actions_status_chk check (status in ('prepared','applied','reversed','skipped','failed'))
);

-- ── templates (workflow library) ─────────────────────────────────────────────
create table if not exists public.automation_templates (
  id                 uuid primary key default gen_random_uuid(),
  template_key       text not null unique,
  name               text not null,
  description        text,
  category           text not null default 'lead',
  trigger_type       text not null,
  default_conditions jsonb not null default '[]'::jsonb,
  default_steps      jsonb not null default '[]'::jsonb,
  is_active          boolean not null default true,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now()
);

-- ── automation recommendations (Decision Brain -> "create this workflow") ────
create table if not exists public.automation_recommendations (
  id                 uuid primary key default gen_random_uuid(),
  organization_id    uuid not null references public.organizations(id) on delete cascade,
  template_key       text,
  title              text not null,
  reason             text,
  category           text not null default 'lead',
  impact_score       integer not null default 50,
  status             text not null default 'open',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint automation_recommendations_status_chk check (status in ('open','accepted','dismissed'))
);

-- ── indexes ──────────────────────────────────────────────────────────────────
create index if not exists automation_workflows_org_idx     on public.automation_workflows(organization_id);
create index if not exists automation_workflows_owner_idx    on public.automation_workflows(owner_user_id);
create index if not exists automation_workflows_cat_idx      on public.automation_workflows(organization_id, category);
create index if not exists automation_triggers_wf_idx        on public.automation_triggers(workflow_id);
create index if not exists automation_triggers_type_idx      on public.automation_triggers(organization_id, trigger_type);
create index if not exists automation_conditions_wf_idx      on public.automation_conditions(workflow_id);
create index if not exists automation_steps_wf_idx           on public.automation_steps(workflow_id);
create index if not exists automation_runs_org_idx           on public.automation_runs(organization_id);
create index if not exists automation_runs_wf_idx            on public.automation_runs(workflow_id);
create index if not exists automation_runs_status_idx        on public.automation_runs(organization_id, status);
create index if not exists automation_runs_owner_idx         on public.automation_runs(owner_user_id);
create index if not exists automation_run_logs_run_idx       on public.automation_run_logs(run_id);
create index if not exists automation_actions_run_idx        on public.automation_actions(run_id);
create index if not exists automation_actions_org_idx        on public.automation_actions(organization_id, status);
create index if not exists automation_recos_org_idx          on public.automation_recommendations(organization_id, status);

-- ── updated_at triggers ──────────────────────────────────────────────────────
do $$
declare t text;
  tbls text[] := array[
    'automation_workflows','automation_triggers','automation_conditions','automation_steps',
    'automation_runs','automation_actions','automation_recommendations'
  ];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I;', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Workflow DEFINITIONS (manager-gated writes; everyone in org can read).
do $$
declare t text;
  tbls text[] := array['automation_workflows','automation_triggers','automation_conditions','automation_steps'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I;', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''manager''));', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$I;', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager'')) with check (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$I;', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));', t);
  end loop;
end $$;

-- RUNS / LOGS / ACTIONS / RECOMMENDATIONS (agent may write on their own entities).
do $$
declare t text;
  tbls text[] := array['automation_runs','automation_run_logs','automation_actions','automation_recommendations'];
begin
  foreach t in array tbls loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists "%1$s_select" on public.%1$I;', t);
    execute format('create policy "%1$s_select" on public.%1$I for select to authenticated using (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_insert" on public.%1$I;', t);
    execute format('create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));', t);
    execute format('drop policy if exists "%1$s_update" on public.%1$I;', t);
    execute format('create policy "%1$s_update" on public.%1$I for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id());', t);
    execute format('drop policy if exists "%1$s_delete" on public.%1$I;', t);
    execute format('create policy "%1$s_delete" on public.%1$I for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));', t);
  end loop;
end $$;

-- templates are global reference data: any authenticated user can read.
alter table public.automation_templates enable row level security;
drop policy if exists "automation_templates_select" on public.automation_templates;
create policy "automation_templates_select" on public.automation_templates for select to authenticated using (true);

-- ── seed: 8 default workflow templates ───────────────────────────────────────
insert into public.automation_templates (template_key, name, description, category, trigger_type, default_conditions, default_steps, sort_order) values
  ('new_lead_followup', 'ליד חדש → מעקב + שיוך + משימה', 'כשמגיע ליד חדש: הכנת מעקב, שיוך סוכן ומשימה — לאישור אנושי.', 'lead', 'lead_created',
    '[]'::jsonb,
    '[{"action_type":"create_follow_up","title":"הכנת מעקב לליד"},{"action_type":"assign_user","title":"שיוך סוכן מתאים"},{"action_type":"create_task","title":"משימת יצירת קשר ראשוני"}]'::jsonb, 1),
  ('property_inactive_30d', 'נכס 30 יום ללא פעילות → הזדמנות + המלצה', 'נכס לא פעיל 30 יום: הכנת הזדמנות והמלצת פעולה.', 'property', 'property_updated',
    '[{"condition_type":"property_inactive_days","operator":"gte","value_number":30}]'::jsonb,
    '[{"action_type":"create_opportunity","title":"הזדמנות החייאת נכס"},{"action_type":"create_recommendation","title":"המלצת פעולה לנכס"}]'::jsonb, 2),
  ('seller_viewed_portal', 'מוכר צפה בפורטל תמחור → הצעת מעקב', 'מוכר שצפה בפורטל התמחור: הכנת הצעת מעקב.', 'portal', 'portal_viewed',
    '[{"condition_type":"seller_viewed_pricing","operator":"eq","value_text":"true"}]'::jsonb,
    '[{"action_type":"create_follow_up","title":"הצעת מעקב למוכר שצפה בתמחור"}]'::jsonb, 3),
  ('buyer_viewed_recos', 'קונה צפה בנכסים מומלצים → הצעת מעקב', 'קונה שצפה בנכסים שהומלצו לו: הכנת הצעת מעקב.', 'buyer', 'portal_viewed',
    '[{"condition_type":"buyer_viewed_properties","operator":"eq","value_text":"true"}]'::jsonb,
    '[{"action_type":"create_follow_up","title":"הצעת מעקב לקונה מתעניין"}]'::jsonb, 4),
  ('deal_risk_detected', 'סיכון בעסקה → התראה + משימת מנהל', 'זוהה סיכון בעסקה: הכנת התראה ומשימה למנהל.', 'deal', 'deal_stage_changed',
    '[{"condition_type":"deal_at_risk","operator":"eq","value_text":"true"}]'::jsonb,
    '[{"action_type":"create_alert","title":"התראת סיכון בעסקה"},{"action_type":"create_task","title":"משימת מנהל — טיפול בסיכון"}]'::jsonb, 5),
  ('revenue_gap_detected', 'פער הכנסות → הזדמנות הכנסה', 'זוהה פער הכנסות מעל הסף: הכנת הזדמנות הכנסה.', 'revenue', 'revenue_risk_detected',
    '[{"condition_type":"revenue_gap","operator":"gte","value_number":0}]'::jsonb,
    '[{"action_type":"create_opportunity","title":"הזדמנות סגירת פער הכנסות"}]'::jsonb, 6),
  ('territory_white_space', 'שטח לבן בטריטוריה → הזדמנות גיוס', 'זוהה שטח לבן: הכנת הזדמנות גיוס מלאי.', 'territory', 'territory_opportunity_detected',
    '[]'::jsonb,
    '[{"action_type":"create_opportunity","title":"הזדמנות גיוס בשטח לבן"}]'::jsonb, 7),
  ('high_intent_social_lead', 'ליד חברתי בעל כוונה גבוהה → ליד עדיפות', 'ליד חברתי בכוונה גבוהה: הכנת ליד עדיפות + משימה.', 'distribution', 'social_lead_qualified',
    '[{"condition_type":"social_lead_high_intent","operator":"eq","value_text":"true"}]'::jsonb,
    '[{"action_type":"create_queue_item","title":"ליד עדיפות בתור"},{"action_type":"create_task","title":"משימת יצירת קשר מיידי"}]'::jsonb, 8)
on conflict (template_key) do update set
  name = excluded.name, description = excluded.description, category = excluded.category,
  trigger_type = excluded.trigger_type, default_conditions = excluded.default_conditions,
  default_steps = excluded.default_steps, sort_order = excluded.sort_order, is_active = true;
