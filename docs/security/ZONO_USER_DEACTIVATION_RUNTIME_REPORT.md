# ZONO — User Deactivation Runtime Report

## Implemented (enforced in the write boundary + file access)
`org-scope.authorizeWrite` returns `inactive_member` deny for any non-active actor (13 tests); `file-access.authorizeFileAccess` inherits it (17 tests). So any write/file access routed through the boundary already blocks inactive members.

## Required app-wide guard (design → wire; BLOCKED on runtime proof)
Active-membership check server-side at: session bootstrap / (app) layout, server actions, API routes, signed file access, service-role wrappers, import ops, automation actions, user-triggered background jobs, routing/assignment. Today the layout checks onboarding only — add `status='active'` check.

## Tests to run (unit portion done; app-route portion needs staging)
active owner/manager/agent → allow; inactive owner/manager/agent → deny; removed member → deny; session active before deactivation → next server action denies; direct route/API/signed-URL after deactivation → deny; background action queued before deactivation → deny at execution. Historical attribution preserved (never erase departed actor).

## Status
Boundary-level enforcement: **implemented + tested**. App-wide guard wiring + route/session runtime tests: **blocked on staging + a running app**.
