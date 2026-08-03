# ZONO — Authoritative Schema Manifest

**The canonical ZONO schema is the clean replay of the 209 migrations** (source B/C) — the only source that is version-controlled, reproducible (209/209 with the documented Supabase bootstrap), and complete. Machine-readable: `zono-schema-manifest.json` (541 tables, full column-level).

## Canonical counts (authoritative)
| Object | Count |
|---|---|
| Tables | **541** |
| Functions | 70 |
| Policies | 1,812 |
| Enums | 44 |
| RLS-enabled tables | 541 (100%) |
| Tables without a policy | 13 (system/webhook/cache — default-deny) |

## Authority rules
- Every future migration must preserve compatibility with this manifest.
- Production (473 tables) and the generated types (310 tables) are **derived/lagging** views and must be reconciled UP to this manifest — not the reverse.
- The 3 production-only tables with no migration provenance (`approval_decisions`, `journey_notes`, `user_ui_preferences`) must be given migrations and folded into the manifest (they are currently outside version control).
- Bootstrap prerequisites (roles, auth/storage schemas, extensions-in-`extensions`, `search_path`) are part of the canonical environment (`scripts/ci-migration-replay.sh`).

The manifest is the single source of truth after this phase.
