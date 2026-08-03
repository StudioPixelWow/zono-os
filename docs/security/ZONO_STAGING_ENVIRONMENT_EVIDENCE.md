# ZONO — Staging Environment Evidence

## Status: NO STAGING ENVIRONMENT AVAILABLE IN THIS SESSION.
The only Supabase project reachable here is the **production** project (`tlref…aos`, backing `zono-os-ro2s.vercel.app`). Per the mandate ("Never apply to production"), **no migration, RLS, backfill, or destructive test was run.** Creating a Supabase staging branch incurs cost on the owner's account and is a decision for the owner — it was not performed unilaterally.

## Required before Phase 3+ can produce runtime evidence
A dedicated staging target proving it is NOT production:
- staging project ref (must differ from the production ref)
- isolated database URL / Supabase URL
- storage isolated (separate buckets)
- auth users isolated
- cron/integrations disabled; email/WhatsApp sending disabled
- representative ANONYMIZED dataset (no real PII)
- production service-role keys ABSENT

## Environment safety guard (designed — apply on staging)
A pre-flight assertion in the migration/test runner that **aborts** when the target project ref or DB URL matches the production ref:
```
if (targetRef === PROD_REF) throw new Error("refuse: target is production");
```
This guard must gate every migration/destructive-test command. Delivered as a design; wire into the runner once a staging ref exists.

## What CAN proceed without staging (and was done)
Patch apply on an isolated git worktree, TypeScript checks, unit tests, static service-role scan, and all code/migration/doc authoring. DB-runtime proof cannot.
