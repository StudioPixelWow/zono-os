// Account-status enforcement (P5.3). PURE, shared by the session guard and QA.
// A user whose org status is suspended/disabled must be blocked from the app —
// previously `users.status` was never checked at runtime, so suspension was
// cosmetic. This is the single source of truth for "is this account blocked".
export function isBlockedAccountStatus(status: string | null | undefined): boolean {
  return status === "suspended" || status === "disabled";
}
