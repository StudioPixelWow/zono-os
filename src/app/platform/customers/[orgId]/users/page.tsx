// ZONO — Customer 360 · Users tab (P5.2). READ-ONLY org user directory: name,
// role, status, joined, last-seen. NO email/phone (privacy boundary preserved
// from P5.0/P5.1). No role editing / reset / delete (P5.3). Cap: platform.users.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getOrgUsersForPlatform } from "@/lib/platform-admin/server/dal";
import { RestrictedPanel, EmptyPanel } from "@/components/platform-admin/customer360-ui";
import { PanelCard, StatusBadge, formatPlatformDate } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

export default async function Customer360UsersPage({ params }: { params: Promise<{ orgId: string }> }) {
  const operator = await authorizePlatform("platform.users.read");
  if (!operator) return <RestrictedPanel />;
  const { orgId } = await params;
  const { users, roleDistribution, activeCount } = await getOrgUsersForPlatform(orgId);

  if (users.length === 0) return <EmptyPanel icon="Users" note="אין משתמשים בארגון זה" />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="border-line bg-card text-ink inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] font-bold">
          <Icon name="Users" size={15} className="text-brand" />{activeCount} פעילים · {users.length} סה״כ
        </span>
        {roleDistribution.map((r) => (
          <span key={r.role} className="border-line text-muted inline-flex items-center gap-1.5 rounded-xl border bg-surface px-3 py-2 text-[12px] font-semibold">
            {r.role}<span className="text-ink font-black">{r.count}</span>
          </span>
        ))}
      </div>

      <PanelCard title={`משתמשים (${users.length})`} icon="Users">
        <div className="border-line text-muted hidden grid-cols-[1.6fr_1fr_0.8fr_0.9fr_0.9fr] gap-3 border-b px-2 pb-2 text-[11px] font-bold sm:grid">
          <span>שם</span><span>תפקיד</span><span>סטטוס</span><span>הצטרף</span><span>נראה לאחרונה</span>
        </div>
        <ul className="divide-line divide-y">
          {users.map((u) => (
            <li key={u.id} className="grid grid-cols-1 gap-1 px-2 py-2.5 sm:grid-cols-[1.6fr_1fr_0.8fr_0.9fr_0.9fr] sm:items-center sm:gap-3">
              <span className="text-ink inline-flex items-center gap-2 text-[13.5px] font-bold">
                <span className="text-muted bg-surface grid h-7 w-7 shrink-0 place-items-center rounded-full"><Icon name="UserCircle" size={15} /></span>
                {u.name || "—"}
              </span>
              <span className="text-muted text-[12.5px] font-semibold">{u.roleName || u.roleKey || "—"}</span>
              <span><StatusBadge status={u.status} /></span>
              <span className="text-muted text-[12px]">{u.createdAt ? formatPlatformDate(u.createdAt) : "—"}</span>
              <span className="text-muted text-[12px]">{u.lastSeenAt ? formatPlatformDate(u.lastSeenAt) : "—"}</span>
            </li>
          ))}
        </ul>
      </PanelCard>
    </div>
  );
}
