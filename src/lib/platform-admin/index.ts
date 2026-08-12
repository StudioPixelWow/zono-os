// ============================================================================
// ZONO — PLATFORM ADMIN barrel (PURE re-exports only).
// ----------------------------------------------------------------------------
// Deliberately re-exports ONLY the pure capability layer so offline dev-checks
// (scripts/platform-admin-dev-check.ts) can import from `@/lib/platform-admin`
// WITHOUT pulling any server-only module. The server-only guard/DAL/audit live
// under `./server/*` and must be imported directly by server code, never via
// this barrel and never from a client component.
// ============================================================================
export * from "./capabilities";
