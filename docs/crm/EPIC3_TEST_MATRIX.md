# Epic 3 — Test Matrix

Current automated coverage: none for CRM Epic 3 (one unrelated Playwright spec: e2e/creative-lab). This is the primary remaining gap (Part 20).

Required (not yet implemented) E2E flows: create lead→qualify; convert lead→buyer; edit buyer requirements; review match; schedule viewing; complete viewing+feedback; create offer; counter; accept; create deal; advance deal; create commission; record partial collection; person timeline shows all events; cross-org URL denied; inactive user denied; optimistic-lock conflict; mobile field workflow.

Manual verification done: tsc --noEmit 0 errors and eslint 0 warnings on every delivered slice; migrations are additive + idempotent with privilege-guarded RLS.

Recommended next: vitest component tests (loading/empty/error/permission/RTL/validation) + Playwright E2E for the flows above + isolation tests (Alpha/Beta org).
