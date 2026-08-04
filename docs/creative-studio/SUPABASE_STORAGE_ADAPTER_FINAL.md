# Supabase Private-Storage Adapter — Final

`src/lib/creative-studio/storage/supabase-private-storage.ts` implements the same
`AssetStorage` contract as `LocalPrivateStorage`, over a **narrow injected
client seam** (`SupabaseStorageClient` + `AssetMetaStore`) so it is fully
contract-tested with a mock client — **no Docker, no live Supabase**.

## Security model
- Internal assets live in a **private** bucket (`creative-private`); publications
  in `creative-published`.
- Paths are org-scoped and server-generated; `isValidOrgPath` blocks traversal
  and cross-org paths.
- Uploads validate extension, MIME and size (≤25 MB; png/webp/jpeg).
- `authorize()` denies anonymous, inactive, cross-organization, and arbitrary-path
  access.
- `createSignedRead` issues only **short-lived** signed URLs (TTL capped at 300s)
  and **refuses to sign** `qa_failed` / `archived` assets (rejected at signing
  time — the earliest point).
- `promoteApprovedAsset` copies only `approved`/`scheduled` assets to the
  publication bucket and **retains the private master**.
- `getAuthorizedAsset` / `resolveSignedRead` intentionally throw: bytes are
  streamed by Supabase Storage via the signed URL, not by the adapter.

## Shared contract (both adapters)
`src/lib/creative-studio/storage/storage-contract.qa.ts` runs one contract
against **both** `LocalPrivateStorage` and `SupabasePrivateStorage` (backed by an
in-memory mock storage client + mock meta store). It asserts ownership, owner
signed-read, and denial of anonymous / inactive / cross-org / arbitrary-path /
qa_failed access; approved promotion with master retention; draft-not-promotable;
and (Supabase-specific) MIME + oversize rejection.

`LocalPrivateStorage.createSignedRead` was aligned to reject `qa_failed`/`archived`
at signing time so both adapters honor the identical contract.

## Result
`storage-contract.qa.ts`: **24 assertions, 0 failed** across both adapters.

## Remaining external step
Wiring `SupabasePrivateStorage` to a **real** Supabase Storage client and proving
it against a live bucket requires Supabase credentials / a local Supabase stack
(Docker). The adapter and its contract are complete; only the live-bucket smoke
is external.
