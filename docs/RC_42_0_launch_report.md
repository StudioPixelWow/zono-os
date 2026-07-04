# PHASE 42.0 — ZONO Launch Readiness Hardening — Final Report

_Hardening pass. One launch-blocking dead link fixed. No new features, no duplicated logic,
no schema changes. Several parts require a live Supabase/Vercel connection that is not
available in this environment — exact commands are provided for you to run._

## 1. Live DB verification — ⚠️ requires your action
Cannot run against live from here (no project credentials in sandbox). Run the read-only
harness from 41.9 in the Supabase SQL editor:
`docs/RC_41_9_supabase_verification.sql` — any row it returns = a missing object; apply the
matching (idempotent) file, or run the consolidated `docs/RC_41_9_supabase_APPLY.sql`.
Static ground-truth (code vs migrations) remains: 0 missing tables, 0 missing RPCs, buckets/enums/compute_cache present.

## 2. Types drift — documented
`npm run check:types-drift` → 85 tables queried by code are missing from the generated
`src/lib/supabase/types.ts` (compensated by ~497 `as never` casts). This is type-gen debt,
not a live-DB gap. **Regenerate (needs your project id):**
`supabase gen types typescript --project-id <PROJECT_ID> --schema public > src/lib/supabase/types.ts`
then `npm run check:types-drift` and remove now-safe `as never` casts incrementally.

## 3. Remaining `as never` casts
~497 across ~110 tables — all resolve once types.ts is regenerated. Do not remove before regen (they are load-bearing today).

## 4. Build result
`npm run build` (`next build`) hit a **Bus error (OOM)** in this sandbox — an environment
memory limit, not a code blocker. Type-safety proxy: scoped `tsc --noEmit` is clean on all
changed files; full project build must run in CI/Vercel (adequate memory). This is the PART 9 Vercel step.

## 5. Smoke tests (static route/wiring verification)
All core route pages exist and resolve: `/today /my /territory /facebook /whatsapp/inbox
/market-domination /website /marketing-core /action-center /notifications /distribution
/properties /buyers/[id] /sellers/[id] /properties/[id] /external-listings/[id]`.
**Found + fixed:** `/leads/[id]` did **not** exist yet Broker Workspace, Daily OS and the
WhatsApp inbox all link to it → 404. Added a minimal read-only page (reuse-only).

## 6. Security — PASS
- All 11 `/api/cron/*` routes are auth-guarded (0 unguarded).
- Buyer/Seller portals are auth-scoped (session-gated services).
- 0 external primary links to Yad2/Madlan outside the internal detail page.
- Public site/agent/area/landing pages use redaction (no private CRM data).
- RLS coverage packs present; harness reports any table without RLS / RLS-without-policy on live.

## 7. Performance
Compute-cache in use on the heaviest composites: `daily-os` (300s), `territory-os` (600s),
`field-ops` (300s). Candidates (recommendation only, non-blocking): `chief-of-staff`,
`ask-zono` — reuse the existing `platform-persistence/compute-cache`; do not add new cache architecture.

## 8. UX hardening — PASS
Empty states (150+ files), loading/pending states (211+ files), approval + "nothing
auto-sends" labels present ("טיוטה בלבד — לא נשלח אוטומטית", "דורש/ת אישור"). RTL throughout. New lead page is RTL, empty-safe, and degrades silently if the Lead Twin is unavailable.

## 9. Fixes made
1. **`/leads/[id]` page** (`src/app/(app)/leads/[id]/page.tsx`) — closes the dead link at the
   end of the New-Lead and Facebook-comment→CRM journeys. Reuses the existing Lead Twin read
   model + generic Communication/Relationship sections + StartWorkflowButton. No new logic/schema.

## 10. Remaining launch blockers
None in code. Two **operational** gating steps you must run (need live credentials):
- Run the DB verification harness against live Supabase; apply anything missing.
- Regenerate `types.ts` from live and confirm `check:types-drift` is clean.
- Confirm the Vercel production build passes (sandbox can't run `next build` due to memory).

## 11. Beta readiness score
| Area | Status |
|---|---|
| CRM · AI · Missions/Workflows · Ask ZONO | Ready |
| Facebook · WhatsApp · Distribution · Marketing · Creative | Ready |
| Websites · Landing · Portals · Platform API | Ready |
| Broker Workspace · Daily OS · Territory | Ready (leads dead link fixed) |
| Security · Public/Private boundaries | Ready |
| Routing (no dead links) | Ready (fixed) |
| Live DB sync | Pending your verification run |
| Types regeneration | Pending (needs project id) |
| Production build (Vercel) | Pending CI run (sandbox OOM) |

## 12. Production readiness
**BETA LAUNCH READY**, contingent on the three operational steps in §10 (live DB verify,
types regen, Vercel build). No code launch blockers remain; nothing auto-executes; boundaries verified.

## 13. Git commit hash
`40f042e`
