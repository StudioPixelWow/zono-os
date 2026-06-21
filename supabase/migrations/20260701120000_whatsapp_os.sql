-- ============================================================================
-- ZONO — WhatsApp Execution OS (the missing WhatsApp layer)
-- ----------------------------------------------------------------------------
-- An AI WhatsApp OS for real-estate agents: inbox, conversations, qualification,
-- missed-call recovery, follow-ups, campaigns, smart links, knowledge base,
-- agent-AI actions, daily missions and a control/approval layer. Connects to
-- existing CRM/Buyer/Seller/Property/Recommendation/Automation/Decision Brain.
--
-- COMPLIANCE (hard rules): no scraping, no browser automation, no unofficial
-- WhatsApp automation, NO password/token storage. whatsapp_accounts stores only
-- connection STATUS (not_configured by default). Outbound is draft → approval →
-- manual send; official API send only when configured AND allowed. Sensitive
-- topics (price/legal/negotiation/commission/financing/availability/contract)
-- always require approval.
--
-- Idempotent. Org column: organization_id. Org-scoped RLS. Consolidation: the
-- 27 spec tables are folded into 14 (drafts+approvals; call_events+recovery;
-- followup sequences+steps; campaign audiences/messages/events; bot sessions/
-- memory; control policies -> account columns).
-- ============================================================================

-- ── whatsapp_accounts (STATUS only — never tokens/secrets) ────────────────────
create table if not exists public.whatsapp_accounts (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  provider              text not null default 'whatsapp_cloud',
  connection_status     text not null default 'not_configured',
  app_id_status         text not null default 'missing',
  phone_number_status   text not null default 'missing',
  webhook_status        text not null default 'missing',
  token_status          text not null default 'missing',
  business_hours        jsonb not null default '{}'::jsonb,
  auto_reply_allowed    boolean not null default false,
  approval_required     boolean not null default true,
  default_tone          text not null default 'professional',
  safety_rules          jsonb not null default '{}'::jsonb,
  last_checked_at       timestamptz,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint wa_accounts_conn_chk check (connection_status in ('not_configured','sandbox','connected','expired','missing_permissions')),
  constraint wa_accounts_uniq unique (organization_id, provider)
);

-- ── whatsapp_conversations (one thread per contact) ───────────────────────────
create table if not exists public.whatsapp_conversations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  contact_phone_hash text,
  contact_name      text,
  channel           text not null default 'whatsapp',
  buyer_id          uuid references public.buyers(id) on delete set null,
  seller_id         uuid references public.sellers(id) on delete set null,
  lead_id           uuid references public.leads(id) on delete set null,
  property_id       uuid references public.properties(id) on delete set null,
  assigned_agent_id uuid references public.users(id) on delete set null,
  state             text not null default 'requires_reply',
  intent            text not null default 'unknown',
  lead_score        integer not null default 0,
  urgency_score     integer not null default 0,
  unread            boolean not null default true,
  missed_call_flag  boolean not null default false,
  last_message      text,
  last_message_at   timestamptz,
  summary           jsonb not null default '{}'::jsonb,
  next_best_action  text,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint wa_conv_state_chk check (state in (
    'requires_reply','can_wait','bot_handled','agent_needed','closed','stale',
    'missed_call_recovery','hot_lead','waiting_client','approval_required'))
);

-- ── whatsapp_messages ──────────────────────────────────────────────────────────
create table if not exists public.whatsapp_messages (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  conversation_id   uuid references public.whatsapp_conversations(id) on delete cascade,
  direction         text not null default 'inbound',
  source            text not null default 'manual',
  body              text,
  intent            text,
  is_voice_note     boolean not null default false,
  transcript        text,
  transcription_status text not null default 'none',
  status            text not null default 'received',
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  constraint wa_msg_direction_chk check (direction in ('inbound','outbound')),
  constraint wa_msg_source_chk check (source in ('manual','meta_api','bot')),
  constraint wa_msg_transcription_chk check (transcription_status in ('none','not_configured','pending','done','manual'))
);

