// ZONO — Platform Admin · Audit Log (P5.1). Most-recent platform audit events
// from the P5.0 platform_audit_log, safe columns only (actor label, action,
// resource type, org, time — NO ip / user-agent / value diffs). Cap:
// platform.audit.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { listRecentPlatformAudit } from "@/lib/platform-admin/server/dal";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { Icon } from "@/components/dashboard/Icon";
import { PageHeader, IdChip, formatPlatformDateTime } from "@/components/platform-admin/ui";

export const dynamic = "force-dynamic";

export default async function PlatformAuditLogPage() {
  const operator = await authorizePlatform("platform.audit.read");
  if (!operator) return <PlatformDenied />;

  const entries = await listRecentPlatformAudit(50);

  return (
    <div>
      <PageHeader eyebrow="אבטחה" title="יומן ביקורת" icon="ScrollText" description="פעולות מנהלי הפלטפורמה האחרונות. רשומות קריאה-בלבד, ללא נתונים רגישים." />
      <div className="border-line bg-card overflow-hidden rounded-2xl border">
        <div className="border-line text-muted hidden grid-cols-[1.4fr_1fr_1fr_1.2fr] gap-3 border-b px-4 py-2.5 text-[11px] font-bold sm:grid">
          <span>פעולה</span><span>מבצע</span><span>סוג משאב</span><span>זמן</span>
        </div>
        {entries.length === 0 ? (
          <p className="text-muted px-4 py-10 text-center text-sm">אין רשומות ביומן</p>
        ) : (
          <ul className="divide-line divide-y">
            {entries.map((e) => (
              <li key={e.id} className="grid grid-cols-1 gap-1 px-4 py-3 sm:grid-cols-[1.4fr_1fr_1fr_1.2fr] sm:items-center sm:gap-3">
                <span className="text-ink inline-flex items-center gap-2 text-[13px] font-bold">
                  <span className="text-brand-light"><Icon name="Fingerprint" size={14} /></span>{e.action}
                </span>
                <span className="text-muted text-[12.5px] font-semibold">{e.actorLabel || "—"}</span>
                <span className="text-muted text-[12.5px]">
                  {e.resourceType || "—"}{e.orgId ? <> · <IdChip id={e.orgId} /></> : null}
                </span>
                <span className="text-muted text-[12px]">{formatPlatformDateTime(e.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
