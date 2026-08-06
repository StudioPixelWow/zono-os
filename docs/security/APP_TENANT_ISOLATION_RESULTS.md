# ZONO CRM 360 — Application Tenant Isolation (Phase 8)

**Date:** 2026-08-05 · **Target:** staging `zono-dev`

## Layer A — Database-level isolation (✅ verified this session)

- **RLS coverage: 100%** — 553/553 public tables have row-level security enabled; 0 without.
- **Every deployed feature table** carries an org-scoped SELECT policy `org_id = current_org_id()` (or `organization_id = current_org_id()`), with writes gated by `has_min_role(...)`. The only policy-less tables (`meta_token_health`, `meta_sync_cursor`) are RLS-enabled service-role-only by design.
- **Isolation primitive:** `current_org_id() = select org_id from users where id = auth.uid()`. Alpha's JWT resolves to Alpha's org; a row with `org_id = Beta` can never satisfy `org_id = current_org_id()` for an Alpha session → Alpha cannot SELECT/COUNT/UPDATE/DELETE Beta rows, and a non-matching row is **invisible** (returns empty, not "forbidden"), so existence is not revealed.
- **Private documents:** the `documents` bucket is private with an org-scoped storage SELECT policy `(storage.foldername(name))[1] = current_org_id()::text`; cross-org signed-URL minting is denied at the storage-policy layer.
- **Dispatcher RPCs:** now service-role-only (Phase 2) — a tenant session cannot invoke them at all.

This establishes tenant isolation at the **data layer**, which is where the guarantee ultimately lives.

## Layer B — Application-surface isolation (⛔ blocked on deployed app)

The program requires proving Alpha cannot reach Beta through each **app surface** (direct URL, search, list, count, bulk action, signed doc URL, person/property/match/offer/deal/commission/collection workspaces, Meta workspace, Copilot, ZI progress, Creative QA) with captured HTTP statuses + UI behavior. This requires two real org logins against the deployed app and cannot be executed here.

**Important caveat:** RLS guarantees data isolation, but app-surface isolation also depends on server code always running queries **under the caller's JWT** (not the service-role key) for tenant-facing reads. Confirming no tenant-facing path uses the service-role client to bypass RLS is part of the deployed-app audit and is **not yet proven**.

## Status

| Layer | Result |
|---|---|
| DB RLS isolation (all tables, docs, RPCs) | ✅ verified |
| App-surface cross-tenant probes (Alpha vs Beta) | ⛔ blocked on deployment |
| No service-role bypass on tenant read paths | ⏳ pending deployed-app audit |

Cross-tenant application isolation is an **open Design-Partner gate**; the data-layer guarantee is in place.
