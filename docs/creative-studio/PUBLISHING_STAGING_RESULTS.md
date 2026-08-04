# Publishing Staging — Results

## Status: NOT TESTED live (deployment/credentials blocker); mock path verified
The publishing handoff is implemented and verified through `MockPublishingProvider`
in the orchestration suites (`runtime.qa.ts` 34/0 and `lab-flows.qa.ts` 36/0):
only-approved scheduling, correct platform variant, idempotent no-duplicate
publication, provider confirmation persisted, transient failure + retry, permanent
failure surfaced without looping, and publication ↔ output ↔ content-item linkage.

A **live** staging publishing run (real distribution/Meta staging adapter, or the
real orchestration with `MockPublishingProvider` in a **deployed** staging app)
requires a deployed environment and/or provider credentials, neither available
here.

**Classification: deployment + credentials/configuration blocker** (not code).

## Procedure (controlled staging destination only — never a real customer page)
Run the orchestration publish path in the deployed staging app and verify:
- only approved output schedules; unapproved scheduling blocked;
- correct platform variant selected;
- idempotency prevents duplicate publication (re-dispatch returns the existing
  publication);
- provider confirmation stored;
- failure state visible; retry works; permanent error does not loop;
- publication links to output and content item.

## Evidence already captured (mock, executed)
- publish-before-approve → `PublishEligibilityError` (blocked);
- approve → publish → `published`; re-publish → idempotent `published` (no dup);
- transient marker retries to success; permanent marker surfaces without loop.

**Result: mock publishing path fully green; live/deployed run pending a staging destination.**
