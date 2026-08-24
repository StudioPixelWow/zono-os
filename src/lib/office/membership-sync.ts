// ============================================================================
// ZONO 9.2 — TEAM TRUTH · office-membership sync (server-only, canonical).
// ONE coherent link between ACCESS truth (`users`, the billing seat source) and
// the OFFICE ROSTER (`office_members`, the public/board profile). It never makes
// office_members a billing counter — seats stay `users.status='active'`. It only
// keeps the roster in step with access at the canonical mutation seams:
//   • ensureOfficeMemberForUser        — accepted invite / new owner → linked member
//   • propagateAccessStatusToMember    — suspend → inactive · reactivate → active
//   • reconcileOfficeMembershipForOrg  — bounded, idempotent backfill of existing drift
// Rules: idempotent, strictly org-scoped (never cross-tenant), non-destructive
// (never deletes; never forces a manually-hidden member back to public), and it
// NEVER fabricates profile data (bio/specialty/avatar/phone/areas) — only the
// user's real id/email/name and the mapped role, and `show_on_website` stays the
// manager's manual opt-in.
// ============================================================================
import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { rosterRole, memberStatusForAccess, planOfficeReconcile } from "./membership-rules";

type Db = ReturnType<typeof createServiceRoleClient>;
const MEMBER = "office_members";

const isDup = (msg: string | undefined) => /duplicate|unique/i.test(msg ?? "");

/**
 * Ensure an ACTIVE access user has exactly ONE linked office_members row in this org.
 * Idempotent + org-scoped. Order: (1) already linked → no-op; (2) an UNLINKED
 * email-matched roster row exists → link exactly one; (3) else insert a fresh ACTIVE
 * roster row from real fields only (not public). The unique (org_id,user_id) index
 * makes a racing insert a benign duplicate.
 */
export async function ensureOfficeMemberForUser(
  db: Db,
  m: { orgId: string; userId: string; email: string | null; fullName: string | null; roleKey?: string | null },
): Promise<"exists" | "linked" | "created"> {
  // 1 — already linked?
  const { data: existing } = await db.from(MEMBER as never)
    .select("id").eq("org_id", m.orgId).eq("user_id", m.userId).limit(1).maybeSingle();
  if ((existing as { id: string } | null)?.id) return "exists";

  // 2 — link ONE unlinked, email-matched roster row (org-scoped, only when unlinked).
  const email = (m.email ?? "").trim().toLowerCase();
  if (email) {
    const { data: cand } = await db.from(MEMBER as never)
      .select("id").eq("org_id", m.orgId).is("user_id", null).ilike("email", email).limit(1).maybeSingle();
    const candId = (cand as { id: string } | null)?.id;
    if (candId) {
      const { error } = await db.from(MEMBER as never)
        .update({ user_id: m.userId } as never).eq("id", candId).eq("org_id", m.orgId);
      if (!error) return "linked";
      if (!isDup(error.message)) throw new Error(error.message);
      return "exists"; // lost a race → a row now exists for this user
    }
  }

  // 3 — insert a fresh roster row. Real fields only; ACTIVE; NOT public by default.
  const { error } = await db.from(MEMBER as never).insert({
    org_id: m.orgId, user_id: m.userId,
    full_name: (m.fullName ?? "").trim() || (email ? email.split("@")[0] : "סוכן"),
    email: m.email ?? null, role: rosterRole(m.roleKey), status: "active", show_on_website: false,
  } as never);
  if (error && !isDup(error.message)) throw new Error(error.message);
  return "created";
}

/**
 * Propagate an access-status change to the linked roster row so public + board
 * visibility follows access truth: suspend → 'inactive' (dropped from the public
 * roster and the board's active list), reactivate → 'active'. Org+user scoped,
 * idempotent, non-destructive (never deletes; `show_on_website` is left untouched so
 * a reactivated user's public opt-in is preserved). No-op when there is no linked row.
 * NEVER touches billing — the seat count stays `users.status='active'`.
 */
export async function propagateAccessStatusToMember(db: Db, orgId: string, userId: string, active: boolean): Promise<void> {
  await db.from(MEMBER as never)
    .update({ status: memberStatusForAccess(active) } as never)
    .eq("org_id", orgId).eq("user_id", userId);
}

export interface ReconcileResult {
  orgId: string;
  activeUsersTotal: number;
  activeWithMember: number;
  activeWithoutMember: number;   // repaired: created + linked
  created: number;
  linked: number;
  suspendedUsers: number;
  suspendedPublicMember: number; // suspended users whose linked member was still active → hidden
  hidden: number;
  orphanMembers: number;         // linked members whose user no longer exists (reported, NOT deleted)
  duplicateLinks: number;        // >1 member per user_id (reported, NOT deleted)
  crossOrgMismatch: number;      // 0 by construction (every query is per-org)
}

/**
 * Bounded, idempotent, ORG-SCOPED reconciliation of the roster against access truth.
 * Repairs exactly two go-forward defects for EXISTING data:
 *   • ACTIVE user with no linked member  → ensure a member (link/create)
 *   • SUSPENDED user whose linked member is still 'active' → set 'inactive'
 * Non-destructive: never deletes; never forces a manually-inactive member of an
 * active user back to active (respects a deliberate manual hide); reports orphan /
 * duplicate / cross-org counts without mutating them. Bounded to 5000 rows/side
 * (an office is far smaller) — no unbounded scan.
 */
export async function reconcileOfficeMembershipForOrg(orgId: string): Promise<ReconcileResult> {
  const db = createServiceRoleClient();
  const [{ data: uRows }, { data: mRows }, { data: roleRows }] = await Promise.all([
    db.from("users").select("id,status,email,full_name,role_id").eq("org_id", orgId).limit(5000),
    db.from(MEMBER as never).select("id,user_id,status").eq("org_id", orgId).limit(5000),
    db.from("roles").select("id,key").eq("org_id", orgId),
  ]);
  const users = (uRows ?? []) as { id: string; status: string; email: string | null; full_name: string | null; role_id: string | null }[];
  const members = (mRows ?? []) as { id: string; user_id: string | null; status: string }[];
  const roleKeyById = new Map(((roleRows ?? []) as { id: string; key: string }[]).map((r) => [r.id, r.key]));
  const userById = new Map(users.map((u) => [u.id, u]));

  // PURE classification (convergence + idempotency are provable on this).
  const plan = planOfficeReconcile(users, members);

  let created = 0, linked = 0, hidden = 0;

  // ACTIVE user with no member → ensure one (link an email-matched row or create).
  for (const uid of plan.toEnsure) {
    const u = userById.get(uid); if (!u) continue;
    const r = await ensureOfficeMemberForUser(db, { orgId, userId: u.id, email: u.email, fullName: u.full_name, roleKey: u.role_id ? roleKeyById.get(u.role_id) ?? null : null });
    if (r === "created") created++; else if (r === "linked") linked++;
  }

  // SUSPENDED user with a still-active member → hide it (non-destructive).
  for (const uid of plan.toHide) { await propagateAccessStatusToMember(db, orgId, uid, false); hidden++; }

  const activeUsersTotal = users.filter((u) => u.status === "active").length;
  return {
    orgId,
    activeUsersTotal,
    activeWithMember: plan.activeWithMember,
    activeWithoutMember: created + linked,
    created, linked,
    suspendedUsers: users.length - activeUsersTotal,
    suspendedPublicMember: plan.toHide.length, hidden,
    orphanMembers: plan.orphanMembers, duplicateLinks: plan.duplicateLinks, crossOrgMismatch: 0,
  };
}
