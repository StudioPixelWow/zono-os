// ZONO — Platform · Security · Support View history (P5.8). Read-only history of
// platform-operator Support View sessions (from support_impersonation_log): who
// viewed whose account, why, when, for how long, and the outcome. No secrets.
// Cap: platform.support.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { listSupportViewSessions } from "@/lib/platform-admin/server/support-view";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, formatPlatformDateTime } from "@/components/platform-admin/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

function fmtDuration(ms: number | null): string {
  if (ms === null) return "—";
  const m = Math.floor(ms / 60000), s = Math.floor((ms % 60000) / 1000);
  return m > 0 ? `${m}ד׳ ${s}ש׳` : `${s}ש׳`;
}
const OUTCOME_TONE: Record<string, string> = { "הסתיים": "bg-surface text-muted", "פג תוקף": "bg-warning-soft text-warning", "פעיל": "bg-success-soft text-success" };

export default async function Page() {
  const operator = await authorizePlatform("platform.support.read");
  if (!operator) return <PlatformDenied />;
  const sessions = await listSupportViewSessions(200);

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="אבטחה" title="היסטוריית מצב תמיכה" description="תיעוד מלא של סשני צפייה כמשתמש ע״י מפעילי פלטפורמה — מי, את מי, מדוע, מתי, וכמה זמן. ללא סודות." icon="ShieldCheck" />

      <PanelCard title={`סשנים (${sessions.length})`} icon="ScrollText">
        {sessions.length === 0 ? (
          <p className="text-muted px-1 py-6 text-center text-[13px]">אין סשני מצב תמיכה מתועדים</p>
        ) : (
          <div className="border-line overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[820px] border-collapse text-[13px]">
              <thead>
                <tr className="border-line bg-surface border-b text-[12px]">
                  {["מפעיל", "ארגון", "משתמש יעד", "סיבה", "התחלה", "משך", "תוצאה"].map((h) => <th key={h} className="text-muted px-3 py-2.5 text-start font-bold">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.sessionId} className="border-line border-b last:border-0">
                    <td className="text-ink px-3 py-2.5 font-semibold">{s.operatorName ?? s.operatorId.slice(0, 8)}</td>
                    <td className="text-muted px-3 py-2.5"><Link href={`/platform/customers/${s.orgId}`} className="hover:text-brand">{s.orgName ?? s.orgId.slice(0, 8)}</Link></td>
                    <td className="text-muted px-3 py-2.5">{s.targetName ?? s.targetUserId.slice(0, 8)}</td>
                    <td className="text-muted px-3 py-2.5 text-[12px]">{s.reason}</td>
                    <td className="text-muted px-3 py-2.5 text-[12px]">{formatPlatformDateTime(s.startedAt)}</td>
                    <td className="text-muted px-3 py-2.5 text-[12px]">{fmtDuration(s.durationMs)}</td>
                    <td className="px-3 py-2.5"><span className={"rounded-md px-2 py-0.5 text-[11px] font-bold " + (OUTCOME_TONE[s.outcome] ?? "bg-surface text-muted")}>{s.outcome}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-muted mt-3 px-1 text-[11px]">מקור: support_impersonation_log (סשני מפעילי פלטפורמה בלבד). לקריאה בלבד.</p>
      </PanelCard>
    </div>
  );
}
