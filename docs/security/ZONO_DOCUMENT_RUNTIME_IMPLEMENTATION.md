# ZONO — Document Runtime Implementation

## Implemented (code + tests)
`src/lib/security/file-access.ts` (17 tests): `authorizeFileAccess` (active membership + same-org + record permission + path-matches-stored-record; client-supplied path can never widen access), `isSafeObjectPath` (rejects traversal/cross-org/unknown-bucket), `validateUpload` (MIME + extension blocklist + size + name sanitize), `buildObjectPath` (server-generated org/record-prefixed path). Deny-by-default with stable reasons.

## Required read flow (design → wire)
auth request → active membership → resolve related CRM record → resolve org ownership → check role+record permission (authorizeFileAccess) → validate requested path == stored path → generate short-lived signed URL → return only that URL → log decision (no content). **The client never passes an arbitrary bucket/path.**

## Required upload flow (design → wire)
org from membership → server-generated path (buildObjectPath) → validate MIME/extension/size → sanitize display name (store original separately) → store org id + record id + uploader id + checksum → reject traversal/executables.

## Staging conversion order (BLOCKED — needs staging bucket)
1. deploy signed read path 2. deploy authorized upload 3. verify all readers use it 4. verify no UI depends on public URLs 5. privatize staging bucket 6. run access tests 7. verify expired URLs 8. verify direct-URL denial. **Do not privatize before the read flow is live.**

## Status
Authorization + validation core: **implemented + tested**. Signed-URL issuance + reader wiring + bucket privatization: **blocked on staging** (and on deploying the read path before flipping buckets). Production buckets remain public until then — **open P0**.
