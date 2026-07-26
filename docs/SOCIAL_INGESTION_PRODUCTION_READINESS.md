# ZONO — Social Interaction Ingestion · Production Readiness (P4.6)

**Scope:** operational readiness for the Facebook Social Interaction pipeline (P4.1–P4.5). **No product behavior is added or changed in P4.6** — this covers migrations validation, rollout, metrics, logging, health, recovery, runbook, checklists, smoke tests, and go-live.

**Pipeline (unchanged):**
`extension human-confirmed capture → POST /api/extension/facebook/capture-interaction → social_interactions (idempotent) → /api/cron/social-recompute → recomputeSocialLeads → social_leads (status:"new") → existing human review board → optional existing convertSocialLeadToLead → lead.created`.

**Current state:** code-complete, **dark by default** (`SOCIAL_INTERACTION_INGEST_ENABLED` unset). No CRM lead is ever created by ingestion/processing; `lead.created` is emitted only by the existing human-triggered conversion. Two idempotency migrations are **not yet applied to production**.

---

## 1. Production migration validation

**Two required migrations (apply in this order):**

1. `20270110120000_p4_1_social_interactions_idempotency.sql` — partial unique index `social_interactions_org_ext_comment_uq (organization_id, external_comment_id) WHERE external_comment_id IS NOT NULL`.
2. `20270115120000_p4_5_social_leads_idempotency.sql` — partial unique index `social_leads_org_interaction_uq (organization_id, social_interaction_id) WHERE social_interaction_id IS NOT NULL`.

**Recommended additive (non-blocking):** `20270110120100_p4_1_group_post_source_link.sql` — `distribution_group_posts.source_post_id` FK + index (closes the Phase 1 history↔post link; not required for ingestion).

Both idempotency migrations are **additive, non-destructive, self-protecting**: `CREATE UNIQUE INDEX` fails with 23505 and changes nothing if duplicates exist. Verified on Postgres 16 (index creation, cross-org allow, same-org reject, multi-NULL allow, rollback, re-apply, self-protection over duplicates).

**PREFLIGHT — run BEFORE each migration (expect zero rows):**

```sql
-- P4.1 (social_interactions): duplicate external comment ids per org
select organization_id, external_comment_id, count(*)
  from public.social_interactions
  where external_comment_id is not null
  group by 1,2 having count(*) > 1;

-- P4.5 (social_leads): duplicate interaction-linked leads per org
select organization_id, social_interaction_id, count(*)
  from public.social_leads
  where social_interaction_id is not null
  group by 1,2 having count(*) > 1;
```

If either returns rows: **do not force the migration.** Report the duplicate groups and apply deterministic remediation under review — keep the most-progressed row per group (`converted` > `qualified` > `reviewed` > `new`, tie-break earliest `created_at`) and delete the rest — then re-run the preflight. `social_interactions` has no writer prior to go-live, so its preflight is expected clean; `social_leads` may hold rows from prior recompute runs.

**VERIFY — after applying (expect both `t`):**

```sql
select
  exists(select 1 from pg_indexes where indexname='social_interactions_org_ext_comment_uq') as si_idx,
  exists(select 1 from pg_indexes where indexname='social_leads_org_interaction_uq')       as sl_idx;
```

**Prerequisites confirmed present in production:** `social_interactions`, `social_leads`, `distribution_posts` (with `campaign_id`/`property_id`/`group_id`), `organizations`. (Note: the separate Meta Workspace schema is unrelated to this pipeline and not required.)

---

## 2. Feature-flag rollout plan

Single global env flag **`SOCIAL_INTERACTION_INGEST_ENABLED`** ("1" = on). It gates the ingestion endpoint (404 when off) **and** the recompute cron (no-op when off). There is no per-org processing flag (none exists authoritatively — not invented).

**Staged rollout:**

