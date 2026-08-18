-- ZI-CS: human-readable, unique customer-facing ticket reference (ZONO-#####) for
-- ALL ticket creation paths (ZI + operator). Sequence-backed default so no code
-- path needs to know about numbering; existing rows backfilled; enforced unique.
create sequence if not exists support_ticket_number_seq start 10001;

alter table public.support_tickets
  add column if not exists ticket_number text;

do $$
declare r record;
begin
  for r in (select id from public.support_tickets where ticket_number is null order by created_at nulls first, id) loop
    update public.support_tickets set ticket_number = 'ZONO-' || nextval('support_ticket_number_seq') where id = r.id;
  end loop;
end $$;

alter table public.support_tickets
  alter column ticket_number set default ('ZONO-' || nextval('support_ticket_number_seq')::text);

create unique index if not exists uq_support_tickets_number on public.support_tickets(ticket_number);