-- ── whatsapp_drafts (outbound drafts + approval + risk) ───────────────────────
create table if not exists public.whatsapp_drafts (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  conversation_id   uuid references public.whatsapp_conversations(id) on delete set null,
  campaign_id       uuid,
  created_by        uuid references public.users(id) on delete set null,
  body              text not null,
  kind              text not null default 'reply',
  risk_level        text not null default 'safe',
  requires_approval boolean not null default false,
  approval_status   text not null default 'none',
  approved_by       uuid references public.users(id) on delete set null,
  approved_at       timestamptz,
  send_status       text not null default 'draft',
  sent_at           timestamptz,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint wa_drafts_risk_chk check (risk_level in ('safe','review','sensitive')),
  constraint wa_drafts_approval_chk check (approval_status in ('none','pending','approved','rejected')),
  constraint wa_drafts_send_chk check (send_status in ('draft','queued','sent_manual','sent_api','failed','cancelled'))
);

-- ── whatsapp_call_events (+ missed-call recovery) ─────────────────────────────
create table if not exists public.whatsapp_call_events (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  conversation_id   uuid references public.whatsapp_conversations(id) on delete set null,
  contact_phone_hash text,
  contact_name      text,
  event_type        text not null default 'missed',
  source            text not null default 'manual',
  recovery_status   text not null default 'pending',
  recovered_lead_id uuid references public.leads(id) on delete set null,
  agent_id          uuid references public.users(id) on delete set null,
  occurred_at       timestamptz not null default now(),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  constraint wa_call_type_chk check (event_type in ('missed','answered','outbound')),
  constraint wa_call_recovery_chk check (recovery_status in ('pending','drafted','recovered','converted','lost'))
);

-- ── whatsapp_followups (sequences + steps consolidated) ───────────────────────
create table if not exists public.whatsapp_followups (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  conversation_id   uuid references public.whatsapp_conversations(id) on delete set null,
  followup_type     text not null default 'time_based',
  stage             integer not null default 1,
  mode              text not null default 'draft',
  body              text,
  due_at            timestamptz,
  status            text not null default 'scheduled',
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint wa_followups_mode_chk check (mode in ('task','draft','approval','api')),
  constraint wa_followups_status_chk check (status in ('scheduled','due','sent','skipped','stopped','done'))
);

-- ── whatsapp_campaigns (audiences/messages/events folded as jsonb/counts) ─────
create table if not exists public.whatsapp_campaigns (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  name              text not null,
  goal              text not null default 'sell_property',
  segment_id        uuid,
  property_id       uuid references public.properties(id) on delete set null,
  message_template  text,
  status            text not null default 'draft',
  audience_size     integer not null default 0,
  drafts_created    integer not null default 0,
  sent_count        integer not null default 0,
  replied_count     integer not null default 0,
  converted_count   integer not null default 0,
  created_by        uuid references public.users(id) on delete set null,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint wa_campaigns_status_chk check (status in ('draft','queued','sending','completed','cancelled'))
);

