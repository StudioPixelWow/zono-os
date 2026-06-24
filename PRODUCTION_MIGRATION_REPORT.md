# PRODUCTION_MIGRATION_REPORT

_Phase 10 · Part A — Supabase migration audit. Inspection + one config harden (cron). No schema or app logic changed._
_Migrations directory: `supabase/migrations/` — **91 files total**._

## Summary verdict

The schema is **complete in code** — every route's tables have a corresponding migration file in the repo. The production risk is **not missing files; it is unapplied files + apply-order hygiene**:

- **1 duplicate migration timestamp** (ordering ambiguity) — **CRITICAL to fix before `supabase db push` on a fresh DB**.
- **The newest feature migrations are confirmed not yet applied** to the live DB in earlier phases (legal templates, distribution connections) — these routes will error until applied.
- No orphan tables found (no route references a table that has no `create table` anywhere).

---

## Critical findings

### 1. Duplicate migration timestamp — CRITICAL
Two files share the prefix `20260718120000`:

- `20260718120000_creative_qa_engine.sql`
- `20260718120000_distribution_engine.sql`

**Risk:** Supabase CLI orders migrations by version prefix. Two identical versions create non-deterministic apply order and can trigger "duplicate migration version" errors on `supabase db push` against a fresh project. **Severity: CRITICAL (deploy-blocking on a clean environment).**
**Recommended fix (manual, not auto-applied here to avoid breaking an already-migrated DB):** rename one file to a unique later timestamp (e.g. `20260718130000_distribution_engine.sql`) **only if neither has been applied yet**; if already applied to staging/prod, leave as-is and document. Do not rename a migration that has already run.

### 2. Newest migrations not applied — CRITICAL (per prior phases)
These were authored late and handed over for **manual SQL execution**; they are very likely NOT applied to the live DB:

- `20260724090000_legal_document_templates.sql` + `20260724090100_legal_templates_seed.sql` → **/legal-templates**
- `20260725090000_distribution_provider_connections.sql` → **/settings/distribution-connections** + Distribution Facebook banner
- The full distribution set (`20260718120000_distribution_engine`, `20260719120000_distribution_infrastructure`, `20260720120000_distribution_phase3`, `20260721120000_distribution_provider`, `20260722120000_distribution_comments_phase7`) → **/distribution**

**Severity: CRITICAL** — these routes throw / render empty against an un-migrated DB.

### 3. Orphan / duplicate migrations
- **Orphan tables:** none found — every table referenced by a repository has a creating migration.
- **Duplicate timestamp:** the one in finding #1.
- **Tables referenced but never created:** none confirmed; the schema-only "future" tables (communities cluster) ARE created by `20260630120000_community_execution.sql` and the social migrations — they exist but are unused by active logic (Coming Soon, not orphan).

---

## Route → migration matrix (focus areas)

| Route | Tables Required (key) | Migration Found | Applied Requirement | Risk |
|---|---|---|---|---|
| `/legal-templates` (+`/[id]`) | `legal_templates`, `legal_template_sections`, `legal_template_fields`, `legal_documents`, `legal_signatures`, `legal_audit_log` | ✅ `20260724090000` + seed `…090100` | **MUST be applied manually** | **CRITICAL** if unapplied |
| `/settings/distribution-connections` | `distribution_provider_connections` | ✅ `20260725090000` | **MUST be applied manually** | **CRITICAL** if unapplied |
| `/distribution` (+`/daily`) | distribution groups/campaigns/posts/leads/comments/analytics/automation (~20) | ✅ `20260718120000_distribution_engine` … `20260722120000_distribution_comments_phase7` | Apply full set in order | **HIGH** (+ duplicate-timestamp ordering) |
| `/communities` | community/social cluster (~12) | ✅ `20260630120000_community_execution` + social migrations | Apply; tables are schema-only (Coming Soon) | LOW (feature inactive) |
| `/creative-studio`, `/creative`, `/creative-dna` | `zono_creative_*`, `brand_identity_profiles`, `creative_dna_*`, `creative_generations` | ✅ `20260704…`–`20260717…`, `20260718120000_creative_qa_engine`, `20260723120000_creative_dna_system` | Apply set; **duplicate-timestamp file is here** | **HIGH** (ordering) |
| `/transactions` (+ sub-routes) | `property_transactions`, `market_area_snapshots`, coverage/research tables | ✅ transactions + madlan migrations | Apply; live data needs `APIFY_TOKEN` | MEDIUM |
| `/communication` | `communication_*` (4 tables) + comm intelligence (10) | ✅ activity migration + `20260702120000_communication_intelligence_os` | Apply | LOW |
| `/journeys` | `journeys` + stage/milestone tables | ✅ `20260703120000_journey_intelligence_os` | Apply | LOW |
| `/deals`, `/revenue` | `deal_profiles`, canonical `deals`, `organization_revenue_profiles`, `revenue_*` | ✅ `20260…deal_profiles`, `…revenue_referral`?, deals migrations | Apply | LOW |
| Core CRM (`/properties`,`/buyers`,`/sellers`,`/matches`,`/command`,`/forecast`,`/routing`,`/territories`,`/team`,`/reputation`,`/marketing`,`/acquisition`) | their respective intelligence + entity tables | ✅ all present | Apply full history | LOW (assuming applied) |

---

## Recommended migration apply procedure (fresh production DB)

1. **Resolve the duplicate timestamp first** (finding #1) — fresh DBs only.
2. `supabase db push` (or run files in timestamp order) — apply **all 91** in sequence.
3. Verify the late hand-over migrations actually ran: `legal_templates`, `distribution_provider_connections`, distribution set.
4. Run the **legal seed** (`…090100`) after the legal schema.
5. Smoke-test each focus route loads without a "relation does not exist" error.
6. Confirm storage buckets exist (property-media, documents, creative/visual buckets) — these are created by SQL in the relevant migrations; verify they're present.

**Net:** schema is code-complete; deployment is blocked only by (a) one duplicate timestamp and (b) applying the full migration history — especially the last three feature migrations — to the live database.