1. **Stage 0 — dark (default):** migrations applied, flag unset. Cron runs every 15 min and immediately returns `{disabled:true}`. Endpoint returns 404. Zero product effect. Bake here until migrations are verified.
2. **Stage 1 — canary (one pilot org):** enable the flag. Because there is no per-org flag, "canary" is operational: pair the extension for **one** pilot broker only; other orgs have no extension paired, so they produce no interactions. Watch the health endpoint + logs for one review cycle.
3. **Stage 2 — widen:** pair additional brokers/orgs as confidence grows. The pipeline is already multi-org safe (per-org isolation in the cron).
4. **Stage 3 — full:** flag stays on; onboard remaining orgs at their own pace.

**Rollback of the flag** is instant and safe at any stage: unset `SOCIAL_INTERACTION_INGEST_ENABLED` → endpoint 404, cron no-op. Already-ingested interactions and created review leads are unaffected (review-first; no CRM/automation side effects from ingestion).

---

## 3. Operational metrics

From the **recompute cron** (per run, structured log + response): `organizations`, `failedOrgs`, `durationMs`, and totals `scanned`, `created`, `deduped`, `skipped`, `failed`.

From the **health endpoint**: `featureEnabled`, `dbReachable`, `interactions` (total), `socialLeads` (total), `newInteractions` (recompute backlog), `unattributedInteractions` (attribution-gap proxy).

**Derived signals to watch:**
- **Backlog** = `newInteractions` trending up → recompute not keeping pace (should return to ~0 each cycle).
- **Dedupe ratio** = `deduped / (created + deduped)` → high is normal on re-runs; a sudden spike alongside growing `created` may indicate overlapping runs (harmless — index-protected) or replays.
- **Failure rate** = `failed` per run and `failedOrgs` → should be 0; any non-zero warrants a log check.
- **Attribution rate** = `1 − unattributedInteractions/interactions` → low means many captures lack a resolvable source post (expected for manually-entered captures without a linked post).
- **Ingestion 4xx/5xx** at the endpoint (Vercel logs): 400 (malformed), 401 (bad instance), 404 (feature off), 429 (rate limit), 5xx (DB) — see §5.

---

## 4. Structured logging review

**Cron** emits JSON logs: `social_recompute.start`, `social_recompute.done` (`durationMs, organizations, failedOrgs, scanned, created, deduped, skipped, failed`), `social_recompute.org_list_failed` (error, truncated 160), `social_recompute.org_failed` (`org` id + truncated error). **recompute** logs `[social] recompute lead insert failed: <code> <msg 160>` on unexpected errors. The **producer** writes a scoped `audit_log` row (`social_interaction.ingested`, category `system`, metadata: `instanceId, attribution, deduped, interactionType`).

**PII review (verified):** no message text, no author names, no profile URLs, no external post/comment content, no Facebook credentials, no extension secrets appear in any operational log or the health response. Only org ids, aggregate counts, interaction *type*, and truncated generic DB error strings are logged. Error strings are capped (160) to avoid accidental payload leakage.

---

## 5. Health endpoints

**`GET /api/internal/social/ingestion-health`** — internal, `Bearer CRON_SECRET`, read-only. Returns `{ ok, featureEnabled, dbReachable, interactions, socialLeads, newInteractions, unattributedInteractions }`. No identifiers, payloads, or PII. Mirrors the existing `meta/*/queue-health` convention.

```
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<origin>/api/internal/social/ingestion-health
```

Interpretation: `dbReachable:false` → DB/connection problem; `featureEnabled:false` → pipeline dark; `newInteractions` climbing → recompute backlog; unexpected `interactions` growth while dark → an ingestion path is active (investigate).

---

## 6. Failure recovery procedures

