# ZONO — Two-Organization Isolation Test Matrix

Fixtures: **Org Alpha** + **Org Beta**, each with owner/manager/agent + contacts/persons/properties/tasks/deals(or placeholder)/documents. Every cell must DENY cross-org and ALLOW same-org. A test FAILS if a Beta record is returned, mutated, counted, searched, exported, or referenced by an Alpha actor.

| Domain / entity | SELECT | INSERT | UPDATE | DELETE/archive | direct-ID | list | search | nested relation | file | server-action | service-role wrapper |
|---|---|---|---|---|---|---|---|---|---|---|---|
| persons | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | — | ☐ | ☐ |
| buyers | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | — | ☐ | ☐ |
| sellers | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | — | ☐ | ☐ |
| leads | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | — | ☐ | ☐ |
| properties | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| tasks | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | — | ☐ | ☐ |
| deals | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | — | ☐ | ☐ |
| documents | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ |
| import_batches | ☐ | ☐ | ☐ | ☐ | ☐ | ☐ | — | ☐ | ☐ | ☐ | ☐ |

## Harness
Requires a runner (vitest) against a **staging** Supabase with both Wave-0/1 migrations applied. Two authenticated sessions (Alpha owner, Beta owner) + a service-role path exercised through the `org-scope` wrapper (asserting cross-tenant throws `OrgScopeError`). The pure `authorizeWrite` layer is already unit-covered (13 tests) — this matrix is the DB-level runtime proof.

Status: **matrix + fixtures defined; runtime execution pending a staging DB** (not run against production, per phase rules).
