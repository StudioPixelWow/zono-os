# ZONO — Two-Organization Runtime Isolation Results

## Status: NOT RUN AT DB RUNTIME (no staging DB). Pure-layer proof only.

## Proven now (unit, deterministic)
The authorization DECISION every write/file access funnels through is proven cross-tenant-safe:
- `org-scope` (13 tests): Alpha actor → Beta target = `cross_tenant_denied`; inactive = denied; ownership/manager gates.
- `file-access` (17 tests): Beta manager cannot read an Alpha document (`cross_tenant_denied`); client cannot widen via path.

## NOT proven (requires staging DB + auth sessions + runner)
The DB-level matrix — Alpha/Beta fixtures (owner/manager/agent + person/lead/buyer/seller/property/task/meeting/document/deal/import) exercised through: authenticated DB client, server action, API route, direct ID, list, search, count, nested relation, export, document access, insert/update/archive — asserting **no Alpha actor can read/infer/count/search/mutate/export/sign/access a Beta record**, and counts/search do not leak foreign-record existence, and errors reveal no foreign details.

Result counts: **0 run / pending**. Fixtures + matrix defined (`ZONO_TWO_ORG_ISOLATION_MATRIX.md`). Execute on staging after the persons + RLS migrations are applied there.