| Failure | Symptom | Recovery |
|---|---|---|
| Migration blocked by duplicates | `CREATE UNIQUE INDEX` 23505 | Run preflight; apply deterministic remediation (§1); re-apply. Nothing was changed by the failed attempt. |
| Ingestion endpoint 5xx (DB) | Extension shows "save failed"; captures retried | Extension retries (bounded) + is idempotent (unique index). Check DB health; captures re-submit safely. No data loss. |
| Recompute cron failing for one org | `social_recompute.org_failed` in logs; `failedOrgs>0` | Per-org isolated — other orgs unaffected. Inspect the org's error; next run retries. No cross-tenant effect. |
| Recompute backlog growing | `newInteractions` rising | Confirm cron is firing (Vercel cron logs); confirm flag on; check `durationMs` isn't hitting `maxDuration`. Cadence can be raised temporarily. |
| Overlapping cron runs | Elevated `deduped` | Harmless — unique index guarantees no duplicate rows; overlapping runs only duplicate *work*. No action required. |
| Malformed/legacy interaction | One interaction won't score | `detectIntent` tolerates null/empty; a bad row is `skipped`/`failed` and **never** creates a CRM lead or emits an event. Inspect the row; re-run is safe. |
| Attribution unresolved | High `unattributedInteractions` | Expected for captures without a linked source post; the lead is still reviewable (campaign NULL). No action unless unexpectedly high. |
| Cron auth failure | 401 on the cron/health route | Verify `CRON_SECRET` is set and matches the caller. No processing occurs on 401. |
| Duplicate rows somehow present | (shouldn't happen post-migration) | The unique index prevents this at the DB. If found pre-migration, remediate per §1. |

**Invariant:** no failure path creates a `leads` row or emits `lead.created`. Conversion remains human-only.

---

## 7. Operational playbook (day-to-day)

- **Daily glance:** hit the health endpoint (confirm `dbReachable:true`, `newInteractions` near 0); **separately** check the latest recompute cron log for `failedOrgs`=0 and `failed`=0 — these are cron-run fields, not part of the health-endpoint response.
- **A broker reports "my captured lead didn't appear":** confirm flag on; confirm the extension is paired and the capture returned `{ok:true}` (not 404/401); confirm the recompute cron ran since capture (≤15 min); check the review board `/social-leads`. If the capture was `attribution: unresolved`, the lead still appears (campaign NULL) — that's expected.
- **Raising/lowering cadence:** edit the `*/15 * * * *` entry in `vercel.json` and redeploy. Do not go below what review-first needs (hourly is also fine).
- **Turning it off fast:** unset `SOCIAL_INTERACTION_INGEST_ENABLED` (Vercel env) and redeploy — endpoint 404, cron no-op, instantly.
- **Never:** manually insert into `social_leads`/`leads` to "fix" attribution; use the existing review/convert actions instead.

---

## 8. ROLLOUT CHECKLIST (go-live)

- [ ] Phase 1–3 + P4.1–P4.5 merged to the deployment branch.
- [ ] `CRON_SECRET` present in the target environment (already used by all crons — no new secret).
- [ ] Run the **duplicate preflight** (§1) for both tables — zero rows.
- [ ] Apply migration `20270110120000_p4_1_social_interactions_idempotency.sql`.
- [ ] Apply migration `20270115120000_p4_5_social_leads_idempotency.sql`.
- [ ] (Optional) apply `20270110120100_p4_1_group_post_source_link.sql`.
- [ ] Run the **VERIFY** query (§1) — both indexes present.
- [ ] Deploy the app (contains the `vercel.json` cron entry — social-recompute scheduled).
- [ ] Confirm the cron is registered (Vercel → Cron) and returns `{disabled:true}` while the flag is off.
- [ ] Run the **offline smoke test**: `npx tsx scripts/social-ingestion-smoke.ts` → 23/23.
- [ ] Run the **deployed smoke test** (§11) with the flag still off → endpoint 404, health reachable.
- [ ] **Stage 1:** set `SOCIAL_INTERACTION_INGEST_ENABLED=1`; pair the extension for the pilot broker only.
- [ ] Pilot broker captures one real interaction → returns `{ok:true, id, attribution}`.
- [ ] Within one cron cycle, the interaction appears on `/social-leads` (status `new`); no CRM lead created automatically.
- [ ] Health endpoint shows `interactions`≥1, `socialLeads`≥1 (health reports DB/backlog/aggregate only — `dbReachable`, `interactions`, `socialLeads`, `newInteractions`, `unattributedInteractions`).
- [ ] Latest recompute **cron log** shows `failedOrgs`=0 and `failed`=0 (these are cron-run fields, not health-endpoint fields).

---

## 9. ROLLBACK CHECKLIST

- [ ] **Fastest (feature):** unset `SOCIAL_INTERACTION_INGEST_ENABLED` and redeploy → endpoint 404, cron no-op. Existing review leads untouched. (Preferred first response.)
- [ ] **Unschedule cron:** remove the `/api/cron/social-recompute` entry from `vercel.json` and redeploy (optional; the flag already makes it a no-op).
- [ ] **Code rollback:** revert the P4.x commits (each is additive; reverting restores prior behavior). No data cleanup required.
- [ ] **Migration rollback (only if necessary):**
  `drop index if exists public.social_leads_org_interaction_uq;`
  `drop index if exists public.social_interactions_org_ext_comment_uq;`
  Both are non-destructive to remove (indexes only). Ingested rows and review leads remain valid.
- [ ] No `leads`/CRM cleanup is ever needed — ingestion never created CRM leads.

---

## 10. MONITORING CHECKLIST

- [ ] Alert if the health endpoint returns `dbReachable:false` or is unreachable.
- [ ] Alert if `newInteractions` exceeds a backlog threshold (e.g. > 500) for > 2 cron cycles.
- [ ] Alert if any cron run reports `failedOrgs > 0` or `failed > 0`.
- [ ] Watch `social_recompute.done` `durationMs` vs `maxDuration` (300s) — sustained high duration means scale/cadence attention.
- [ ] Watch endpoint status codes: spike in 400 (client/extension bug), 401 (auth drift), 429 (rate limit too tight), 5xx (DB).
- [ ] Sanity: `interactions` should not grow while `featureEnabled:false`.
- [ ] Confirm no PII ever appears in logs during a periodic log review (spot check).

---

## 11. Smoke-test suite

**Offline (CI / pre-deploy):** `npx tsx scripts/social-ingestion-smoke.ts` — 23 structural + contract assertions (migrations + DDL, modules/routes present, flag dark-by-default, cron scheduled + auth, review-first/no-CRM invariants, normalization + scoring sanity). Exit 0 = assembled correctly.

**Deployed (manual, post-deploy):**

```bash
# 1) Health probe (any stage)
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<origin>/api/internal/social/ingestion-health
# 2) Auth is enforced (expect 401)
curl -s -o /dev/null -w "%{http_code}\n" https://<origin>/api/internal/social/ingestion-health
# 3) While flag OFF: capture endpoint hidden (expect 404)
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://<origin>/api/extension/facebook/capture-interaction
# 4) Cron guarded (expect 401 without secret; {disabled:true} with secret while flag off)
curl -s -H "Authorization: Bearer $CRON_SECRET" https://<origin>/api/cron/social-recompute
```

---

## 12. Go-live validation

Enable the flag (Stage 1), then confirm the **end-to-end** path once with a real pilot capture:
1. Extension capture → `{ ok:true, id, deduped:false, attribution:"post"|"unresolved" }`.
2. `social_recompute` cron run (≤15 min) → health `newInteractions` drops, `socialLeads` increments.
3. `/social-leads` board shows the new lead at status `new` (review-first).
4. `leads` table unchanged (no automatic CRM lead); `lead.created` only fires if a human later converts.
5. Repeat the same capture → `{ deduped:true }`, no second row (idempotency confirmed live).

---

### What is NOT yet done (operator-gated, outside P4.6 code)
- Applying the two migrations to production (requires the production migration window + preflight).
- Enabling `SOCIAL_INTERACTION_INGEST_ENABLED`.
- The live Facebook pilot itself (P4.7).
No production cron execution or live Facebook flow has been run from this workspace; the above deployed/go-live steps are procedures for the operator.
