# Deployed Browser Smoke — Results

## Status: NOT TESTED (deployment blocker)
Running a browser smoke against a **deployed** non-production URL requires
(a) deploying the branch to a staging environment and (b) a live Next.js server —
neither is possible in this sandbox (the Next toolchain is force-killed here, and
no deploy target is available).

**Classification: deployment + environment blocker** (not code, not credentials).

## Procedure (staging deploy only)
Deploy the branch to a non-production environment, then run a focused smoke
against the deployed URL:
1. login as staging Alpha user
2. open Single Creative Workspace
3. generate (mock or controlled live provider)
4. approve
5. generate variants
6. securely preview (signed URL from **staging** Storage)
7. schedule
8. publish (staging/mock adapter)
9. view publication result
10. view performance feedback
11. open Bulk Generator
12. run a small mixed batch
13. verify partial failure
14. verify Beta cannot access Alpha output

## Security assertions for the deployed run
- **no** test-runtime fixture login exposed in a production-mode deployment
  (`labEnabled()` false → routes 404; proven by `test-runtime-security.qa.ts`);
- signed URLs resolve against **staging** Storage;
- browser refresh preserves state;
- server logs contain **no secrets**.

**Result: pending a staging deployment — the guards that make this safe are
automated-verified (31/0).**
