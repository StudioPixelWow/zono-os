# ZONO CRM 360 — Staging Auth Runtime Results (Phase 1)

**Target:** `zono-dev` (`tlrefajhyrqnjtmimaos`) — staging. Production never touched.
**Date:** 2026-08-05

## Leaked-password protection — ⚠ STILL DISABLED

Re-ran the security advisor: `auth_leaked_password_protection` is **still reported as disabled**. It has not yet been enabled (or has not propagated). This must be turned on by the owner:

> **Dashboard → Authentication → Password Security → enable "Leaked Password Protection"** (zono-dev only).

After enabling, verify (owner): advisor warning clears; strong-password login works; password reset works; a known compromised password is rejected on set/reset; existing staging users remain usable. **This is an open Design-Partner gate.**

## Membership / role enforcement — ✅ verified (DB)

The RLS helpers make membership and role checks live per statement:

- `current_org_id() = select org_id from users where id = auth.uid()` → a removed user (row deleted) yields NULL, so every `org_id = current_org_id()` policy fails closed.
- `has_min_role()` derives from `users.role_id → roles.key`, re-evaluated per statement — downgrades take effect immediately.
- Self-privilege-escalation on `users` is now blocked by trigger (see `USERS_PRIVILEGE_AUDIT.md`), verified with a live `42501` denial.

## Items needing the dashboard / deployed app (⏳ open)

- **JWT expiry / refresh-token behavior** — Auth config; verify TTLs in the dashboard (no MCP toggle).
- **Invitation settings / email confirmation** — verify in dashboard + exercise invite→accept in Phase 6.
- **No staging→production redirect URLs** — confirm the staging Auth project's redirect allow-list contains only non-production URLs.

## Status

| Item | Status |
|---|---|
| Leaked-password protection | ⚠ still disabled — owner action required |
| Removed-membership fails closed | ✅ verified |
| Role re-eval per statement | ✅ verified |
| Self-role/org escalation blocked | ✅ verified (trigger + live 42501) |
| JWT TTL / invitations / redirect allow-list | ⏳ dashboard/app pending |
