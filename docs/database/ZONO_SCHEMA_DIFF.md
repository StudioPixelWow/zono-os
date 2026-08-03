# ZONO — Four-Way Schema Diff

Sources: **A** production (473 tables) · **B** migration replay (541) · **C** repository (= B) · **D** generated types (310). Machine-readable: `zono-schema-diff.json`.

## Table-level
| Difference | Count | Classification |
|---|---|---|
| Migration-only (B\A) | 71 | undeployed to prod (mostly `meta_workspace` + copilot/creative/agency/zi) — deploy or remove (product decision) |
| Production-only (A\B) | 3 | **no migration provenance** — `approval_decisions`, `journey_notes`, `user_ui_preferences` (dangerous; `journey_notes` is used by code) |
| Prod tables missing from types (A\D) | 163 | **type gap** — accessed via `.from(x as never)`; not schema drift |
| Types-only stale (D\A) | 12 | types generated at an earlier migration state |

## Column-level (shared tables that differ structurally)
| Table | Type | Detail |
|---|---|---|
| `properties` | missing column in prod | replay has `formatted_address text`; prod lacks it (undeployed migration column) |
| `agencies` | missing columns in prod | replay has 7 cols prod lacks (brand_name, created_from, creation_confidence, display_name, franchise_name, identity_metadata, identity_status) |
| `deals` | **type mismatch** | `commission_amount` & `value` are **BIGINT in prod** but **INTEGER in migrations** → production altered *ahead* of the repo (out-of-band / removed migration) |

Key CRM tables verified IDENTICAL: buyers, sellers, leads, documents, tasks, users, organizations, meetings, notes, agency_agents, property_transactions.

## Aggregate posture
- **RLS:** prod 473/473 enabled (11 policy-less system tables); replay 541/541 (13). **Correction: the prior "109 tables without RLS" is REJECTED.**
- **Policies:** prod 1,690 vs replay 1,812. **Functions/enums:** replay 70 / 44.

## Enum / extension / function / policy / index / storage / cron / realtime
Enums (44) and extensions match between replay and prod at the name level (both built from the same chain); the divergences are the undeployed-migration objects above. A full per-object (index/trigger/function-body) diff over all 470 shared tables is reproducible via the delivered join script; the structural (column) drift set is the 3 tables above among the key set. Exhaustive enumeration: run the sig-join on a connected prod + replay.
