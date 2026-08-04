# Single Creative Workspace — Final

Route: **`/creative-lab`** (Hebrew, RTL). A production-safe, test-runtime-gated
surface. It is **not** the production `/creative-studio` launcher (untouched) —
the lab lives outside the authenticated `(app)` group and **404s** whenever the
test runtime is not enabled (`labEnabled()` → `notFound()`), so it is never
reachable in production/staging.

## Why a separate route
The production `(app)` layout enforces real Supabase auth (redirects to `/login`
without a session). The deterministic workspace must run with **no** Supabase, so
it uses its own top-level route tree with a test-session cookie instead of real
auth. This keeps the change strictly additive — no production page is modified.

## Files
- `src/app/creative-lab/layout.tsx` — guard + RTL shell + fixture-login chips.
- `src/app/creative-lab/page.tsx` + `WorkspaceView.tsx` — the workspace.
- `src/app/creative-lab/session/route.ts` — deterministic test "login" (sets the
  session cookie, guarded, 404 outside the test runtime).
- `src/app/creative-lab/actions.ts` — thin `"use server"` wrappers.
- `src/lib/creative-runtime/lab-flows.ts` — the Next-free flow logic.

## Flow
Sign in as a fixture user → choose a creative **kind** (property ad, sold,
testimonial, agent brand, office brand, market stat) → enter a prompt →
**generate** (persists in `review`) → the org's outputs list renders with per-row
**approve / reject / schedule / publish**. Every real rule is enforced through the
same `CreativeContentService`:
- inactive / anonymous users cannot generate;
- publish and schedule are blocked before approval (publish eligibility);
- a qa_failed output cannot be approved;
- identical (kind + prompt) generation is idempotent (no duplicate);
- publishing twice is idempotent (stays `published`);
- outputs are strictly organization-scoped.

## Verification
Executed headlessly (same logic, no browser) in
`src/lib/creative-runtime/lab-flows.qa.ts` — **36 assertions, 0 failed** — and
authored as browser scenarios in the E2E suite (see BROWSER_E2E_FINAL.md).
