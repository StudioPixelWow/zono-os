# Content Orchestration (ZONO-native, design + seam)

**Status: contract designed; service implementation deferred (honest gap).**

New service (outside creative-studio), e.g. `src/lib/content-orchestration/creative-content-service.ts`, coordinates existing systems without duplicating them:

`Campaign/Calendar content item → build creative brief → call creative-studio → variants → QA → review → approve → schedule → publish via existing distribution/meta subsystem → publication result → performance → learning signal`.

Reuses: organizations, brand profiles, campaigns (`zono_campaigns`), distribution tables, Meta publishing, approvals, tasks, timeline, `usage_events`, storage, permissions. **No parallel models.**

Responsibilities: resolve content item, resolve brand identity (via `brand-asset-resolver`), resolve linked property/agent/office/market insight, construct approved creative input, call the engine, persist output links, request review, approve, schedule, hand approved outputs to publishing, persist publication result, connect performance feedback.

Not implemented this turn; the brand resolver + creative-kinds + provider interface are the stable contracts it will build on.
