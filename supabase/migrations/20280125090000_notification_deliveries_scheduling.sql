-- Communication orchestration: support quiet-hours deferral + bounded retries on
-- the existing delivery log. Additive; existing immediate deliveries leave these
-- NULL/0 and are unaffected.
alter table public.notification_deliveries
  add column if not exists scheduled_at timestamptz,
  add column if not exists attempts smallint not null default 0;

create index if not exists idx_notification_deliveries_due
  on public.notification_deliveries (status, scheduled_at)
  where status = 'queued';
