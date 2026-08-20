-- ============================================================================
-- ZONO — Pre-pilot hardening: task-dedup uniqueness + hot-path indexes (additive).
--
-- (1) DB-level guarantee of "at most ONE OPEN automated task per (org, source)".
--     ensureFollowUpTask / ensureViewingTask / plan-orchestrator use SELECT-then-
--     INSERT (check-then-act) keyed on `intelligence_source`, which races: an event
--     hook + reconcile cron firing together can insert two identical open tasks. A
--     PARTIAL unique index over the OPEN statuses closes the race while still
--     allowing a NEW follow-up after a prior one is completed/cancelled (the intended
--     recurrence — a plain unique index would wrongly forbid that). The insert sites
--     already tolerate a unique violation (they read {data,error} and ignore error),
--     so a losing racer simply no-ops.
--
--     The pre-index DELETE collapses only DUPLICATE *OPEN* automated tasks (same
--     org+source, both open), keeping the earliest — the redundant rows the race
--     produced. Historical completed/cancelled tasks are untouched. This is the
--     standard "add a unique constraint to a table that may hold dupes" cleanup.
--     REVIEW before applying to production data.
--
-- (2) Non-unique hot-path indexes for real large-office query paths:
--     tasks/meetings by lead_id (follow-up service `.in("lead_id", …)` on /leads +
--     command-center) and tasks by property_id (/properties/[id] control-center +
--     intelligence loaders). Additive, no data change.
-- ============================================================================

-- (1a) Collapse duplicate OPEN automated tasks (keep earliest) — makes the partial
--      unique index creatable. Only touches rows that are the defect being closed.
delete from public.tasks a
  using public.tasks b
  where a.intelligence_source is not null
    and a.status in ('todo','in_progress','blocked')
    and b.status in ('todo','in_progress','blocked')
    and a.org_id = b.org_id
    and a.intelligence_source = b.intelligence_source
    and (a.created_at > b.created_at or (a.created_at = b.created_at and a.id > b.id));

-- (1b) At most one OPEN task per (org, intelligence_source).
create unique index if not exists uq_tasks_open_intelligence_source
  on public.tasks (org_id, intelligence_source)
  where intelligence_source is not null and status in ('todo','in_progress','blocked');

-- (2) Hot-path lookup indexes (non-unique, additive).
create index if not exists idx_tasks_org_lead      on public.tasks (org_id, lead_id)      where lead_id is not null;
create index if not exists idx_tasks_org_property   on public.tasks (org_id, property_id)  where property_id is not null;
create index if not exists idx_meetings_org_lead    on public.meetings (org_id, lead_id)   where lead_id is not null;
