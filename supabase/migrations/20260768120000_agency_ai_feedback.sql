-- ============================================================================
-- ZONO — PHASE 26.12: AI Resolution Center™ (Human-in-the-Loop).
-- Learning + audit log for every manual review of an AI agency resolution.
-- One row per human decision (approve/reject/merge/split/edit/ignore): captures
-- the action, the confidence before the decision, the final result, the reason,
-- who/when, and an old/new audit payload in metadata. Additive + idempotent.
-- Also extends the resolution-candidate status vocabulary with 'ignored'.
-- Org column: organization_id. RLS via current_org_id() + has_min_role().
-- ============================================================================

create table if not exists public.agency_ai_feedback (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations(id) on delete cascade,
  candidate_id         uuid references public.agency_resolution_candidates(id) on delete set null,
  agency_id            uuid references public.agencies(id) on delete set null,
  action               text not null,                 -- approve|reject|merge|split|edit|ignore
  previous_confidence  numeric,                       -- 0..1 confidence before the human decision (null when unknown)
  final_result         text,                          -- e.g. agency id, 'rejected', 'ignored', cleaned name
  feedback_reason      text,                          -- human reason / note
  reviewed_by          uuid references public.users(id) on delete set null,
  reviewed_at          timestamptz not null default now(),
  metadata             jsonb not null default '{}'::jsonb,  -- { old_value, new_value, detected_text, normalized, moved_counts, ... }
  created_at           timestamptz not null default now()
);

create index if not exists agency_ai_feedback_org_idx        on public.agency_ai_feedback(organization_id);
create index if not exists agency_ai_feedback_candidate_idx  on public.agency_ai_feedback(organization_id, candidate_id);
create index if not exists agency_ai_feedback_agency_idx     on public.agency_ai_feedback(organization_id, agency_id);
create index if not exists agency_ai_feedback_action_idx     on public.agency_ai_feedback(organization_id, action);
create index if not exists agency_ai_feedback_recent_idx     on public.agency_ai_feedback(organization_id, reviewed_at desc);

-- ── RLS — org isolation; agents+ write, managers+ delete ─────────────────────
do $$
begin
  execute 'alter table public.agency_ai_feedback enable row level security;';

  execute 'drop policy if exists agency_ai_feedback_select on public.agency_ai_feedback;';
  execute 'create policy agency_ai_feedback_select on public.agency_ai_feedback for select to authenticated using (organization_id = public.current_org_id());';

  execute 'drop policy if exists agency_ai_feedback_insert on public.agency_ai_feedback;';
  execute 'create policy agency_ai_feedback_insert on public.agency_ai_feedback for insert to authenticated with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'drop policy if exists agency_ai_feedback_update on public.agency_ai_feedback;';
  execute 'create policy agency_ai_feedback_update on public.agency_ai_feedback for update to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''agent'')) with check (organization_id = public.current_org_id() and public.has_min_role(''agent''));';

  execute 'drop policy if exists agency_ai_feedback_delete on public.agency_ai_feedback;';
  execute 'create policy agency_ai_feedback_delete on public.agency_ai_feedback for delete to authenticated using (organization_id = public.current_org_id() and public.has_min_role(''manager''));';

  execute 'grant select, insert, update, delete on public.agency_ai_feedback to authenticated;';
  execute 'grant all privileges on public.agency_ai_feedback to service_role;';
end $$;

-- ── Extend resolution-candidate status vocabulary with 'ignored' ─────────────
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'agency_resolution_candidates_status_check') then
    execute 'alter table public.agency_resolution_candidates drop constraint agency_resolution_candidates_status_check';
  end if;
  -- recreate including 'ignored' (idempotent: drop-if-exists above)
  if not exists (select 1 from pg_constraint where conname = 'agency_resolution_candidates_status_check') then
    execute $c$
      alter table public.agency_resolution_candidates
      add constraint agency_resolution_candidates_status_check
      check (status in ('pending','accepted','rejected','auto_created','needs_review','enriched','ignored'))
    $c$;
  end if;
end $$;