-- ── whatsapp_segments (dynamic; members computed) ─────────────────────────────
create table if not exists public.whatsapp_segments (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  name              text not null,
  segment_key       text not null,
  predicate         jsonb not null default '{}'::jsonb,
  member_count      integer not null default 0,
  computed_at       timestamptz,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── whatsapp_smart_links (+ events) ───────────────────────────────────────────
create table if not exists public.whatsapp_smart_links (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  slug              text not null unique,
  link_type         text not null default 'property',
  property_id       uuid references public.properties(id) on delete set null,
  campaign_id       uuid references public.whatsapp_campaigns(id) on delete set null,
  title             text,
  destination       text,
  click_count       integer not null default 0,
  conversion_count  integer not null default 0,
  created_by        uuid references public.users(id) on delete set null,
  is_active         boolean not null default true,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create table if not exists public.whatsapp_smart_link_events (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  smart_link_id     uuid references public.whatsapp_smart_links(id) on delete cascade,
  event_type        text not null default 'click',
  utm_source        text,
  phone_hash        text,
  ip_hash           text,
  created_at        timestamptz not null default now()
);

-- ── whatsapp_knowledge_base ────────────────────────────────────────────────────
create table if not exists public.whatsapp_knowledge_base (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  scope             text not null default 'office',
  question          text,
  answer            text not null,
  status            text not null default 'draft',
  risk_level        text not null default 'safe',
  allowed_for_auto_reply boolean not null default false,
  approved_by       uuid references public.users(id) on delete set null,
  version           integer not null default 1,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint wa_kb_status_chk check (status in ('draft','approved','archived')),
  constraint wa_kb_risk_chk check (risk_level in ('safe','review','sensitive'))
);

-- ── whatsapp_ai_actions (agent-AI extracted actions/suggestions) ──────────────
create table if not exists public.whatsapp_ai_actions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  conversation_id   uuid references public.whatsapp_conversations(id) on delete set null,
  agent_mode        text,
  action_type       text not null,
  title             text not null,
  detail            text,
  requires_approval boolean not null default false,
  status            text not null default 'suggested',
  applied_table     text,
  applied_id        uuid,
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint wa_ai_status_chk check (status in ('suggested','approved','applied','dismissed'))
);

-- ── whatsapp_daily_missions ────────────────────────────────────────────────────
create table if not exists public.whatsapp_daily_missions (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  agent_id          uuid references public.users(id) on delete set null,
  mission_date      date not null default current_date,
  title             text not null,
  reason            text,
  recommended_action text,
  priority          integer not null default 3,
  conversation_id   uuid references public.whatsapp_conversations(id) on delete set null,
  status            text not null default 'open',
  created_at        timestamptz not null default now(),
  constraint wa_missions_status_chk check (status in ('open','done','dismissed'))
);

-- ── whatsapp_audit_logs ────────────────────────────────────────────────────────
create table if not exists public.whatsapp_audit_logs (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  actor_user_id     uuid references public.users(id) on delete set null,
  event             text not null,
  detail            text,
  risk_level        text,
  conversation_id   uuid references public.whatsapp_conversations(id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ── indexes ───────────────────────────────────────────────────────────────────
create index if not exists wa_conv_org_idx       on public.whatsapp_conversations(organization_id, state);
create index if not exists wa_conv_agent_idx       on public.whatsapp_conversations(assigned_agent_id);
create index if not exists wa_msg_conv_idx         on public.whatsapp_messages(conversation_id);
create index if not exists wa_drafts_org_idx       on public.whatsapp_drafts(organization_id, approval_status);
create index if not exists wa_drafts_conv_idx      on public.whatsapp_drafts(conversation_id);
create index if not exists wa_call_org_idx         on public.whatsapp_call_events(organization_id, recovery_status);
create index if not exists wa_followups_org_idx    on public.whatsapp_followups(organization_id, status);
create index if not exists wa_campaigns_org_idx    on public.whatsapp_campaigns(organization_id, status);
create index if not exists wa_segments_org_idx     on public.whatsapp_segments(organization_id);
create index if not exists wa_smartlinks_slug_idx   on public.whatsapp_smart_links(slug);
create index if not exists wa_smartlinks_org_idx    on public.whatsapp_smart_links(organization_id);
create index if not exists wa_kb_org_idx           on public.whatsapp_knowledge_base(organization_id, status);
create index if not exists wa_ai_org_idx           on public.whatsapp_ai_actions(organization_id, status);
create index if not exists wa_missions_org_idx     on public.whatsapp_daily_missions(organization_id, mission_date);
create index if not exists wa_audit_org_idx        on public.whatsapp_audit_logs(organization_id);

-- ── updated_at triggers ──────────────────────────────────────────────────────
do $$
declare t text;
  tbls text[] := array['whatsapp_accounts','whatsapp_conversations','whatsapp_drafts','whatsapp_followups','whatsapp_campaigns','whatsapp_segments','whatsapp_smart_links','whatsapp_knowledge_base','whatsapp_ai_actions'];
begin
  foreach t in array tbls loop
    execute format('drop trigger if exists trg_%1$s_updated on public.%1$I;', t);
    execute format('create trigger trg_%1$s_updated before update on public.%1$I for each row execute function public.set_updated_at();', t);
  end loop;
end $$;

-- ── RLS (org-scoped; agent may write on their own org rows) ───────────────────
do $$
declare t text;
  tbls text[] := array[
    'whatsapp_accounts','whatsapp_conversations','whatsapp_messages','whatsapp_drafts','whatsapp_call_events',
    'whatsapp_followups','whatsapp_campaigns','whatsapp_segments','whatsapp_smart_links','whatsapp_smart_link_events',
    'whatsapp_knowledge_base','whatsapp_ai_actions','whatsapp_daily_missions','whatsapp_audit_logs'
  ];
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

-- Public smart-link resolution uses the service-role client after slug lookup
-- (read-only, no PII), so no public RLS policy is granted here.
