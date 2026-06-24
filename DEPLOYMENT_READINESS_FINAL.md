# DEPLOYMENT READINESS — FINAL SCORE (Phase 10 · Part E)

_Deployment & infrastructure audit. One config harden applied (scheduled the orphaned `transactions-refresh` cron). No features built, no app logic changed._

Companion reports: `PRODUCTION_MIGRATION_REPORT.md`, `PRODUCTION_ENV_REPORT.md`, `ENGINE_EXECUTION_REPORT.md`, `FAILSAFE_REPORT.md`.

## Readiness by audience

| Audience | Score (0–10) | Ready? | Why |
|---|---|---|---|
| **Internal Testing** | **9** | ✅ Yes | Compiles clean; degrades gracefully without keys; needs only the Supabase trio + migrations applied. |
| **Beta Users** | **7** | ✅ Yes, gated | Safe once migrations applied + commits pushed + a labelled demo seed exists. Manual recompute acceptable. |
| **Small Brokerage** | **6** | ⚠️ Conditional | Works, but no scheduled intelligence refresh and key integrations (Meta/WhatsApp/e-sign) absent; present as "assistant today". |
| **Large Brokerage** | **4** | ❌ Not yet | No engine cron, no global error boundary, no boot env-validation, integrations + e-sign missing, migration hygiene (duplicate timestamp). Pilot-only. |
| **Investor Demo** | **7.5** | ✅ Yes, framed | Strong data integrity + breadth; demo on a migrated DB with seed; frame AI/automation as roadmap. |

**Overall deployment readiness: 6.5 / 10** — the platform is real and fail-safe; the gating items are operational (migrations, push, env, scheduling, error boundaries), not fabricated data.

## What was fixed this phase
- **Scheduled the orphaned cron**: added `/api/cron/transactions-refresh` (`0 3 * * *`) to `vercel.json`. The route was already built and `CRON_SECRET`-guarded but never scheduled → it never ran. Safe (self-disables without secret/token). _This is the only code/config change in Phase 10._

## TOP 20 remaining deployment risks (highest → lowest)

1. **Latest migrations not applied to live DB** (legal templates, distribution connections, distribution set) → routes error. **CRITICAL.**
2. **Duplicate migration timestamp** `20260718120000` (creative_qa_engine + distribution_engine) → ordering ambiguity / `db push` error on fresh DB. **CRITICAL.**
3. **8 unpushed commits** (`main` ahead of `origin/main`) — all Phase 1–8 credibility fixes won't deploy until pushed. **CRITICAL.**
4. **No boot-time env validation** — missing Supabase P0 fails at first query, not at startup. **HIGH.**
5. **Supabase trio are the only P0s with no fallback** — misconfiguration = hard down. **HIGH (operational).**
6. **No scheduled recompute for 10 intelligence engines** — dashboards drift stale between manual clicks. **HIGH (ongoing ops).**
7. **`APIFY_TOKEN` absent → no live market/transaction data** (graceful, but the "live data" story is empty). **HIGH for data demo.**
8. **No global/root error boundary** — only one `error.tsx` (creative-studio); a server error elsewhere shows the default Next error page. **HIGH for enterprise polish.**
9. **Meta / Facebook publishing not integrated** — distribution is manual. **MEDIUM-HIGH.**
10. **WhatsApp Business API not integrated** — manual assistant only. **MEDIUM-HIGH.**
11. **E-signature not integrated** — documents/legal use manual sign-lock. **MEDIUM (legal exposure).**
12. **Image generation requires a provider key** — without it, creative outputs are prompt + render object, not images. **MEDIUM.**
13. **Cold-org emptiness** — no labelled demo seed; fresh org looks bare in a live demo. **MEDIUM.**
14. **Storage buckets must exist** (property-media, documents, creative/visual) — created via migration SQL; verify present post-deploy. **MEDIUM.**
15. **Deterministic engines under "AI" branding** — informed buyers will probe; manage expectations. **MEDIUM.**
16. **No live comms/social ingestion** — communication + social leads are manual entry. **MEDIUM.**
17. **`CRON_SECRET` must be set** or both crons silently no-op (safe, but the "automation" is off). **MEDIUM.**
18. **Legal templates depend on a manually-run seed** (`…090100`) in addition to schema — easy to miss. **MEDIUM.**
19. **No automated DB backup/restore policy documented** — enterprise due-diligence item. **LOW-MEDIUM.**
20. **`.env.example` exists but should be verified to list all P0/P1 vars** so fresh deploys don't miss Supabase trio + `CRON_SECRET`. **LOW.**

## Go-live checklist (in order)

1. Resolve the duplicate migration timestamp (fresh DBs only).
2. Apply **all** migrations; verify legal / distribution-connections / distribution tables exist; run the legal seed.
3. `git push origin main`.
4. Set P0 env (Supabase trio) + `CRON_SECRET`; add Apify/AI/image keys as desired.
5. Verify storage buckets exist.
6. Add a labelled demo-seed (dev/demo org) before any external demo.
7. (Recommended next) add a nightly recompute-all-engines cron + a root `error.tsx` + boot env-assertion before large-brokerage rollout.

**Verdict:** ZONO is **deployable for internal testing and framed beta/investor demos today** once items 1–6 are done. It is **not yet large-brokerage production-grade** until engine scheduling, a global error boundary, env-validation, and the external integrations land.
