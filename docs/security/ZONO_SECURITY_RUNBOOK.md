# ZONO — Security & Operations Runbook

## Observability to implement
Server error capture (add Sentry/`captureException` — currently absent); failed-job + cron health monitoring (`engine_runs`, `*_refresh_runs`, kernel-drain); automation + import monitoring; unauthorized-access + repeated-permission-failure logging (emit `org-scope` deny reasons); document-access failures; request IDs + actor IDs + org IDs on every log line; safe user-facing error messages + detailed internal diagnostics.
**Never log:** document contents, passwords, tokens, full sensitive identifiers (ת"ז), unnecessary message bodies.

## Incident procedures
- **Suspected tenant leak:** freeze the suspected service-role write site; run the two-org isolation suite; grep logs for cross-org `org-scope` denies that were bypassed; rotate affected data; notify.
- **Public document exposure:** apply the privatize migration on staging→prod after deploying the signed-URL read path; enumerate `documents.file_url` public paths; treat shared URLs as exposed; re-key sensitive docs.
- **Failed identity migration:** it is additive — drop `person_id` columns + persons/person_roles; originals intact; re-run resolver dry-run; fix clusters; retry.
- **Failed import:** mark batch `failed`; run rollback (remove batch-created records if unchanged); deliver the row-level error file (private); no partial commit left dangling.
- **Stuck background job:** inspect `zono_orchestrator_locks`/`engine_runs`; clear stale lock; kernel-drain is idempotent (safe to re-run).
- **Compromised integration credential:** revoke in provider; null the row in `*_connections`/`social_connection_vault`; rotate; audit usage window.
