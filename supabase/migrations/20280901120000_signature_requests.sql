-- ============================================================================
-- ZONO — Internal Remote E-Signature 1.0: signature_requests.
-- ----------------------------------------------------------------------------
-- The canonical REMOTE signing request. Distinct from manual signing
-- (legal_document_signatures still records the actual signature + audit). One
-- request per outbound signing link; the raw token is NEVER stored — only its
-- sha256 hash. References the canonical legal_documents (no duplicate document
-- truth). property_id snapshot lets the property Documents tab resolve fast.
--
-- NOT a qualified/certified digital signature — it is secure electronic consent
-- + signature capture + document lock + signed artifact + audit trail.
-- ============================================================================

create table if not exists public.signature_requests (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  document_id          uuid not null references public.legal_documents(id) on delete cascade,
  property_id          uuid,
  recipient_name       text not null,
  recipient_email      text not null,
  recipient_phone      text,
  mode                 text not null default 'remote' check (mode in ('remote')),
  status               text not null default 'sent'
                         check (status in ('draft','ready','sent','opened','signed','completed','expired','revoked')),
  token_hash           text not null unique,     -- sha256(raw token); raw token only ever in the URL
  document_hash        text,                     -- pre-signature snapshot of legal_documents.rendered_hash
  signed_artifact_path text,                     -- storage path of the immutable signed artifact
  signed_artifact_hash text,                     -- sha256 of the signed artifact
  signer_ip            text,
  signer_user_agent    text,
  expires_at           timestamptz not null,
  sent_at              timestamptz,
  opened_at            timestamptz,
  signed_at            timestamptz,
  completed_at         timestamptz,
  revoked_at           timestamptz,
  created_by           uuid,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_sigreq_doc on public.signature_requests (org_id, document_id);
create index if not exists idx_sigreq_property on public.signature_requests (org_id, property_id);
create unique index if not exists uq_sigreq_token on public.signature_requests (token_hash);

alter table public.signature_requests enable row level security;

-- Agents see + manage their org's signing requests. The PUBLIC signing path runs
-- under the service role (token-authed) and bypasses RLS for the recipient.
create policy signature_requests_select on public.signature_requests
  for select to authenticated using (org_id = public.current_org_id());
create policy signature_requests_write on public.signature_requests
  for all to authenticated
  using (org_id = public.current_org_id() and public.has_min_role('agent'))
  with check (org_id = public.current_org_id());

comment on table public.signature_requests is
  'Internal remote e-signature request (secure electronic signature, not a certified digital signature). Raw token never stored — sha256 only.';
