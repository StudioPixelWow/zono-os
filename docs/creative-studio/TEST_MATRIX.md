# Test Matrix

## Implemented & passing (this environment)
- **Unit (52 assertions, `visual-gen-extensions.qa.ts`, `npx tsx`):** model config + validation; retry classification (429/502/503/timeout transient; 400/401/safety/unsupported not) + backoff + runner; brand resolution precedence/approval/fallback; creative kinds + market-stat sourcing; lineage round/root/immutability/restore/order; usage redaction + honest cost basis; logo placement/contrast/safe-zone; platform sizes/aspect.
- **TypeScript:** strict `tsc` over all new/changed modules → clean.

## Authored design / deferred (need your environment)
- **Integration:** content-item→generation, brand→resolved creative, per-kind generation, QA-failure→retry, refinement lineage, approval, scheduling/publication handoff, analytics feedback — pending orchestration service + a DB/storage runtime.
- **Browser E2E (15 scenarios):** generate property/agent/office/market creatives, compare, refine, approve/reject, all platform sizes, schedule, unapproved-cannot-publish, org-B isolation, private-draft-URL denial, bulk partial-failure+retry, Hebrew/phone/price/logo integrity — require the app + mock provider wired into Playwright.
- **Live provider smoke test:** requires `OPENAI_API_KEY` + explicit cost cap — **configuration-blocked here.**
- **Storage cross-org tests:** require the signed-storage runtime (deferred).
