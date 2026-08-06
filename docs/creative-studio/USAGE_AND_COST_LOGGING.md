# Usage & Cost Logging

`usage-logging.ts` → existing `usage_events` table (no new billing model). One redacted event per generation/edit/retry/refinement/variant/QA op.

**Recorded:** org id, actor id, campaign/content-item/creative-request/output ids, provider, model, operation, input/output image counts, dimensions, duration, attempt, retry reason, QA result, provider usage fields (when returned), success, safe error class, timestamp.

**Never logged:** API keys, secrets, `authorization`, full/sensitive prompts, personal data, binary image bytes. `redact()` drops sensitive keys and oversized strings (e.g. base64).

**Cost honesty:** `cost.basis ∈ {provider_reported, estimated, unavailable}`. An exact `cost_usd` is written only for `provider_reported`/`estimated`; `unavailable` → null. Costs are never invented. `writeUsageEvent` is best-effort and never blocks generation. Pure `buildUsageEvent` + redaction are unit-tested.
