-- ============================================================================
-- P9.3 — "פרסום עכשיו" (Publish Now) explicit-claim priority.
-- ----------------------------------------------------------------------------
-- Lets a user promote ONE specific ready post to be the NEXT item their
-- extension-assisted session publishes — without a second engine and without
-- faking provider success. It only sets a priority signal; the SAME atomic claim,
-- lease, human-confirm and reconciliation flow still runs. `publish_requested_at`
-- is consumed (cleared) on claim, so it is a one-shot nudge, never a loop.
--   • eligibility: a requested post is claimable even if its scheduled time is in
--     the future (the user explicitly asked to publish now).
--   • ordering: requested posts are claimed before schedule order (oldest request
--     first), so an explicit selection safely takes precedence over the poll.
-- No double-publish risk: this changes WHICH post is claimed next, never how a
-- post is published or confirmed.
-- ============================================================================
alter table public.distribution_posts add column if not exists publish_requested_at timestamptz;

create or replace function public.claim_next_distribution_post(p_org uuid, p_user uuid, p_instance uuid, p_lease_seconds integer default 300)
 returns distribution_posts language plpgsql security definer set search_path to 'public'
as $function$
declare v_row public.distribution_posts; v_from text;
begin
  if exists (select 1 from public.distribution_publish_controls c
    where c.org_id=p_org and c.state='active' and c.scope in ('all','organization','org')) then
    return null;
  end if;
  select * into v_row from public.distribution_posts p
  where p.org_id=p_org and coalesce(p.assigned_user_id,p_user)=p_user and p.terminal is not true
    and coalesce(p.publish_state,'queued') in ('queued','scheduled','draft')
    -- P9.3: an explicitly-requested post is eligible even before its scheduled time.
    and (p.scheduled_at is null or p.scheduled_at <= now() or p.publish_requested_at is not null)
    and p.paused_at is null
    and (p.lease_expires_at is null or p.lease_expires_at < now())
    and (p.group_id is not null or (p.metadata->>'channel_kind') in ('facebook_group','facebook_marketplace'))
    and not exists (select 1 from public.distribution_publish_controls c
      where c.org_id=p_org and c.state='active'
        and ((c.scope='group' and c.scope_id=p.group_id) or (c.scope='campaign' and c.scope_id=p.campaign_id) or (c.scope='property' and c.scope_id=p.property_id)))
    and not exists (select 1 from public.properties pr where pr.id=p.property_id and pr.status in ('sold','rented','withdrawn','archived'))
  -- P9.3: explicit "publish now" requests win (oldest request first), then schedule.
  order by (p.publish_requested_at is null), p.publish_requested_at asc, p.scheduled_at nulls first, p.created_at
  for update skip locked limit 1;
  if not found then return null; end if;
  v_from := coalesce(v_row.publish_state,'queued');
  update public.distribution_posts set publish_state='dispatching', status='publishing', claimed_at=now(),
     dispatched_at=now(), locked_by=p_instance, assigned_user_id=coalesce(assigned_user_id,p_user),
     lease_expires_at=now()+make_interval(secs=>p_lease_seconds), attempt_count=coalesce(attempt_count,0)+1,
     publish_requested_at=null, updated_at=now()   -- consume the one-shot request
   where id=v_row.id returning * into v_row;
  insert into public.distribution_publish_events (org_id,target_id,from_state,to_state,kind,actor_id,reason)
  values (p_org,v_row.id,v_from,'dispatching','claim',p_user,'atomic claim by extension instance');
  return v_row;
end; $function$;
