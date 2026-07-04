# PHASE 41.9 — ZONO Release Candidate Integration & Supabase Audit

_Audit-only phase. No business logic added, no features built, no schema mutated.
Method: 3 parallel deep-exploration passes + direct ground-truth verification of
every schema claim against `supabase/migrations/`._

## 1. Integration audit
All 32 major service modules are wired through a clear reuse hierarchy. `broker-workspace`
is the aggregation hub (imports buyer/seller/lead/listing/office agents, mission-engine,
agent-framework, workflow-builder, ask-zono, whatsapp inbox, facebook-home, website-builder,
territory-os). `daily-os` re-frames broker-workspace (cached). `ask-zono` is the query layer
over all engines. No dead-end services (every export is imported or rendered). No duplicated
business logic across modules.

## 2. Missing integrations
None that break a flow. One intentional standalone: `community/*` exposes `/communities` but
is not aggregated into broker-workspace/daily-os (by design; not a broken flow).

## 3. Fixed integrations
None required — the four critical journeys are already end-to-end:
- **New Lead → lead-agent → workflow (`lead_qualification`) → mission-engine → daily-os → broker-workspace → notifications → draft-studio → follow-up** — COMPLETE.
- **New Property → listing-agent → buyer matching → marketing → facebook → whatsapp → website → landing → territory → daily-os → broker-workspace** — COMPLETE.
- **Facebook comment → distribution lead → workflow → mission → CRM leads → daily-os → broker-workspace** — COMPLETE (bridge `distribution/comment-lead-bridge.ts`; journey once-guard from 41.1.1).
- **External listing → acquisition → buyer match → whatsapp draft → mission → workflow → broker-workspace** — COMPLETE (`external-listings/alert-actions.ts`, approval-gated).

Routing: no primary card links directly to Yad2/Madlan (fixed in 41.2); external "open source"
remains a secondary inside `/external-listings/[id]` only. No dead links or duplicate pages found.

## 4. Database audit
Ground-truth diff of code vs migrations (470 tables defined, 363 referenced by code):
- **Missing tables: 0.** Every `.from("…")` table exists in migrations.
- **Missing RPC functions: 0** (`has_min_role`, `seed_org_default_roles` both defined; 14 helper fns present).
- **Missing columns: 0** on hot tables. `distribution_comments` has all code columns (base engine + phase3 adds `external_comment_id`/`author_profile_url`/`lead_intent_score`; phase7 adds `category`/`suggested_reply`/`should_create_lead`/`analysis_reason`/`lead_id`). `metadata` jsonb present on `distribution_comments` & `distribution_leads` (used by 41.1.1).
- **Enums: OK.** `lead_source` includes `facebook`; `notification_category` includes `new_lead`+`system`. `distribution_leads.source` is plain TEXT (no CHECK) — `facebook_group_comment` is valid.
- **Storage buckets: 0 missing** (7 defined; code uses none by literal name).
- **Compute cache: present** (`zono_compute_cache`, qa1 migration).

**The only real drift is type-generation, not live schema:** the generated `types.ts` is missing
85 tables that DO exist in migrations — the code compensates with `as never` casts (497 across
110 tables). This is type-safety debt, resolved by regenerating `types.ts` against the live DB
(`supabase gen types`), not a runtime/DB gap.

## 5. Complete SQL
Because migrations are code-complete, there is no corrective CREATE/ALTER strictly required
*if the live DB has every migration applied*. The actionable risk (schema work minimized since
~phase 34 → live may be behind migration history) is covered by a **read-only verification
harness**: `docs/RC_41_9_supabase_verification.sql`. Run it in the live Supabase SQL editor; any
row it returns is an object missing on live → apply the corresponding (idempotent) migration file.
Grouped as required: Tables · Columns · Indexes · Policies · Functions · Storage · Views · Enums · Helpers.

## 6. Technical debt
- Type-gen drift (85 tables) + 497 `as never` casts — regenerate `types.ts`. **(highest value)**
- `chief-of-staff` and `ask-zono` are heavy multi-engine fan-outs with no compute-cache (candidates for `getCache/setCache`, TTL 300–900s). Recommendation only — not a correctness defect.
- Distribution comment surface spread across 4 files (`comment-lead-bridge`, `comment-lead-bridge-core`, `comment-journey-service`, `distribution-comment-service`) — cohesive but could be documented as one module API.
- Possible near-duplicates to review (not confirmed duplication): `communication/*` vs `comm-intelligence/*`; `*-intelligence` scoring modules.

## 7. Cleanup recommendations
1. Regenerate `types.ts` and delete the now-unneeded `as never` casts incrementally.
2. Add compute-cache to chief-of-staff (org-scoped, 10-min TTL) and ask-zono (query-hash, 5-min TTL) — reuse existing `platform-persistence/compute-cache`, do not add a new cache.
3. Verify `/command` and `intelligence-explorer/*` pages are still linked in nav; remove if orphaned (confirm via build).

## 8. Production readiness
Security/RLS: RLS coverage packs applied; verification harness reports any table without RLS or
RLS-without-policy. Approvals: workflows dedup via `startPersistentWorkflow` (checks active
workflows), missions default `WAITING_FOR_APPROVAL`, drafts never auto-send, automation runs are
`pending_review` until approved. Nothing auto-executes. Type-safety/lint: changed surfaces clean;
type-gen debt noted. Nothing orphaned or double-starting.

## 9. Launch readiness score

| Subsystem | Status |
|---|---|
| CRM · AI agents · Mission/Workflow · Ask ZONO | Ready |
| Marketing · Facebook · WhatsApp · Distribution | Ready |
| Websites · Landing · Portals · API | Ready |
| Broker Workspace · Daily OS · Territory | Ready |
| Automation | Ready (human-supervised; no scheduled trigger — by design) |
| Integration · Architecture | Ready |
| Database (live schema vs migrations) | Ready — **pending live verification** (run the harness) |
| Type safety (generated types.ts) | Needs work (regenerate; `as never` debt) |
| Performance (CoS/Ask-ZONO caching) | Needs work (recommended, not blocking) |

**Overall: RELEASE-CANDIDATE READY.** No Critical items. Two "Needs work" items are non-blocking
(type-gen regeneration + optional caching). One gating action before production: run the
verification harness against the live Supabase and apply any migrations it flags as missing.
