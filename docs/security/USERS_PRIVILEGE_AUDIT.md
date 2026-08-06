# ZONO CRM 360 — Users-Table Privilege Audit (Phase 2)

**Target:** `zono-dev` (`tlrefajhyrqnjtmimaos`) — staging. Production never touched.
**Date:** 2026-08-05
**Migration:** `supabase/migrations/20270204120000_users_block_privileged_self_update.sql` (applied)

## Finding — privilege-escalation via self-update (P1, FIXED)

The `public.users` RLS policies as shipped:

| policy | cmd | using | with check |
|---|---|---|---|
| users_select / users_qa1_read | SELECT | `org_id = current_org_id()` | — |
| users_insert | INSERT | — | `org_id = current_org_id() and has_min_role('admin')` |
| users_update | UPDATE | `(id = auth.uid()) OR (org_id = current_org_id() and has_min_role('admin'))` | `org_id = current_org_id()` |
| users_delete | DELETE | `org_id = current_org_id() and has_min_role('admin') and id <> auth.uid()` | — |

**Vulnerability:** `users_update` lets a member update their **own** row (`id = auth.uid()`), and its `WITH CHECK` only re-verifies `org_id`. RLS cannot compare OLD vs NEW columns, so nothing prevented:

```sql
update public.users set role_id = '<admin-role-id>' where id = auth.uid();   -- self-promotion
```

The `org_id` stays the same, so the `WITH CHECK` passes → an ordinary agent could **promote themselves to admin/owner**. The same shape permitted a self `org_id` change (tenant hop). Table grants also expose `UPDATE` to `authenticated` (and to `anon`, though anon has no policy).

## Fix — BEFORE UPDATE guard trigger

`users_block_privileged_self_update()` (SECURITY DEFINER, `search_path=public`) + trigger `trg_users_block_privileged_self_update`:

- **Allows** `service_role` (server-side admin flows; onboarding/invitations are INSERTs, unaffected).
- **Allows** updates where `role_id` and `org_id` are unchanged (ordinary profile self-edit).
- **Allows** an `admin+` acting within their own org on a **different** user's row (legitimate team management — matches `team-admin/service.ts` role-change path).
- **Blocks** any non-admin changing `role_id`/`org_id`, and **anyone** (incl. admins) changing their **own** `role_id`/`org_id`.

Additive + idempotent (`create or replace` + `drop trigger if exists`). Legitimate code paths verified before applying: role/org are set via admin-gated team-admin actions or service-role onboarding; no authenticated-client self-set of role_id/org_id exists (`profile/actions.ts` edits only non-privileged fields).

## Test evidence (runtime, live)

Simulated a real authenticated session (`set local role authenticated` + `request.jwt.claims.sub` = a real staging user):

| Test | Command | Result |
|---|---|---|
| **Self-promotion blocked** | `update users set role_id=<other> where id = self` | ✅ `ERROR 42501: users: changing role_id/org_id requires admin privileges and is not permitted on your own row` |
| **Ordinary self-edit allowed** | `update users set last_seen_at=now() where id = self` | ✅ succeeds |
| Idempotent re-apply | re-run migration body | ✅ no-op |

## Role-matrix expectations (to confirm at app level, Phase 6/7)

| Actor | change own role/org | change other's role/org (same org) | change other's (other org) |
|---|---|---|---|
| agent | ❌ blocked (verified) | ❌ blocked | ❌ blocked |
| manager (<admin) | ❌ blocked | ❌ blocked | ❌ blocked |
| admin/owner | ❌ blocked (no self-escalation) | ✅ allowed | ❌ blocked (org mismatch) |
| service_role | ✅ (backend) | ✅ | ✅ |

## Residual / follow-up

- **`status` (active/inactive) self-change** is not guarded by this trigger (a self-disable is harmless; re-enable requires being logged in, which a disabled user cannot do). If desired, extend the trigger to guard `status` too — low priority.
- Table-level `UPDATE`/`INSERT`/`DELETE` grants to `anon` are dead (no anon policy) but sloppy; consider revoking anon DML grants on `users` in a follow-up.
