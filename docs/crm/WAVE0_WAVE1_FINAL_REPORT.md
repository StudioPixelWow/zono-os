# ZONO — Wave 0 / Wave 1 Final Report

Foundation for security, tenant isolation, unified identity, and CRM import. **Additive only; nothing applied to production; no production data modified.** The testable cores are implemented with passing tests; the DB-integrated pieces are delivered as reviewed migrations + designs to apply on a staging copy.

## Implemented (code + tests + evidence)
- **Identity resolution service** — `src/lib/identity/resolution.ts`. The single dedup gate: normalizes IL phone/email/name/source-id; classifies exact_high/likely/ambiguous/conflicting/distinct; auto-links only single exact_high; conflicting/ambiguous/multi → review; never name-only merge; deterministic. **16/16 tests.**
- **CRM import validation** — `src/lib/import/validation.ts`. Per-row/field normalize + validate (phone/email/date/currency/number/boolean/city/tags), Hebrew booleans, dd/mm/yyyy dates, **formula cells rejected (never executed)**, required enforcement, batch partial-failure isolation. **19/19 tests.**
- **Org-scoped write boundary** — `src/lib/security/org-scope.ts`. Deny-by-default write authorization: cross-tenant always denied, inactive members denied, ownership + manager gates, `assertWrite`/`OrgScopeError`. **13/13 tests.**
- **Total: 48/48 automated tests; `tsc --noEmit` clean on all three modules.**

## Designed but not applied (migrations/ops awaiting approval + staging)
- `20261001120000_persons_identity_additive.sql` — persons/person_identifiers/person_roles/person_merge_log + nullable person_id back-links + RLS. Option C progressive-hybrid; reversible.
- `20261001121000_import_pipeline_additive.sql` — import_batches/import_rows/import_mappings + RLS.
- `20261001122000_private_document_buckets.sql` — flips the three public buckets private + org-scoped read/write policies. **Apply only after the signed-URL read path is deployed** (breaks old public URLs).
- Design docs: tenant registry, RLS/service-role audit, document-storage audit + migration preview, two-org isolation matrix, agent-departure workflow, security runbook, identity architecture decision, identity migration preview, person-creation path audit, import architecture/field-mapping/rollback.

## Blocked (need credentials / product decision / staging DB)
- **Runtime isolation + RLS proof** — needs both migrations applied to a **staging** Supabase (not production) + a test runner (vitest). Matrix + fixtures are ready.
- **Product decisions:** identity migration approach (confirmed recommendation: Option C — needs sign-off before backfill); which entities in v1 import; consent model; who inherits records on departure.
- **Signed-URL read path deploy** before privatizing buckets.
- **Error tracking (Sentry) + job monitors** — infra provisioning.

## Security status
- documents: **designed** (migration + signed-URL design) — not applied; public exposure remains until applied.
- tenant isolation: **core boundary implemented + tested** (org-scope); RLS packs + wiring **designed**, not applied; 109 tables still uncovered on prod.
- service-role writes: **wrapper + decision implemented + tested**; 173 call sites not yet migrated.
- user deactivation: **enforced in the write boundary** (inactive_member deny, tested); session/guard wiring pending.
- two-organization testing: **matrix + fixtures ready**; runtime pending staging.
- observability: **designed** (runbook); not implemented.

## Identity status
- architecture: **decided (Option C)** + schema delivered.
- migration: **additive preview delivered**; not applied.
- creation paths: **audited**; gate implemented; wiring pending.
- deduplication: **implemented + tested** (16).
- merge: **schema + reversible audit** (person_merge_log); executor pending.
- audit history: **person_merge_log + import history** schema delivered.

## Import status
- supported entities: person/contact, lead, buyer, seller, property, task, note, tags (v1; disclosed).
- formats: CSV + XLSX (design).
- mapping/preview/validation/duplicates: **validation core + resolver implemented + tested**; mapping/preview UI + async processing pending.
- rollback: **plan + rollback_state schema** delivered; executor pending.
- error reporting: **per-row batch results implemented**; error-file generation pending.

## Test results
identity 16/16 · import 19/19 · org-scope 13/13 → **48/48 passed, 0 failed**. `tsc --noEmit` clean. Prior QA/Stage suites unaffected.

## Remaining risks (not minimized)
1. **Public documents remain exposed on production** until the privatize migration is applied (operator action on prod, after deploying the read path). This is an open P0 until then.
2. **Cross-tenant write risk remains on production** until RLS packs are applied and the 173 service-role sites are wrapped. The boundary exists but is not yet enforced everywhere.
3. **Identity backfill unproven at runtime** — the resolver is unit-proven; clustering on real data must be dry-run on staging before any link is written.
4. **No runtime isolation proof yet** — the two-org suite must run on staging; until then isolation is designed, not demonstrated.

## Recommendation
# Wave 0 incomplete.

The **foundations are built and tested** (identity resolver, import validation, org-scoped write boundary — 48 tests) and the migrations/designs are ready. But Wave 0 cannot be called complete until its migrations are applied on a staging DB, the two-org isolation suite passes at runtime, the public buckets are privatized behind a deployed signed-URL path, and the write-boundary is wired into the service-role call sites. Those steps require a staging database + a test runner + product sign-off on the identity approach — none of which should be executed against production in this phase. Next concrete step: stand up a staging Supabase branch, apply the three additive migrations, run the isolation + backfill dry-runs, and wire the boundary into the highest-risk write sites.
