-- ============================================================================
-- ZONO — Pre-pilot hardening: task-dedup uniqueness + hot-path indexes (additive).
--
-- (1) DB-level guarantee of "at most ONE OPEN auto-task per (org, intelligence_source)"
--     — SCOPED to the ENTITY-SCOPED auto-task sources that use SELECT-then-INSERT
--     dedup and race under event+cron: `followup:<leadId>`, `viewing:<meetingId>`,
--     `marketing-plan:<planId>:<itemId>`. These carry a per-entity source string, so a
--     partial unique index correctly means "one open task per entity".
--
--     ⚠ IMPORTANT — the index is DELIBERATELY scoped by source prefix. `intelligence_source`
--     is OVERLOADED: many engines tag tasks with a CONSTANT family name (`blueprint`,
--     `buyer_intelligence`, `seller_intelligence`, `matching_intelligence`, `decision_brain`,
--     `recommendation`, `distribution_automation`, `inventory_acquisition`, `communication`,
--     `external_listings`, `ai_mission_planner`) where MANY open tasks per org are correct-by-
--     design (e.g. one `blueprint` task PER PROPERTY). An unscoped UNIQUE(org, intelligence_source)
--     would wrongly collapse those to one-per-org and break the features. Scoping to the three
--     entity-scoped prefixes fixes the real race without touching constant-tag sources.
--
--     The insert sites already tolerate a unique violation (read {data,error}, ignore error),
--     so a losing racer no-ops. Allowing a NEW open task after a prior one closes is preserved
--     (the partial predicate only constrains OPEN rows).
--
--     The pre-index DELETE collapses only DUPLICATE OPEN rows WITHIN those three prefixes
--     (same org+source, both open), keeping the earliest. On a data set where the race never
--     fired it removes 0 rows. Constant-tag and completed/history tasks are never touched.
--
-- (2) Non-unique hot-path indexes for real large-office query paths (tasks/meetings by
--     lead_id on /leads + command-center; tasks by property_id on /properties/[id]).
-- ============================================================================

-- (1a) Collapse duplicate OPEN entity-scoped auto-tasks (keep earliest). Prefix-scoped so
--      constant-tag sources (blueprint, *_intelligence, decision_brain, …) are NEVER deleted.
delete from public.tasks a
  using public.tasks b
  where a.intelligence_source is not null
    and (a.intelligence_source like 'followup:%' or a.intelligence_source like 'viewing:%' or a.intelligence_source like 'marketing-plan:%')
    and a.status in ('todo','in_progress','blocked')
    and b.status in ('todo','in_progress','blocked')
    and a.org_id = b.org_id
    and a.intelligence_source = b.intelligence_source
    and (a.created_at > b.created_at or (a.created_at = b.created_at and a.id > b.id));

-- (1b) At most one OPEN task per (org, intelligence_source) — ONLY for the entity-scoped
--      auto-task prefixes. Constant-tag sources are excluded from the constraint entirely.
create unique index if not exists uq_tasks_open_intelligence_source
  on public.tasks (org_id, intelligence_source)
  where intelligence_source is not null
    and status in ('todo','in_progress','blocked')
    and (intelligence_source like 'followup:%' or intelligence_source like 'viewing:%' or intelligence_source like 'marketing-plan:%');

-- (2) Hot-path lookup indexes (non-unique, additive).
create index if not exists idx_tasks_org_lead      on public.tasks (org_id, lead_id)      where lead_id is not null;
create index if not exists idx_tasks_org_property   on public.tasks (org_id, property_id)  where property_id is not null;
create index if not exists idx_meetings_org_lead    on public.meetings (org_id, lead_id)   where lead_id is not null;
