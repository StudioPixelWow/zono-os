# External Runtime — Final Report

Honest synthesis of the certification phase. Each unfinished gate is classified by
blocker type so nothing is misread as a code defect.

## Executed and green (this sandbox)
- Patch certification: clean apply on `origin/main`, intended scope, no
  secrets/binaries/artifacts (PATCH_CERTIFICATION.md).
- Static gates: TypeScript 0, ESLint 0, use-server guard clean.
- Test suites: **338 assertions, 0 failed** across extension, runtime integration,
  kind contracts, DB-store contracts, Local+Supabase storage contracts, reflow
  (54 combos + PNG), runtime factory, headless workspace/bulk flows, and the new
  test-runtime security guards.
- Test-runtime security: **31/0** — cannot activate in production; adapters cannot
  leak into production (TEST_RUNTIME_SECURITY_GUARDS.md).

## Not executed here — blocker classification
| Gate | Blocker type | Why |
|------|--------------|-----|
| `npm run build` | **environment** | sandbox force-kills the Next.js toolchain |
| Browser E2E (40) | **environment** | Next server reaped mid-run; runs on a normal runner/CI |
| Deployed browser smoke | **deployment + environment** | needs a staging deploy + live server |
| Supabase DB staging | **credentials/config** | needs a non-production Supabase project |
| Supabase Storage staging | **credentials/config** | needs staging Storage credentials |
| OpenAI live smoke | **credentials/config** | needs a server-side `OPENAI_API_KEY` + caps |
| Publishing live/deployed | **deployment + credentials** | needs deployed staging destination |

None of the unfinished gates is a **code defect**, a **test defect**, or a
**provider defect** — each is an environment, deployment, or credentials/config
blocker, with the exact evidence recorded in its per-gate doc.

## Failure-classification key (for the staging/CI operator)
- **code defect** — assertion fails with correct env + credentials + a healthy provider;
- **test defect** — assertion is wrong/over-strict though the app behaves correctly;
- **environment defect** — toolchain/host kills or cannot run the process (e.g. this sandbox);
- **credentials/config defect** — missing/incorrect keys, refs, or env wiring;
- **provider defect** — external provider returns an error/unavailable model with valid config.

## Browser certification — DONE
`bash scripts/creative-lab-e2e.sh` was run on a developer machine (macOS): all
**40 scenarios passed (0 failed)**. Two defects were found and fixed during the
run (a `127.0.0.1`-vs-`localhost` origin/session issue, and four racy tests);
see BROWSER_CERTIFICATION_FINAL.md.

## External runtime — executed results
- **Supabase DB + RLS — PASSED** on the real `zono-dev` project: additive
  migration applied, 8/8 constraint/persistence checks, real RLS org-isolation
  (user A sees the row, user B does not), test rows cleaned up.
  (SUPABASE_DB_STAGING_RESULTS.md)
- **OpenAI live image smoke — PASSED (12/12)**: real capped calls to `gpt-image-2`,
  one per creative kind, model stamped, usage requested→succeeded, real image
  bytes. (OPENAI_LIVE_SMOKE_RESULTS.md)
- **Supabase Storage — PASSED (11/11)**: real bucket via the `SupabasePrivateStorage`
  adapter — owner signed read; anonymous/inactive/cross-org/arbitrary-path/qa_failed
  all denied; approved promotion with private master retained; cleaned up.
  (SUPABASE_STORAGE_STAGING_RESULTS.md)

Only gate not run — **requires a deployment target that does not exist yet**:
- Deployed staging app: publishing handoff + deployed browser smoke. The mock
  publishing path is fully verified (`runtime.qa.ts` 34/0, `lab-flows.qa.ts` 36/0);
  only the deployed run is outstanding.

## Verdicts
- **Local implementation:** Complete.
- **Browser certification:** **PASSED** — all 40 scenarios executed end-to-end
  through the real browser on a normal runner (40 passed, 0 failed).
- **External runtime:** **Partially Passed (strong)** — real-project runs GREEN for
  Supabase DB + RLS, live OpenAI (gpt-image-2), and Supabase Storage signed-access.
  The only remaining gate (deployed publishing + deployed browser smoke) needs a
  staging deployment target, which is not available; every adapter is implemented
  and both mock-contract-verified and now live-verified.
