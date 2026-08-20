// ============================================================================
// ZONO — Public office-site property → responsible-member attribution (PURE,
// unit-testable). Precedence: office_member_id (when it is a PUBLIC in-org
// member) → legacy owner_id mapped to a public linked member → null (office
// contact). A private/internal or cross-org member NEVER resolves, so it can
// never be exposed on the public site.
// ============================================================================
export function resolveResponsibleMemberId(
  p: { office_member_id: string | null; owner_id: string | null },
  publicMemberIds: ReadonlySet<string>,
  memberIdByUserId: ReadonlyMap<string, string>,
): string | null {
  if (p.office_member_id && publicMemberIds.has(p.office_member_id)) return p.office_member_id;
  if (p.owner_id) { const mid = memberIdByUserId.get(p.owner_id); if (mid) return mid; }
  return null;
}
