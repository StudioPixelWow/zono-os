# ZONO — Observability Minimum Report

## Current: NONE (confirmed) — no Sentry/captureException in the repo; errors are console.error only.

## Designed event schema (to implement)
Emit structured security/ops events for: authorization_denied, inactive_membership_attempt, cross_tenant_access_attempt, signed_document_failure, storage_object_mismatch, staging_migration_failure, service_role_authz_failure, import_failure, background_job_failure, repeated_retries, cron_missed_stale, unexpected_unscoped_record.
Safe fields only: request_id, actor_id, organization_id, route/operation, error_class, timestamp, environment.
**Never log:** tokens, secrets, document bodies, full message content, passwords, unnecessary PII.

The org-scope + file-access layers already RETURN stable deny reasons (`cross_tenant_denied`, `inactive_member`, `path_mismatch`, …) — the emitter just needs to forward these to the sink.

## Provider/infrastructure: NOT provisioned
Requires choosing + wiring a sink (Sentry / Logtail / Supabase logs) — infra + credentials the owner provides. Until then, failure classes are unmonitored.

## Incident-verification checklist (delivered in ZONO_SECURITY_RUNBOOK.md)
tenant leak · public doc exposure · failed identity migration · failed import · stuck job · compromised credential.
