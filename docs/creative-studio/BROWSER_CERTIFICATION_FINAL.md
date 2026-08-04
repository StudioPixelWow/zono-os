# Browser Certification — Final

## Scenarios
`e2e/creative-lab/creative-lab.spec.ts` — **40 scenarios authored**, mapping to
every required check: creative workflows (property / agent-brand / office-brand /
market-stat, invalid + stale market evidence rejected, unapproved asset rejected),
persistence & idempotency (refresh-during-generation, no-duplicate, version
compare, refinement, regeneration, restore-as-new-version, lineage preserved,
approval preserved), asset integrity (platform reflows, Hebrew/phone/price
integrity, exact logo, private preview), security (anonymous/inactive denied,
Beta denied Alpha output, no existence leakage), publishing (approved scheduling,
unapproved blocked, mock publication, confirmation persisted, transient retry,
permanent failure surfaced), performance (sufficient → evidence, insufficient →
no overclaim), bulk (mixed valid/invalid, partial failure, selected retry,
refresh-safe resume, duplicate-batch prevention), and responsive/tablet.

## Execution — PASSED (40/40 on a real runner)
All 40 scenarios were executed end-to-end through the real browser, routes,
cookies, server actions and UI on a developer machine (macOS, Node 24, Chromium
via Playwright) against the booted test-runtime app (`ZONO_CREATIVE_TEST_RUNTIME=true`,
no Supabase, no OpenAI, no Docker): **40 passed, 0 failed**.

Note on the authoring sandbox: the suite could not be *run* in the authoring
cloud sandbox because that sandbox force-kills the Next.js toolchain
(`next dev`/`next build` SIGTERM within seconds; a plain process and a minimal
Node HTTP server on the same port survive). Certification was therefore obtained
on a normal runner, which is the correct place for it.

Two defects surfaced during the real browser run and were fixed (this is exactly
what browser certification is for — the headless suite never exercised these
layers):
- **Origin/session (code+config):** the E2E hit `127.0.0.1` while the dev server's
  canonical origin is `localhost`, so the session cookie and server actions were
  treated cross-origin. Fixed by pinning the E2E to `localhost` and setting the
  test-session cookie directly on the browser context.
- **Test race (test):** four generation tests read "newest output" before the
  list refreshed and captured a stale row. Fixed to wait for the new output by
  content and to verify idempotency by a stable output count.

After both fixes: **40/40 green.**

## How to certify (normal runner / CI)
Locally:
```bash
npm ci
bash scripts/creative-lab-e2e.sh          # boots the test-runtime app, runs all 40
```
On CI: `.github/workflows/creative-lab-ci.yml` runs the full verification
(TypeScript, ESLint, use-server guard, the 338-assertion suites, `next build`)
and the **40-scenario browser E2E** on `ubuntu-latest` — where Next.js is not
force-killed — on every push / PR / manual dispatch, uploading Playwright traces
on failure. Pushing the branch therefore produces the browser certification
automatically. On any machine where Next.js is not reaped, the suite runs
end-to-end. For each failure Playwright captures screenshot, trace, console and
network (`trace: retain-on-failure`); triage by the classification table in
EXTERNAL_RUNTIME_FINAL_REPORT.md.

Note: the CI workflow is authored here but, like the E2E itself, could not be
executed in the authoring sandbox; confirm the first run's output (particularly
the `next build` step) on the real runner.

## Equivalent executed proof (this sandbox)
The server actions are thin wrappers over the Next-free
`src/lib/creative-runtime/lab-flows.ts`; `lab-flows.qa.ts` executes the identical
generation / lifecycle / eligibility / idempotency / org-isolation / bulk
behavior headlessly — **36 assertions, 0 failed**. The only unexecuted layer is
the browser DOM/cookie transport; the business logic is executed and verified.

**Verdict: Browser Certification PASSED — all 40 scenarios executed end-to-end
through the real browser on a normal runner (40 passed, 0 failed).**
