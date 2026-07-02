// ============================================================================
// 🧭 Customer Journey — identity resolution (pure). 28.5. Part 1.
// Union-find over normalized contacts (phone/email) + explicit conversion links
// (lead → converted buyer/seller). One person is ONE customer with multiple
// members — never duplicated. Evidence-only.
// ============================================================================
export type MemberKind = "lead" | "buyer" | "seller";
export interface IdentityEntry {
  kind: MemberKind; id: string; name: string;
  contacts: string[];                          // normalized phone/email
  links: { kind: MemberKind; id: string }[];   // explicit same-person links
}
export interface CustomerGroup { members: { kind: MemberKind; id: string; name: string }[] }

const nodeKey = (kind: MemberKind, id: string) => `${kind}:${id}`;

export function resolveCustomers(entries: IdentityEntry[]): CustomerGroup[] {
  const parent = new Map<string, string>();
  const meta = new Map<string, { kind: MemberKind; id: string; name: string }>();
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; let c = x; while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; } return r; };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  for (const e of entries) { const k = nodeKey(e.kind, e.id); if (!parent.has(k)) parent.set(k, k); meta.set(k, { kind: e.kind, id: e.id, name: e.name }); }

  // Union by shared contact.
  const byContact = new Map<string, string[]>();
  for (const e of entries) for (const c of e.contacts) if (c) (byContact.get(c) ?? byContact.set(c, []).get(c)!).push(nodeKey(e.kind, e.id));
  for (const keys of byContact.values()) for (let i = 1; i < keys.length; i++) union(keys[0], keys[i]);

  // Union by explicit links (only when the linked node exists).
  for (const e of entries) for (const l of e.links) { const lk = nodeKey(l.kind, l.id); if (parent.has(lk)) union(nodeKey(e.kind, e.id), lk); }

  const groups = new Map<string, CustomerGroup>();
  for (const k of parent.keys()) { const r = find(k); const g = groups.get(r) ?? { members: [] }; const m = meta.get(k); if (m) g.members.push(m); groups.set(r, g); }
  return [...groups.values()];
}
