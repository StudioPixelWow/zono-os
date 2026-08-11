// ZONO — Platform · Jobs & Queues (P5.6). Bounded, grouped-by-subsystem queue
// console + read-only dead-letter visibility (safe metadata only — NO payloads/
// tokens/PII). Manual-only redrive is NOT implemented (no safe primitive exists,
// audit §11) → visibility only. Cap: platform.ops.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getPlatformJobsHealth, getPlatformDeadLetters } from "@/lib/platform-admin/server/ops";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, formatPlatformDateTime } from "@/components/platform-admin/ui";
import { QueueTable } from "@/components/platform-admin/ops-ui";
import { Icon } from "@/components/dashboard/Icon";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Page() {
  const operator = await authorizePlatform("platform.ops.read");
  if (!operator) return <PlatformDenied />;
  const [jobs, deadLetters] = await Promise.all([getPlatformJobsHealth(), getPlatformDeadLetters(100)]);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="תפעול" title="עבודות ותורים" description="בריאות תורים לפי תת-מערכת ומכתבים מתים לקריאה בלבד. ללא טעינת טבלאות גולמיות." icon="ListChecks" />

      <PanelCard title="תורים לפי תת-מערכת" icon="ListChecks">
        <QueueTable queues={jobs.queues.map((q) => q.signal)} severityOf={(sig) => jobs.queues.find((q) => q.signal.key === sig.key)!.severity} />
        <p className="text-muted mt-3 px-1 text-[11px]">מדדים מגובי-ספירה בלבד. שדה ריק (—) = הקריאה נכשלה (לא זמין), לעולם לא אפס מפוברק.</p>
      </PanelCard>

      <PanelCard title={`מכתבים מתים (${deadLetters.length})`} icon="AlertTriangle">
        {deadLetters.length === 0 ? (
          <p className="text-muted flex items-center gap-2 px-1 py-4 text-[13px] font-semibold"><span className="text-success"><Icon name="Check" size={16} /></span>אין מכתבים מתים — כל התורים מתנקזים</p>
        ) : (
          <div className="border-line overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="border-line bg-surface border-b text-[12px]">
                  {["ארגון", "מזהה עבודה", "סיבה", "סוג שגיאה", "ניסיונות", "נוצר"].map((h) => <th key={h} className="text-muted px-3 py-2.5 text-start font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {deadLetters.map((d) => (
                  <tr key={d.id} className="border-line border-b last:border-0">
                    <td className="text-ink px-3 py-2.5 font-semibold">{d.orgId ? <Link href={`/platform/customers/${d.orgId}/operations`} className="hover:text-brand">{d.orgName ?? d.orgId.slice(0, 8)}</Link> : "—"}</td>
                    <td className="text-muted px-3 py-2.5 font-mono text-[11px]" dir="ltr">{d.jobId ? d.jobId.slice(0, 8) : "—"}</td>
                    <td className="px-3 py-2.5"><span className="bg-danger-soft text-danger rounded-md px-2 py-0.5 text-[11px] font-bold">{d.reason ?? "—"}</span></td>
                    <td className="text-muted px-3 py-2.5 text-[12px]">{d.terminalErrorKind ?? "—"}</td>
                    <td className="text-muted px-3 py-2.5 tabular-nums">{d.attemptCount ?? "—"}</td>
                    <td className="text-muted px-3 py-2.5 text-[12px]">{formatPlatformDateTime(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-muted mt-3 px-1 text-[11px]">מטא-דאטה בטוחה בלבד (סיבה, סוג שגיאה, ספירה) — ללא מטענים, טוקנים או תוכן. ניתוב-מחדש ידני אינו זמין ב-P5.6 (אין מנגנון בטוח קיים).</p>
      </PanelCard>
    </div>
  );
}
