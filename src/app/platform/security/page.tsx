// ZONO — Platform · Security overview (P5.9). Trustworthy security posture:
// operator counts, privileged-action + denied-action counts, Support View
// session state, MFA posture (honest). No fabricated risk/threat scores. Cap:
// platform.admins.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getSecurityOverview } from "@/lib/platform-admin/server/security";
import { listRecentPlatformAudit } from "@/lib/platform-admin/server/dal";
import { isSensitiveAction, isDeniedAction, actionLabel } from "@/lib/platform-admin/security/model";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, formatPlatformDateTime } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";
import Link from "next/link";

export const dynamic = "force-dynamic";

function Metric({ label, value, tone = "brand", icon }: { label: string; value: number | null; tone?: string; icon: string }) {
  const toneCls: Record<string, string> = { brand: "text-brand bg-brand-soft", success: "text-success bg-success-soft", warning: "text-warning bg-warning-soft", danger: "text-danger bg-danger-soft", neutral: "text-muted bg-surface" };
  return (
    <div className="border-line bg-card rounded-2xl border p-4">
      <span className={"grid h-9 w-9 place-items-center rounded-xl " + (toneCls[tone] ?? toneCls.brand)}><Icon name={icon} size={17} /></span>
      <p className="text-ink mt-3 text-3xl font-black tabular-nums">{value ?? "—"}</p>
      <p className="text-muted mt-1.5 text-[13px] font-semibold">{label}</p>
    </div>
  );
}

export default async function Page() {
  const operator = await authorizePlatform("platform.admins.read");
  if (!operator) return <PlatformDenied />;
  const [o, recent] = await Promise.all([getSecurityOverview(), listRecentPlatformAudit(20)]);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="אבטחה" title="מרכז אבטחה" description="מצב האבטחה של הפלטפורמה — מפעילים, פעולות מיוחסות, מצב תמיכה, ו-MFA. מדדים אמיתיים בלבד, ללא ציוני איום מפוברקים." icon="Shield" />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="מפעילים פעילים" value={o.activeOperators} tone="success" icon="Fingerprint" />
        <Metric label="מפעילים מושעים" value={o.suspendedOperators} tone="warning" icon="Lock" />
        <Metric label="מנהלי-על" value={o.superAdmins} tone="brand" icon="ShieldCheck" />
        <Metric label="פעולות מיוחסות (30 ימים)" value={o.recentPrivilegedActions} tone="neutral" icon="Activity" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric label="פעולות שנדחו (30 ימים)" value={o.deniedActions} tone="danger" icon="AlertTriangle" />
        <Metric label="מצב תמיכה פעיל" value={o.supportViewActive} tone="warning" icon="ShieldCheck" />
        <Metric label="מצב תמיכה — סה״כ" value={o.supportViewTotal} tone="neutral" icon="ScrollText" />
        <div className="border-line bg-card rounded-2xl border p-4">
          <span className="text-muted bg-surface grid h-9 w-9 place-items-center rounded-xl"><Icon name="Fingerprint" size={17} /></span>
          <p className="text-ink mt-3 text-[15px] font-black">{o.mfaEnforced ? "MFA נאכף" : "MFA לא נאכף"}</p>
          <p className="text-muted mt-1.5 text-[12px] font-semibold">אימות דו-שלבי</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PanelCard title="פעולות אחרונות" icon="ScrollText" action={<Link href="/platform/security/audit-log" className="text-brand text-[12px] font-bold">יומן מלא ←</Link>}>
          <ul className="divide-line divide-y">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-1 py-2 text-[13px]">
                {isSensitiveAction(r.action) ? <span className="text-warning"><Icon name="AlertCircle" size={13} /></span> : isDeniedAction(r.action) ? <span className="text-danger"><Icon name="AlertTriangle" size={13} /></span> : <span className="text-muted/40"><Icon name="Activity" size={13} /></span>}
                <span className="text-ink font-semibold">{actionLabel(r.action)}</span>
                <span className="text-muted ms-auto text-[11px]">{r.actorLabel} · {formatPlatformDateTime(r.createdAt)}</span>
              </li>
            ))}
            {recent.length === 0 ? <li className="text-muted px-1 py-4 text-[13px]">אין פעולות</li> : null}
          </ul>
        </PanelCard>

        <PanelCard title="ניווט אבטחה" icon="Shield">
          <div className="grid grid-cols-1 gap-2">
            {[
              { href: "/platform/security/admin-users", label: "מנהלי פלטפורמה", icon: "Fingerprint", note: "ניהול מפעילים + מטריצת הרשאות" },
              { href: "/platform/security/audit-log", label: "יומן ביקורת", icon: "ScrollText", note: "כל הפעולות המיוחסות" },
              { href: "/platform/security/impersonation", label: "היסטוריית מצב תמיכה", icon: "ShieldCheck", note: "סשני צפייה כמשתמש" },
              { href: "/platform/security/sessions", label: "הפעלות וגישה", icon: "Lock", note: "מצב ביטול גישה + MFA" },
            ].map((l) => (
              <Link key={l.href} href={l.href} className="border-line bg-surface hover:border-brand/40 flex items-center gap-3 rounded-xl border px-3 py-2.5">
                <span className="text-brand"><Icon name={l.icon} size={16} /></span>
                <span className="text-ink text-[13px] font-bold">{l.label}</span>
                <span className="text-muted ms-auto text-[11px]">{l.note}</span>
              </Link>
            ))}
          </div>
        </PanelCard>
      </div>

      <p className="text-muted px-1 text-[11px]">עודכן: {formatPlatformDateTime(o.generatedAt)}</p>
    </div>
  );
}
