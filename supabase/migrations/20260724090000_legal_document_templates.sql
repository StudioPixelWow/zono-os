-- ============================================================================
-- ZONO — Legal Document Templates (reusable, editable templates → generated
-- documents → manual signature + audit trail). NO real e-signature provider and
-- NO external sending in this phase — structure / storage / render only.
-- ----------------------------------------------------------------------------
-- Catalog (GLOBAL, shared product templates — no org column):
--   legal_templates · legal_template_sections · legal_template_fields
-- Per-org generated artifacts:
--   legal_documents (organization_id) · legal_document_signatures · legal_document_audit_log
-- Conventions: public.current_org_id(), public.has_min_role(role),
--   public.set_updated_at() trigger — matching existing migrations.
-- ============================================================================

-- ── 1. legal_templates (global catalog) ──────────────────────────────────────
create table public.legal_templates (
  id                 uuid primary key default gen_random_uuid(),
  key                text not null unique,
  title              text not null,
  category           text not null default 'general',
  description        text,
  default_language   text not null default 'he',
  version            integer not null default 1,
  status             text not null default 'active',   -- active | draft | archived
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index legal_templates_category_idx on public.legal_templates(category);
create index legal_templates_status_idx   on public.legal_templates(status);

-- ── 2. legal_template_sections (ordered, editable) ───────────────────────────
create table public.legal_template_sections (
  id           uuid primary key default gen_random_uuid(),
  template_id  uuid not null references public.legal_templates(id) on delete cascade,
  order_index  integer not null default 0,
  title        text,
  body         text not null default '',
  is_required  boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index legal_template_sections_template_idx on public.legal_template_sections(template_id, order_index);

-- ── 3. legal_template_fields (dynamic {{field_key}} definitions) ─────────────
create table public.legal_template_fields (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.legal_templates(id) on delete cascade,
  section_id    uuid references public.legal_template_sections(id) on delete set null,
  field_key     text not null,
  label         text not null,
  field_type    text not null default 'text',   -- text|textarea|number|date|email|phone|currency|select|signature|checkbox
  default_value text,
  is_required   boolean not null default false,
  placeholder   text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (template_id, field_key)
);
create index legal_template_fields_template_idx on public.legal_template_fields(template_id);

-- ── 4. legal_documents (per-org generated instances) ─────────────────────────
create table public.legal_documents (
  id               uuid primary key default gen_random_uuid(),
  template_id      uuid references public.legal_templates(id) on delete set null,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  agent_id         uuid references public.users(id) on delete set null,
  property_id      uuid references public.properties(id) on delete set null,
  buyer_id         uuid references public.buyers(id) on delete set null,
  seller_id        uuid references public.sellers(id) on delete set null,
  lead_id          uuid references public.leads(id) on delete set null,
  deal_id          uuid references public.deals(id) on delete set null,
  title            text not null,
  status           text not null default 'draft',   -- draft|ready_for_signature|sent|viewed|signed|declined|expired|archived
  field_values     jsonb not null default '{}'::jsonb,  -- captured {{field_key}} → value at generation time
  rendered_body    text,                                -- fully rendered (placeholders resolved) snapshot
  rendered_hash    text,                                -- sha-256 of rendered_body (tamper-evidence)
  template_version integer,                             -- the template version this doc was generated from
  version          integer not null default 1,          -- this document's own version (duplicate-on-signed bumps it)
  parent_document_id uuid references public.legal_documents(id) on delete set null,  -- set when duplicated from a signed doc
  created_by       uuid references public.users(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index legal_documents_org_idx      on public.legal_documents(organization_id);
create index legal_documents_status_idx   on public.legal_documents(organization_id, status);
create index legal_documents_template_idx on public.legal_documents(template_id);
create index legal_documents_agent_idx    on public.legal_documents(agent_id);
create index legal_documents_property_idx on public.legal_documents(property_id);
create index legal_documents_buyer_idx    on public.legal_documents(buyer_id);
create index legal_documents_seller_idx   on public.legal_documents(seller_id);
create index legal_documents_lead_idx     on public.legal_documents(lead_id);
create index legal_documents_deal_idx     on public.legal_documents(deal_id);

-- ── 5. legal_document_signatures (manual signing — no provider yet) ──────────
create table public.legal_document_signatures (
  id             uuid primary key default gen_random_uuid(),
  document_id    uuid not null references public.legal_documents(id) on delete cascade,
  signer_name    text not null,
  signer_email   text,
  signer_phone   text,
  signer_role    text,                                 -- client | agent | seller | buyer | witness | other
  signed_at      timestamptz,
  ip_address     text,
  device_info    text,
  signature_hash text,                                 -- hash of (document rendered_hash + signer + signed_at)
  audit_metadata jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index legal_document_signatures_document_idx on public.legal_document_signatures(document_id);

-- ── 6. legal_document_audit_log (append-only trail) ──────────────────────────
create table public.legal_document_audit_log (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.legal_documents(id) on delete cascade,
  event_type  text not null,                           -- created|updated|status_changed|rendered|signed|declined|duplicated|...
  actor_id    uuid references public.users(id) on delete set null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index legal_document_audit_log_document_idx on public.legal_document_audit_log(document_id, created_at desc);

-- ── updated_at triggers (tables that carry updated_at) ───────────────────────
create trigger trg_legal_templates_updated         before update on public.legal_templates         for each row execute function public.set_updated_at();
create trigger trg_legal_template_sections_updated before update on public.legal_template_sections for each row execute function public.set_updated_at();
create trigger trg_legal_template_fields_updated   before update on public.legal_template_fields   for each row execute function public.set_updated_at();
create trigger trg_legal_documents_updated         before update on public.legal_documents         for each row execute function public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Catalog: readable by all authenticated; only admins manage (global product templates).
do $$
declare t text;
begin
  foreach t in array array['legal_templates','legal_template_sections','legal_template_fields'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated using (true);$f$, t);
    execute format($f$create policy "%1$s_insert" on public.%1$I for insert to authenticated with check (public.has_min_role('admin'));$f$, t);
    execute format($f$create policy "%1$s_update" on public.%1$I for update to authenticated using (public.has_min_role('admin')) with check (public.has_min_role('admin'));$f$, t);
    execute format($f$create policy "%1$s_delete" on public.%1$I for delete to authenticated using (public.has_min_role('admin'));$f$, t);
    execute format('grant select, insert, update, delete on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;

-- legal_documents: strictly org-scoped; agents may write within their org.
alter table public.legal_documents enable row level security;
create policy "legal_documents_select" on public.legal_documents for select to authenticated
  using (organization_id = public.current_org_id());
create policy "legal_documents_insert" on public.legal_documents for insert to authenticated
  with check (organization_id = public.current_org_id() and public.has_min_role('agent'));
create policy "legal_documents_update" on public.legal_documents for update to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('agent'))
  with check (organization_id = public.current_org_id());
create policy "legal_documents_delete" on public.legal_documents for delete to authenticated
  using (organization_id = public.current_org_id() and public.has_min_role('manager'));
grant select, insert, update, delete on public.legal_documents to authenticated;
grant all privileges on public.legal_documents to service_role;

-- signatures + audit: access governed by the parent document's org.
do $$
declare t text;
begin
  foreach t in array array['legal_document_signatures','legal_document_audit_log'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$create policy "%1$s_select" on public.%1$I for select to authenticated
      using (exists (select 1 from public.legal_documents d where d.id = document_id and d.organization_id = public.current_org_id()));$f$, t);
    execute format($f$create policy "%1$s_insert" on public.%1$I for insert to authenticated
      with check (exists (select 1 from public.legal_documents d where d.id = document_id and d.organization_id = public.current_org_id() and public.has_min_role('agent')));$f$, t);
    execute format('grant select, insert on public.%I to authenticated;', t);
    execute format('grant all privileges on public.%I to service_role;', t);
  end loop;
end $$;

-- ── Signed-document lock: a SIGNED document is immutable except archiving ─────
-- Enforces "signed documents cannot be edited, only duplicated into a new version".
create or replace function public.legal_documents_lock_signed()
returns trigger language plpgsql as $$
begin
  if old.status = 'signed' then
    -- allow only an archive transition; everything else on a signed doc is blocked.
    if new.status is distinct from 'archived'
       or new.title is distinct from old.title
       or new.rendered_body is distinct from old.rendered_body
       or new.field_values::text is distinct from old.field_values::text then
      raise exception 'legal_documents: a signed document is locked and cannot be edited (duplicate it into a new version instead)';
    end if;
  end if;
  return new;
end $$;
create trigger trg_legal_documents_lock_signed
  before update on public.legal_documents
  for each row execute function public.legal_documents_lock_signed();
