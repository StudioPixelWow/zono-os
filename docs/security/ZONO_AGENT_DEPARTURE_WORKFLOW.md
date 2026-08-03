# ZONO — User Deactivation & Agent Departure Workflow

## Deactivation enforcement (server-side)
An inactive/removed member must not: log into protected surfaces, keep an active session, read/write org records, receive lead assignments, remain routing-eligible, execute automations, receive notifications, or access private documents. Enforcement points:
- **Guard:** `(app)/layout.tsx` + middleware check `membership.status === 'active'` server-side (today it checks onboarding only).
- **Write boundary:** already enforced — `org-scope.authorizeWrite` returns `inactive_member` deny for any non-active actor (13-test covered).
- **Routing/automation/notifications:** filter recipients on `status='active'`.

## Departure & record transfer (preview-before-execute)
Separate **historical actor** (immutable attribution) from **current owner** (transferable). Transfer, per selected replacement owner: contacts/persons, leads, buyers, sellers, properties, tasks, appointments, deals, opportunities, automation ownership. Preserve timeline/attribution (never erase the departed agent from history). Prevent orphans (a record must always have a valid active owner).

### Sequence
1. Manager selects departing user + replacement owner (manager-gated: `requiresManager`).
2. **Preview** — count records to transfer per entity; list any that cannot transfer (e.g., replacement lacks territory); no writes yet.
3. Execute in a transaction: update `owner_id`/`assigned_agent_id` → replacement; keep `created_by`/historical actor unchanged; write a `person_merge_log`-style audit row per transfer; emit a domain event.
4. Deactivate the user (`status='disabled'`); sessions invalidated.
5. Report: transferred counts + any skipped, with reasons.

### Data model
Add `records_transferred` audit (org, departing_user, replacement, entity, count, actor, timestamp). Reversible within a window (store prior owner). No hard deletes.

Status: **designed**; deactivation deny already enforced in the write boundary; transfer executor + preview are build items (backlog CRM-P0-003).
