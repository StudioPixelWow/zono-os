# Local Runtime Architecture

Deterministic, credential-free local runtime that proves the workflow with mocks + local adapters. Same interfaces switch to OpenAI/Meta/Supabase without changing business logic.

## Layers
- **creative-studio (engine, unchanged):** brief, direction, generation, deterministic Hebrew composition, QA, variants, approvals.
- **Providers (swappable):** `ImageProvider` (Mock/OpenAI), `PublishingProvider` (Mock + distribution/Meta seam), `AssetStorage` (`LocalPrivateStorage` + Supabase adapter seam).
- **Orchestration (ZONO-native, outside creative-studio):** `src/lib/content-orchestration/creative-content-service.ts` — content item → generate → QA → review → approve → schedule → publish → performance. Store-injected (`OrchestrationStore`): in-memory for tests, Supabase for runtime.
- **Persistence:** additive migration `20270401120000_creative_runtime_persistence.sql` — lineage columns on `zono_quick_creative_outputs` + `creative_publications` + `creative_performance` (org-scoped, RLS, FKs, idempotency uniques).

## Determinism & idempotency
Mock providers are deterministic (markers in the idempotency key drive transient/permanent/duplicate). Orchestration is idempotent per key for generation and per (output, platform) for publication — repeated refresh/retry/job runs never duplicate records.

## What runs locally today
Generation (mock) → output+usage+lineage persist (in-memory store) → approve → publish (mock, idempotent, eligibility-gated) → publication persist → mock performance → evidence-gated feedback. Verified by 34 integration assertions.
