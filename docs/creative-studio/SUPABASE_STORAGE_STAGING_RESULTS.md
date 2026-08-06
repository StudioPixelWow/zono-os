# Supabase Storage Staging — Results

## Status: PASSED (real bucket via the SupabasePrivateStorage adapter)
Executed on a developer machine against the real `zono-dev` Supabase Storage,
through the actual `SupabasePrivateStorage` adapter (not a mock), via
`scripts/creative-studio-live-smoke.ts --confirm-staging --allow-zono-dev-storage`:
**11 passed, 0 failed**. All test objects removed afterward.

## Checks (11/11)
- bucket `creative-private` available — ✓
- bucket `creative-published` available — ✓
- upload private draft (real bucket) — ✓
- owner signed read returns a URL — ✓
- **anonymous** denied — ✓
- **inactive** user denied — ✓
- **cross-organization** denied — ✓
- **arbitrary path** denied — ✓
- **qa_failed** not signable (refused at signing time) — ✓
- **approved promoted + private master retained** — ✓
- cleanup removed test objects — ✓

The security-critical guarantees are enforced against real Supabase Storage:
short-lived signed reads only for the owner, every unauthorized principal/path
denied, qa_failed assets never externally signable, and promotion to the
publication bucket that keeps the private master in place. This complements the
shared adapter contract (`storage-contract.qa.ts` 24/0) with a live run.

## Notes
- The adapter uses a narrow injected `SupabaseStorageClient` seam; the live client
  is a thin wrapper over `@supabase/supabase-js` storage. No secret printed;
  refuses production; the `zono-dev` project required an explicit
  `--allow-zono-dev-storage` opt-in (owner-authorized dev project).

**Result: Supabase Storage signed-access — PASSED (11/11, real bucket, cleaned up).**
