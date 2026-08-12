// ZONO — Platform · Administrators (P5.9). Platform operator directory +
// management (super_admin only) + the READ-ONLY capability matrix sourced from
// the authoritative registry. Platform operators are DISJOINT from organization
// roles. Cap: platform.admins.read (management: platform.admins.manage).
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { listPlatformOperators } from "@/lib/platform-admin/server/admin-users";
import { operatorCan } from "@/lib/platform-admin/capabilities";
import { buildCapabilityMatrix, ROLE_LABEL } from "@/lib/platform-admin/security/model";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, formatPlatformDate } from "@/components/platform-admin/ui";
import { OperatorAdmin } from "@/components/platform-admin/OperatorAdmin";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.admins.read");
  if (!operator) return <PlatformDenied />;
  const canManage = operatorCan(operator, "platform.admins.manage");
  const operators = await listPlatformOperators();
  const matrix = buildCapabilityMatrix();

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="אבטחה" title="מנהלי פלטפורמה" description="צוות ZONO בעל גישת פלטפורמה — נפרד לחלוטין ממשתמשי הלקוח ומתפקידי הארגון. בעלות על ארגון אינה מקנה גישת פלטפורמה." icon="Fingerprint" />

      {canManage ? (
        <OperatorAdmin operators={operators} />
      ) : (
        <PanelCard title={`מפעילים (${operators.length})`} icon="Fingerprint">
          <ul className="divide-line divide-y">
            {operators.map((o) => (
              <li key={o.userId} className="flex items-center gap-3 px-1 py-2.5 text-[13px]">
                <span className="text-ink font-semibold">{o.name ?? o.userId.slice(0, 8)}</span>
                <span className="bg-brand-soft text-brand rounded-md px-2 py-0.5 text-[11px] font-bold">{ROLE_LABEL[o.role]}</span>
                <span className={"rounded-md px-2 py-0.5 text-[11px] font-bold " + (o.status === "suspended" ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>{o.status === "suspended" ? "מושעה" : "פעיל"}</span>
                <span className="text-muted ms-auto text-[11px]">נוצר {formatPlatformDate(o.createdAt)}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted mt-2 px-1 text-[11px]">ניהול מפעילים (יצירה/תפקיד/השעיה) זמין ל-super_admin בלבד.</p>
        </PanelCard>
      )}

      {/* READ-ONLY capability matrix — same registry assertPlatformCapability() uses */}
      <PanelCard title="מטריצת הרשאות פלטפורמה" icon="ShieldCheck">
        <div className="border-line overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="border-line bg-surface border-b">
                <th className="text-muted px-3 py-2.5 text-start text-[12px] font-bold">יכולת</th>
                {matrix.roles.map((r) => <th key={r} className="text-ink px-3 py-2.5 text-center text-[12px] font-bold">{ROLE_LABEL[r]}</th>)}
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.capability} className="border-line border-b last:border-0">
                  <td className="px-3 py-2"><div className="text-ink font-semibold">{row.label}</div><div className="text-muted font-mono text-[10px]" dir="ltr">{row.capability}</div></td>
                  {row.cells.map((c) => (
                    <td key={c.role} className="px-3 py-2 text-center">
                      {c.allowed ? <span className="text-success inline-flex"><Icon name="Check" size={15} /></span> : <span className="text-muted/40 inline-flex"><Icon name="Minus" size={13} /></span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted mt-3 px-1 text-[11px]">הגדרות התפקידים מוגדרות בקוד (code-controlled) — אין עורך הרשאות דינמי. המקור זהה ל-assertPlatformCapability().</p>
      </PanelCard>
    </div>
  );
}
