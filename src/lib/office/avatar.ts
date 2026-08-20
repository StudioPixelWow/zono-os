// ============================================================================
// ZONO — Office agent avatar resolution (PURE, client-safe, unit-testable).
// Resolution order (spec): explicit office_members avatar → linked Auth user's
// avatar → null (the UI then renders the initials fallback — never a broken
// image). Also the canonical initials helper used by the fallback everywhere an
// agent appears in the manager workspace.
// ============================================================================
export function resolveAgentAvatar(src: { avatarUrl?: string | null; linkedUserAvatarUrl?: string | null }): string | null {
  const own = src.avatarUrl?.trim();
  if (own) return own;
  const linked = src.linkedUserAvatarUrl?.trim();
  if (linked) return linked;
  return null;
}

export function agentInitials(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")) || "?";
}
