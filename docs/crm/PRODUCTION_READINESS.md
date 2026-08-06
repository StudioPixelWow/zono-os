# ZONO — Production Readiness

**Verdict: ❌ Not Ready for Production** (and not yet Staging). Evidence-based; see RUNTIME_EVIDENCE / SECURITY_VERIFICATION / PERFORMANCE_REPORT.

## Hard blockers
1. Schema/code drift — Epic 3 migrations unapplied on the live DB (runtime 500s on new features).
2. Document privacy — `documents` storage bucket is public.
3. No reproducible migration pipeline (schema_migrations 10 vs 476 tables).
4. Zero runtime journey / E2E / isolation-breach / load evidence.

## Pre-production backlog (after blockers)
- Performance: index the 435 unindexed FKs that matter; fix 68 auth_rls_initplan policies; drop duplicate/unused indexes; consolidate 384 multiple-permissive policies.
- Security hardening: set function `search_path`; review anon-executable SECURITY DEFINER RPCs; enable leaked-password protection; move extensions out of public.
- Ops: backups/restore drill, monitoring/alerting, staging→prod migration promotion, secret rotation (the OpenAI/Supabase keys pasted in chat earlier should be rotated).

## Sequence to a promotable verdict
Staging fixes (blockers 1–3) → runtime evidence (Phase 3/4/7 on staging) → performance/security backlog → soak → production with rollback. Only escalate the verdict on that runtime evidence.
