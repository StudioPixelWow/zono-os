// ZONO — Customer 360 · Users tab (P5.3). Read for all operators; contextual
// user administration (invite/resend/activate/suspend/change role) ONLY when the
// operator holds platform.users.manage (super_admin). NO email/phone, no password
// ops, no delete. Seats shown from authoritative data only (no fabrication).
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getOrgUsersForPlatform } from "@/lib/platform-admin/server/dal";
import { getOrgSeatUsage, listOrgRolesForPlatform, listOrgInvitationsForPlatform } from "@/lib/platform-admin/server/user-admin";
import { operatorCan } from "@/lib/platform-admin/capabilities";
import { RestrictedPanel, EmptyPanel } from "@/components/platform-admin/customer360-ui";
import { PanelCard, StatusBadge, formatPlatformDate } from "@/components/platform-admin/ui";
import { OrgUserAdmin } from "@/components/platform-admin/OrgUserAdmin";
import { Icon } from "@/components/dashboard/Icon";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Customer360UsersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const operator = await authorizePlatform("platform.users.read");
  if (!operator) return <RestrictedPanel />;
  const { orgId } = await params;
  const canManage = operatorCan(operator, "platform.users.manage");
  const canImpersonate = operatorCan(operator, "platform.support.impersonate");

  const [{ users, roleDistribution, activeCount }, seats, roles, invitations] = await Promise.all([
    getOrgUsersForPlatform(orgId),
    getOrgSeatUsage(orgId),
    canManage ? listOrgRolesForPlatform(orgId) : Promise.resolve([]),
    canManage ? listOrgInvitationsForPlatform(orgId) : Promise.resolve([]),
  ]);

  return (
    <div className="flex flex-col gap-5">
      {/* Seat + summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SeatStat label="פעילים" value={activeCount} icon="UserCheck" />
        <SeatStat label="הוזמנו" value={seats.invitedUsers} icon="UserPlus" />
        <SeatStat label="הזמנות ממתינות" value={seats.pendingInvites} icon="Send" />
        <SeatStat label="מושבים" value={seats.seatLimitDefined ? seats.seatLimit : null} icon="Users" naNote={seats.seatLimitDefined ? undefined : "לא מוגדר"} />
      </div>
      {roleDistribution.length ? (
        <div className="flex flex-wrap gap-2">
          {roleDistribution.map((r) => (
            <span key={r.role} className="border-line text-muted inline-flex items-center gap-1.5 rounded-xl border bg-surface px-3 py-1.5 text-[12px] font-semibold">
              {r.role}<span className="text-ink font-black">{r.count}</span>
            </span>
          ))}
        </div>
      ) : null}

      {users.length === 0 ? (
        <EmptyPanel icon="Users" note="אין משתמשים בארגון זה" />
      ) : canManage ? (
        <OrgUserAdmin orgId={orgId} users={users} roles={roles} invitations={invitations} canImpersonate={canImpersonate} />
      ) : (
        <PanelCard title={`משתמשים (${users.length})`} icon="Users">
          <ul className="divide-line divide-y">
            {users.map((u) => (
              <li key={u.id} className="grid grid-cols-1 gap-1 px-2 py-2.5 sm:grid-cols-[1.6fr_1fr_0.8fr_0.9fr] sm:items-center sm:gap-3">
                <span className="text-ink inline-flex items-center gap-2 text-[13.5px] font-bold">
                  <span className="text-muted bg-surface grid h-7 w-7 shrink-0 place-items-center rounded-full"><Icon name="UserCircle" size={15} /></span>{u.name || "—"}
                </span>
                <span className="text-muted text-[12.5px] font-semibold">{u.roleName || u.roleKey || "—"}</span>
                <span><StatusBadge status={u.status} /></span>
                <span className="text-muted flex items-center justify-between gap-2 text-[12px]">
                  {u.lastSeenAt ? formatPlatformDate(u.lastSeenAt) : "—"}
                  {canImpersonate && u.status !== "suspended" && u.status !== "disabled" ? (
                    <Link href={`/platform/support-view/${orgId}/${u.id}`} title="צפייה במערכת כמשתמש" className="border-line text-brand inline-flex h-7 items-center justify-center rounded-lg border px-2 font-bold"><Icon name="ShieldCheck" size={13} /></Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-muted mt-2 px-1 text-[11px]">ניהול משתמשים (הזמנה/השעיה/תפקיד) זמין ל-Super Admin בלבד.</p>
        </PanelCard>
      )}

      {!seats.seatLimitDefined ? (
        <p className="text-muted px-1 text-[11px]">מגבלת מושבים אינה מוגדרת באופן סמכותי עבור ארגון זה — לא נאכפת מגבלה על הזמנות.</p>
      ) : null}
    </div>
  );
}

function SeatStat({ label, value, icon, naNote }: { label: string; value: number | null; icon: string; naNote?: string }) {
  return (
    <div className="border-line bg-card rounded-2xl border p-3">
      <span className="text-muted bg-surface grid h-8 w-8 place-items-center rounded-lg"><Icon name={icon} size={15} /></span>
      <p className="text-ink mt-2 text-2xl font-black tabular-nums leading-none">{value === null ? (naNote ? <span className="text-muted text-base">{naNote}</span> : "—") : new Intl.NumberFormat("en-US").format(value)}</p>
      <p className="text-muted mt-1 text-[12px] font-semibold">{label}</p>
    </div>
  );
}
