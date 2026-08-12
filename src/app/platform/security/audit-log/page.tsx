// ZONO — Platform · Audit log (P5.9). Serious privileged-action viewer with
// filters + a SECRET-STRIPPED before/after diff. Safe fields only — NEVER ip /
// user_agent / raw sensitive payloads. Cap: platform.audit.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { listPlatformAuditLog } from "@/lib/platform-admin/server/security";
import type { AuditFilters } from "@/lib/platform-admin/server/security";
import { actionLabel } from "@/lib/platform-admin/security/model";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, formatPlatformDateTime } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";
import Link from "next/link";

export const dynamic = "force-dynamic";

const QUICK_ACTIONS: { key: string; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "platform.operator.role.change", label: "שינוי תפקיד" },
  { key: "platform.operator.suspend", label: "השעיית מפעיל" },
  { key: "support.impersonation.start", label: "מצב תמיכה" },
  { key: "support.ticket.status.change", label: "סטטוס פנייה" },
];

export default async function Page({ searchParams }: { searchParams: Promise<{ action?: string; resource?: string }> }) {
  const operator = await authorizePlatform("platform.audit.read");
  if (!operator) return <PlatformDenied />;
  const sp = await searchParams;
  const filters: AuditFilters = {
    action: (sp.action && sp.action !== "all") ? sp.action : null,
    resourceType: sp.resource || null,
    limit: 200,
  };
  const rows = await listPlatformAuditLog(filters);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="אבטחה" title="יומן ביקורת" description="כל הפעולות המיוחסות בפלטפורמה. שדות בטוחים בלבד — ללא IP, user-agent או מטענים רגישים; diff מוצג לאחר הסרת סודות." icon="ScrollText" />

      <div className="flex flex-wrap gap-1.5">
        {QUICK_ACTIONS.map((a) => {
          const active = (sp.action ?? "all") === a.key;
          return <Link key={a.key} href={a.key === "all" ? "?" : `?action=${a.key}`} className={"rounded-lg px-3 py-1.5 text-[12px] font-bold " + (active ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink")}>{a.label}</Link>;
        })}
      </div>

      <PanelCard title={`אירועים (${rows.length})`} icon="ScrollText">
        {rows.length === 0 ? (
          <p className="text-muted px-1 py-6 text-center text-[13px]">אין אירועים התואמים לסינון</p>
        ) : (
          <ul className="divide-line divide-y">
            {rows.map((r) => (
              <li key={r.id} className="px-1 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  {r.denied ? <span className="bg-danger-soft text-danger rounded px-1.5 py-0.5 text-[10px] font-bold">נדחה</span> : r.sensitive ? <span className="bg-warning-soft text-warning rounded px-1.5 py-0.5 text-[10px] font-bold">מיוחס</span> : null}
                  <span className="text-ink text-[13px] font-bold">{actionLabel(r.action)}</span>
                  <span className="text-muted text-[12px]">{r.actorName ?? r.actorLabel ?? "—"}</span>
                  {r.orgName ? <Link href={`/platform/customers/${r.orgId}`} className="text-brand text-[12px] hover:underline">{r.orgName}</Link> : null}
                  <span className="text-muted ms-auto text-[11px]">{formatPlatformDateTime(r.createdAt)}</span>
                </div>
                <div className="text-muted mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
                  {r.resourceType ? <span>משאב: {r.resourceType}{r.resourceId ? ` · ${r.resourceId.slice(0, 8)}` : ""}</span> : null}
                  {r.reason ? <span className="text-ink font-semibold">נימוק: {r.reason}</span> : null}
                  {r.source ? <span dir="ltr">{r.source}</span> : null}
                </div>
                {r.diff && (r.diff.before || r.diff.after) ? (
                  <div className="border-line mt-1.5 flex flex-wrap gap-3 rounded-lg border bg-surface px-3 py-1.5 text-[11px]" dir="ltr">
                    {r.diff.before ? <span className="text-danger">− {JSON.stringify(r.diff.before)}</span> : null}
                    {r.diff.after ? <span className="text-success">+ {JSON.stringify(r.diff.after)}</span> : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="text-muted mt-3 px-1 flex items-center gap-1.5 text-[11px]"><Icon name="Lock" size={11} />מוצגים עד 200 אירועים אחרונים. מפתחות סוד מוסתרים (•••) לפני הצגה.</p>
      </PanelCard>
    </div>
  );
}
