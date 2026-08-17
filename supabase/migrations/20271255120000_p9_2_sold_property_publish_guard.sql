-- ============================================================================
-- P9.2 — Sold/unavailable PROPERTY publish guard (real-estate safety).
-- ----------------------------------------------------------------------------
-- A property that becomes sold / rented / withdrawn / archived must NOT keep
-- being marketed by future scheduled group posts. Two layers, both safe:
--   (1) claim_next_distribution_post() will NEVER hand out a post whose linked
--       property is unavailable (defence on the hot path; property_id NULL posts
--       are unaffected — the NOT EXISTS is vacuously true).
--   (2) pause_posts_for_unavailable_properties() moves such queued/scheduled/
--       draft posts to 'paused' with an action-required Hebrew reason, so the
--       office SEES why marketing stopped (run from the reconcile cron). Pausing
--       is reversible (resumePostAction) if the property becomes active again.
-- Never deletes history; never touches already-published posts.
-- ============================================================================

-- (1) Hot-path guard: rebuild the claim function with the availability filter.
create or replace function public.claim_next_distribution_post(p_org uuid, p_user uuid, p_instance uuid, p_lease_seconds integer default 300)
 returns distribution_posts
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row  public.distribution_posts;
  v_from text;
begin
  if exists (
    select 1 from public.distribution_publish_controls c
    where c.org_id = p_org and c.state = 'active'
      and c.scope in ('all','organization','org')
  ) then
    return null;
  end if;

  select * into v_row
  from public.distribution_posts p
  where p.org_id = p_org
    and coalesce(p.assigned_user_id, p_user) = p_user
    and p.terminal is not true
    and coalesce(p.publish_state, 'queued') in ('queued','scheduled','draft')
    and (p.scheduled_at is null or p.scheduled_at <= now())
    and p.paused_at is null
    and (p.lease_expires_at is null or p.lease_expires_at < now())
    and (p.group_id is not null
         or (p.metadata->>'channel_kind') in ('facebook_group','facebook_marketplace'))
    and not exists (
      select 1 from public.distribution_publish_controls c
      where c.org_id = p_org and c.state = 'active'
        and ( (c.scope = 'group'    and c.scope_id = p.group_id)
           or (c.scope = 'campaign' and c.scope_id = p.campaign_id)
           or (c.scope = 'property' and c.scope_id = p.property_id) )
    )
    -- P9.2: never market an unavailable property (sold/rented/withdrawn/archived)
    and not exists (
      select 1 from public.properties pr
      where pr.id = p.property_id
        and pr.status in ('sold','rented','withdrawn','archived')
    )
  order by p.scheduled_at nulls first, p.created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  v_from := coalesce(v_row.publish_state, 'queued');

  update public.distribution_posts
     set publish_state    = 'dispatching',
         status           = 'publishing',
         claimed_at       = now(),
         dispatched_at    = now(),
         locked_by        = p_instance,
         assigned_user_id = coalesce(assigned_user_id, p_user),
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         attempt_count    = coalesce(attempt_count, 0) + 1,
         updated_at       = now()
   where id = v_row.id
  returning * into v_row;

  insert into public.distribution_publish_events
    (org_id, target_id, from_state, to_state, kind, actor_id, reason)
  values
    (p_org, v_row.id, v_from, 'dispatching', 'claim', p_user,
     'atomic claim by extension instance');

  return v_row;
end;
$function$;

-- (2) Surfacing sweep: pause future posts whose property is unavailable.
create or replace function public.pause_posts_for_unavailable_properties()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer := 0;
begin
  with unavail as (
    select p.id, p.org_id, coalesce(p.publish_state,'queued') as from_state
    from public.distribution_posts p
    join public.properties pr on pr.id = p.property_id
    where coalesce(p.publish_state,'queued') in ('queued','scheduled','draft')
      and p.terminal is not true
      and p.paused_at is null
      and pr.status in ('sold','rented','withdrawn','archived')
    for update skip locked
  ),
  upd as (
    update public.distribution_posts p
       set publish_state = 'paused',
           status        = 'paused',
           paused_at     = now(),
           failure_reason = 'הנכס אינו זמין לשיווק (נמכר/הושכר/הוסר) — הפרסום הושהה',
           updated_at    = now()
      from unavail u
     where p.id = u.id
    returning p.id, p.org_id, u.from_state
  )
  insert into public.distribution_publish_events
    (org_id, target_id, from_state, to_state, kind, actor_id, callback_id, reason, occurred_at)
  select u.org_id, u.id, u.from_state, 'paused', 'paused_property_unavailable', null, null,
         'property unavailable (sold/rented/withdrawn/archived) — future marketing auto-paused', now()
  from upd u;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function public.pause_posts_for_unavailable_properties() is
  'P9.2: pause future group posts whose linked property is sold/rented/withdrawn/archived; reversible via resume.';
revoke all on function public.pause_posts_for_unavailable_properties() from public, anon, authenticated;
