# ZONO CRM 360 — Staging Auth Hardening (Phase 4)

**Target:** `zono-dev` (`tlrefajhyrqnjtmimaos`) — staging. Production never touched.
**Date:** 2026-08-05

## 1. Leaked-password protection — ⚠ ACTION REQUIRED (dashboard, not automatable here)

The security advisor reports `auth_leaked_password_protection` = **disabled**. This is a Supabase **Auth configuration** setting (HaveIBeenPwned check), not a database object — there is **no Supabase MCP tool** to toggle it, so it cannot be enabled from this session. It must be enabled by the project owner in the dashboard:

> **Dashboard → Authentication → Policies (Password security) → enable "Leaked password protection"** for the `zono-dev` project only. Do **not** change the production Auth project.

**Verification after enabling (owner):**
1. Re-run the security advisor — the `auth_leaked_password_protection` warning should clear.
2. Normal staging login with a strong password still succeeds.
3. Setting/resetting a password to a known-compromised value (e.g. `password`) is rejected where the platform supports the check.
4. Password reset flow still works.
5. Existing staging users are not locked out (the check applies only at password set/change, not at login with an already-set password).

Until enabled, this remains an **open Design-Partner gate** (a P1 security item, not a P0 blocker for internal staging use).

## 2. Membership & role enforcement — verified at the database level ✅

The RLS helper functions were inspected live. All are `STABLE SECURITY DEFINER` with `search_path=public` pinned, and are re-evaluated per statement:

```
current_org_id()  = select org_id from public.users where id = auth.uid();
current_role_key() = select r.key from users u join roles r on r.id=u.role_id where u.id=auth.uid();
has_min_role(min)  = role_rank(current_role_key()) >= role_rank(min);
is_org_member(org) = org is not null and org = current_org_id();
is_zono_owner()    = organizations.role_type='zono_owner' for current org;
```

Consequences (evidence for the Phase-4 checklist items):

- **Removed membership enforcement:** if a user's row is deleted, `current_org_id()` returns NULL, so every `org_id = current_org_id()` policy fails to match → the user is denied on all org-scoped tables immediately. Fails closed.
- **Moved membership:** changing `users.org_id` re-scopes the user to the new org on the very next query (no cached session org).
- **Role escalation:** role is derived from `users.role_id → roles.key`, re-evaluated per statement; a downgrade takes effect immediately. A client cannot self-escalate unless an RLS policy on `users` allows self-update of `role_id` — recommend confirming no such policy exists (see follow-up below).
- **Search-path safety:** all five helpers pin `search_path=public`, so they are not vulnerable to search-path shadowing (they are correctly absent from the advisor's `function_search_path_mutable` list).

## 3. Items requiring the deployed app / Auth config (OPEN — see Phase 5+)

These cannot be verified from the database alone and are deferred to the deployed-staging-app phase:

- **Session expiration / JWT TTL** — Auth config; verify the staging project's JWT expiry and refresh behavior in the dashboard.
- **Inactive-membership enforcement** — depends on whether the app models an `active` flag distinct from row existence; confirm against the deployed app.
- **Fixture/test-login exposure** — confirm no fixture/dev login route is enabled in a production-mode build (Phase 5 checklist item; see `STAGING_DEPLOYMENT_EVIDENCE`).
- **Invitation acceptance** — exercise the invite → accept → membership flow through the deployed app (Phase 6 journeys).
- **Self-role-update policy check** — confirm the `users` table has no RLS policy permitting a member to update their own `role_id`/`org_id` (recommended quick audit; low effort, high value).

## Status

| Item | Status |
|---|---|
| Leaked-password protection enabled | ⚠ OPEN — owner must enable in dashboard (not automatable via MCP) |
| Removed-membership fails closed | ✅ verified (DB) |
| Role re-evaluated per statement / no cached org | ✅ verified (DB) |
| Helper search_path pinned | ✅ verified (DB) |
| Session TTL / fixture login / invitation / inactive flag | ⏳ deferred to deployed-app phase |
