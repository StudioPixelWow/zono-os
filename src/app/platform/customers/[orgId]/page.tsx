// ZONO — Platform Admin · Organization summary (P5.1). A minimal, public-safe
// org view via the audited DAL: identity + plan + a minimal user roster (name /
// status / last-seen only — NO email, phone, CRM notes, leads, or commissions).
// The full Customer 360 is P5.2.
import Link from "next/link";
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getOrganizationForPlatform, listOrganizationUsersForPlatform } from "@/lib/platform-admin/server/dal";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { Icon } from "@/components/dashboard/Icon";
import { PageHeader, PanelCard, PlanBadge, StatusBadge, IdChip, formatPlatformDate } from "@/components/platform-admin/ui";

export const dynamic = "force-dynamic";

export default async function PlatformOrgSummaryPage({ params }: { params: Promise<{ orgId: string }> }) {
  const operator = await authorizePlatform("platform.customers.read");
  if (!operator) return <PlatformDenied />;

  const { orgId } = await params;
  const org = await getOrganizationForPlatform(orgId);
  if (!org) {
    return (
      <div>
        <PageHeader eyebrow="לקוחות · ארגון" title="הארגון לא נמצא" icon="Building2" />
        <div className="border-line bg-card rounded-2xl border p-8 text-center">
          <p className="text-muted text-sm">לא נמצא ארגון עם המזהה המבוקש.</p>
          <Link href="/platform/customers" className="text-brand-strong mt-3 inline-flex items-center gap-1 text-sm font-bold"><Icon name="ArrowLeft" size={15} />חזרה לארגונים</Link>
        </div>
      </div>
    );
  }

  // Every platform role holds users.read; guard defensively anyway.
  const users = await listOrganizationUsersForPlatform(orgId).catch(() => []);

  return (
    <div>
      <div className="mb-4">
        <Link href="/platform/customers" className="text-muted hover:text-ink inline-flex items-center gap-1 text-[12px] font-bold"><Icon name="ArrowLeft" size={14} />ארגונים</Link>
      </div>
      <PageHeader eyebrow="לקוחות · ארגון" title={org.name} icon="Building2" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <PanelCard title="פרטי ארגון" icon="Building2">
          <dl className="flex flex-col gap-3 px-1 py-1 text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted font-semibold">תוכנית</dt>
              <dd><PlanBadge plan={org.plan} /></dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted font-semibold">עיר</dt>
              <dd className="text-ink font-bold">{org.city || "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted font-semibold">אונבורדינג</dt>
              <dd>
                <span className={"inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold " + (org.onboardingCompleted ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
                  {org.onboardingCompleted ? "הושלם" : "בתהליך"}
                </span>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted font-semibold">נוצר</dt>
              <dd className="text-ink font-bold">{formatPlatformDate(org.createdAt)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted font-semibold">מזהה</dt>
              <dd><IdChip id={org.id} /></dd>
            </div>
          </dl>
        </PanelCard>

        <PanelCard title={`משתמשים (${users.length})`} icon="Users" className="lg:col-span-2">
          {users.length === 0 ? (
            <p className="text-muted px-2 py-6 text-center text-sm">אין משתמשים להצגה</p>
          ) : (
            <ul className="divide-line divide-y">
              {users.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-2 py-2.5">
                  <span className="text-muted bg-surface grid h-8 w-8 shrink-0 place-items-center rounded-full"><Icon name="UserCircle" size={16} /></span>
                  <span className="text-ink min-w-0 flex-1 truncate text-[13.5px] font-bold">{u.name || "—"}</span>
                  <span className="text-muted hidden text-[11px] sm:inline">{u.lastSeenAt ? `נראה ${formatPlatformDate(u.lastSeenAt)}` : "—"}</span>
                  <StatusBadge status={u.status} />
                </li>
              ))}
            </ul>
          )}
        </PanelCard>
      </div>

      <div className="border-line bg-surface mt-5 flex items-center gap-2 rounded-xl border px-4 py-3">
        <span className="text-brand"><Icon name="Sparkles" size={16} /></span>
        <p className="text-muted text-[13px] font-semibold">תצוגת Customer 360 המלאה — מנויים, שימוש, אינטגרציות ותמיכה — תגיע ב-P5.2.</p>
      </div>
    </div>
  );
}
