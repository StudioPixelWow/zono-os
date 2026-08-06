# ZONO CRM 360 — SECURITY DEFINER RPC Hardening (Phase 2)

**Target:** `zono-dev` (`tlrefajhyrqnjtmimaos`) — staging. Production never touched.
**Date:** 2026-08-05
**Migration:** `supabase/migrations/20270202120000_meta_rpc_grant_hardening.sql` (applied)

## Audit — the 9 Meta queue/budget SECURITY DEFINER functions

All 9 share: `owner = postgres`, `security definer = true`, `search_path = public` (pinned — none appear in the advisor's `function_search_path_mutable` list), `SKIP LOCKED` durable-lease claim, org-fair `row_number()` partition, per-row fresh lease token. They mutate tenant queue state and are **idempotent-safe** (claiming only flips `scheduled/available/retry_wait → claimed` under a lease). Intended caller: the **internal server-side dispatcher via the service role** only. Neither anonymous nor signed-in users need access.

| Function | Args | Returns | Mutates | Org validation |
|---|---|---|---|---|
| meta_publish_claim_due | (timestamptz, int, int, text, int) | setof meta_publish_job | claims publish jobs | per-org partition + org-scoped rows |
| meta_reconcile_claim_due | (timestamptz, int, int, text, int) | setof meta_reconciliation_job | claims reconcile jobs | per-org partition |
| meta_comment_claim_due | (timestamptz, int, int, text, int) | setof meta_comment_ingestion_job | claims comment jobs | per-org partition |
| meta_insight_claim_due | (timestamptz, int, int, text, int) | setof meta_insight_refresh_job | claims insight jobs | per-org partition |
| meta_inbox_claim_due | (timestamptz, int, int, text, int) | setof meta_inbox_sync_job | claims inbox jobs | per-org partition |
| meta_intelligence_claim_due | (timestamptz, int, int, text, int) | setof meta_intelligence_job | claims scoring jobs | per-org partition |
| meta_listening_claim_due | (timestamptz, int, int, text, int) | setof meta_listening_job | claims listening jobs | per-org partition |
| meta_messaging_claim_due | (timestamptz, int, int, text, int) | setof meta_messaging_job | claims DM jobs | per-org partition |
| meta_publish_consume_budget | (uuid, text, timestamptz, int, int) | table(allowed,used,limit) | upsert+increment rate budget | org id is an explicit arg |

## Exposure found

Every function carried `=X/postgres` (**PUBLIC EXECUTE**) plus explicit `anon=X` and `authenticated=X`. So any signed-in — or anonymous — client could invoke a durable lease-claim / budget mutation via `/rest/v1/rpc/…`. The advisor flagged this as `anon_security_definer_function_executable` + `authenticated_security_definer_function_executable` (9 + 9).

## Change applied

Revoke `EXECUTE` from `public`, `anon`, `authenticated`; grant `EXECUTE` to `service_role`. Ownership (`postgres`) and the pinned `search_path=public` are unchanged, so the SECURITY DEFINER body and service-role dispatch are preserved. Delivered as an idempotent migration (not a direct grant change) so repo and DB stay aligned with provenance.

## Test evidence (runtime)

**1. `has_function_privilege` after migration — all 9:**

| role | can execute? |
|---|---|
| anon | **false** (all 9) |
| authenticated | **false** (all 9) |
| service_role | **true** (all 9) |

**2. Live denial (authenticated):**

```
set local role authenticated;
select public.meta_publish_claim_due(now(),0,1,'attacker',30);
→ ERROR: 42501: permission denied for function meta_publish_claim_due
```

**3. No queue-data leak:** with EXECUTE revoked, the REST RPC endpoint returns permission-denied *before* the function body runs — no rows are returned to anon/authenticated. Service-role calls remain functional (verified earlier: the 4 exercised RPCs returned 0 rows cleanly on empty queues).

**4. Wrong-org / invalid-worker safety:** the claim body partitions and filters strictly by `org_id` and only claims rows whose lease is free (`lease_expires_at is null or <= now()`); invalid `p_limit`/`p_per_org_max` are clamped via `greatest(...)`. Because only service-role can now call it, tenant callers cannot reach these paths at all.

**5. Security-advisor delta:** the `meta_*` functions **no longer appear** under `anon_security_definer_function_executable` or `authenticated_security_definer_function_executable`. The 8 functions that remain in those lists are pre-existing helpers — notably `current_org_id`, `has_min_role`, `is_org_member` **must** stay `authenticated`-executable because RLS policies call them; revoking those would break tenant isolation. They are correctly left unchanged. **0 ERROR-level findings.**

## Residual (tracked, not part of this phase)

- `function_search_path_mutable` on 6 pre-existing non-Meta functions (`set_updated_at`, `role_rank`, `seed_org_default_roles`, `journey_stage_for_status`, `journey_progress_for_stage`, `legal_documents_lock_signed`) — recommend a follow-up migration pinning their search_path.
- `extension_in_public` (`citext`, `pg_trgm`) — move to a dedicated schema in a future migration.
- Other pre-existing SECURITY DEFINER helpers executable by anon (`brokerage_allowed_cities`, `brokerage_city_visible`, `create_property_journey`, `is_zono_owner`, `current_role_key`) — review separately for whether anon execute is intended.
