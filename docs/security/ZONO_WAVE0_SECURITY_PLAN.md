# ZONO Wave 0 — Security & Data-Integrity Plan

Scope: private document storage, tenant isolation, org-scoped writes, deactivation/departure, person-creation dedup gate, observability, two-org isolation tests. **All DB changes additive; nothing applied to production in this phase.**

## Confirmed P0 risks (from the CRM-360 audit, re-verified)
1. **Public document buckets** — `documents`/`property-media`/`zono-marketing-assets` are `public=true`; legal/ID/contract files world-readable by URL (`20260726120000_storage_buckets.sql:22-40`).
2. **Isolation on writes = hand-written filters** — all writes via service-role (BYPASSRLS); **109 tables no RLS**.
3. **Deactivation unenforced** — `users.status='disabled'` written but never checked at the guard; no departure/record transfer.
4. **Duplicate people** — social path inserts lead + buyer/seller twins with no dedup.

## Work items & delivery state (this phase)
| Item | Delivered here | State |
|---|---|---|
| Private buckets + signed URLs | migration `20261001122000_private_document_buckets.sql` (preview) + file-access design | designed, not applied |
| Org-scoped write boundary | `src/lib/security/org-scope.ts` (pure decision, 13 tests) | implemented + tested |
| Tenant table registry | `ZONO_TENANT_TABLE_REGISTRY.md` | designed |
| RLS + service-role audit | `ZONO_RLS_AND_SERVICE_ROLE_AUDIT.md` | designed |
| Deactivation enforcement | design in `ZONO_AGENT_DEPARTURE_WORKFLOW.md` (guard + wrapper reason `inactive_member` already enforced in org-scope) | partial (helper) |
| Departure/record transfer | `ZONO_AGENT_DEPARTURE_WORKFLOW.md` (preview-before-execute) | designed |
| Person dedup gate | `src/lib/identity/resolution.ts` (pure, 16 tests) + `PERSON_CREATION_PATH_AUDIT.md` | implemented + tested |
| Observability + runbook | `ZONO_SECURITY_RUNBOOK.md` | designed |
| Two-org isolation suite | `ZONO_TWO_ORG_ISOLATION_MATRIX.md` (matrix + fixtures) | designed (runtime pending) |

## Why not applied to prod
The program mandates additive-only, preview-before-apply, no production data changes, and no completion claim without runtime evidence. Runtime evidence for RLS/bucket/isolation requires applying migrations to a database. That is an **operator action on an isolated/staging DB**, not something to run against production here. Migrations + tests are delivered so they can be applied on a staging copy and verified.

## Exit criteria (Wave 0 gate)
All sensitive buckets private; signed access requires verified record permission; every tenant table has DB-enforced isolation or a documented justified alternative; unsafe service-role writes wrapped; two orgs pass read/write/delete/search/file isolation; inactive users blocked; departed-agent records transferable without losing history; critical errors + failed jobs observable; no open P0.
