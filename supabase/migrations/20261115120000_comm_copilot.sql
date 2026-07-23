-- ============================================================================
-- ZONO — Batch 6.7 · AI Communication Copilot — Phase 0 schema.
-- Additive + idempotent. Reads canonical conversations; writes ONLY these
-- copilot_* tables (+ the pre-existing communication_summaries in a later phase).
-- No frozen table (whatsapp_*, journeys) is altered. Every artifact carries an
-- explainability envelope (confidence + jsonb). Feedback is evaluation-only.
-- Org-scoped RLS via public.current_org_id().
-- ============================================================================

-- ── Conversation insight (one current snapshot per canonical conversation) ──
create table if not exists public.copilot_conversation_insight (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_ref text not null,                 -- canonical id `${channel}:${sourceId}`
  agent_id uuid references public.users(id) on delete set null,
  classification text not null default 'new_lead'
    check (classification in ('new_lead','active_buyer','active_seller','negotiation',
                              'appointment','follow_up','document_exchange','inactive','closed')),
  classification_confidence numeric not null default 0,
  sentiment text
    check (sentiment is null or sentiment in ('positive','neutral','hesitant','frustrated','high_intent')),
  sentiment_confidence numeric not null default 0,
  recommended_action text
    check (recommended_action is null or recommended_action in ('call','whatsapp','meeting','reminder','send_property','follow_up')),
  recommended_action_reason text,
  waiting boolean not null default false,
  attention jsonb not null default '[]'::jsonb,   -- detected attention flags
  explainability jsonb not null default '{}'::jsonb,  -- full reasoning envelope
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_copilot_insight unique (org_id, conversation_ref)
);
create index if not exists copilot_insight_conv_idx on public.copilot_conversation_insight (org_id, conversation_ref);
create index if not exists copilot_insight_class_idx on public.copilot_conversation_insight (org_id, classification);
create index if not exists copilot_insight_waiting_idx on public.copilot_conversation_insight (org_id) where waiting = true;

-- ── Reply suggestions (proposals ONLY — never sent; always require approval) ─
create table if not exists public.copilot_reply_suggestion (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_ref text not null,
  tone text not null check (tone in ('professional','friendly','persuasive')),
  body text not null,
  requires_approval boolean not null default true,
  status text not null default 'suggested' check (status in ('suggested','used','dismissed')),
  explainability jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists copilot_reply_conv_idx on public.copilot_reply_suggestion (org_id, conversation_ref);

-- ── Timeline milestones (structured, milestone-tagged) ──────────────────────
create table if not exists public.copilot_timeline_milestone (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  conversation_ref text not null,
  milestone_kind text not null
    check (milestone_kind in ('first_contact','offer','meeting','negotiation','document','appointment')),
  occurred_at timestamptz not null,
  source_ref text,                                -- canonical message id or linked ref
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint uq_copilot_milestone unique (org_id, conversation_ref, milestone_kind, occurred_at)
);
create index if not exists copilot_milestone_conv_idx on public.copilot_timeline_milestone (org_id, conversation_ref);

-- ── Human feedback loop (EVALUATION ONLY — never auto-retrains) ──────────────
create table if not exists public.copilot_feedback (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  artifact_type text not null check (artifact_type in ('reply_suggestion','classification','summary','recommendation')),
  artifact_ref text not null,                     -- artifact row id or `${conversation_ref}#${kind}`
  conversation_ref text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  feedback text not null
    check (feedback in ('accepted','rejected','edited','ignored','correct','incorrect','useful','not_useful')),
  edited_text text,
  created_at timestamptz not null default now()
);
create index if not exists copilot_feedback_idx on public.copilot_feedback (org_id, artifact_type, created_at desc);
create index if not exists copilot_feedback_conv_idx on public.copilot_feedback (org_id, conversation_ref);

-- ── RLS — org isolation for reads; writes are service-role/agent server code ─
do $$
declare t text;
begin
  foreach t in array array[
    'copilot_conversation_insight','copilot_reply_suggestion',
    'copilot_timeline_milestone','copilot_feedback'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (org_id = public.current_org_id())',
      t || '_select', t);
  end loop;
end $$;

-- Feedback is user-initiated: allow authenticated agents to insert their own row.
drop policy if exists copilot_feedback_insert on public.copilot_feedback;
create policy copilot_feedback_insert on public.copilot_feedback
  for insert to authenticated
  with check (org_id = public.current_org_id() and user_id = auth.uid() and public.has_min_role('agent'));
