# Epic 3 — Permissions Matrix

Server-authoritative (RLS mirrors src/lib/permissions/registry.ts). Org scope from verified session; client org_id never trusted.

| Resource | read | create/edit | approve / cancel / delete |
|---|---|---|---|
| offers / offer_events | org | agent | delete=manager; events insert-only |
| commissions / collections | org | agent | approve/cancel/delete=manager; events insert-only |
| notes / note_edits | org | agent (author) | edit/archive=author or manager; edits insert-only |
| documents (private bucket) | org signed URL | agent | manager for role-gated ops |
| people (virtual) | org | via underlying buyer/seller/lead + notes/tasks actions | n/a |
| leads | org | agent via lead actions | manager |

Foreign records return generic "not found" (no existence leakage). Historical actor names preserved via append-only events. Gap: UI action hiding/disabling for restricted roles is partial in core CRM screens.
