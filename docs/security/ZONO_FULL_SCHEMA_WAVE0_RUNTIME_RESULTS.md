# ZONO — Full-Schema Wave 0 Runtime Results

On the full 541-table rebuild with **production RLS policies** (not the representative harness):

## Two-organization isolation — PASSED (real `buyers` table)
Seeded Org Alpha (6 buyers) + Org Beta (3 buyers) + one owner user each. Queried as `authenticated` with each owner's `sub` claim; `current_org_id()` resolves org from `users` membership (client cannot spoof).
- Alpha owner: **buyers_visible=6, cross_leak=0**, resolved_org=Alpha.
- Beta owner: **buyers_visible=3, cross_leak=0**, resolved_org=Beta.
- No-user (no sub): **buyers_visible=0** (default-deny).
- Policy qual confirmed: `org_id = current_org_id()` on `buyers` (2 SELECT policies: `buyers_select`, `buyers_qa1_read`).

## Key posture corrections (from full-schema evidence)
- **RLS is enforced on all 541 tables** (not "109 without RLS").
- Tenant tables carry full CRUD policies (5 each).
- `current_org_id()` is membership-derived → org spoofing via a client claim is impossible.
- The genuine remaining write-side risk is the **service-role bypass** (writes via service_role skip RLS) → the app-layer org-scope boundary remains the enforcement point for writes (Wave 0 org-scope module, 13 tests).

## Not yet on full schema (blocked)
Document bucket privatization + signed-URL access (needs storage runtime), app-route deactivation enforcement (needs running app), Tier-1 service-role write-wrapper wiring, observability. Status: **partially passed** — isolation/RLS proven; the rest pending.
