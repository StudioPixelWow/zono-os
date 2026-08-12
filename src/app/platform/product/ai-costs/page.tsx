// ZONO — Platform · AI Usage & Cost (P6.1). Reads the canonical ai_usage_costs
// source. Three honest states: (a) table not yet applied → awaiting activation
// (migration gate); (b) applied but empty → no AI usage recorded yet; (c) data
// present → real usage dashboard (requests, tokens, by provider/model/feature,
// failures). Cost is shown ONLY when authoritative (cost_basis='provider_reported')
// — otherwise the screen states cost is unavailable. NEVER a fabricated ₪/$ value,
// NEVER prompts/completions. Cap: platform.ai.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getAiUsageOverview } from "@/lib/ai-usage/server/ai-usage";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard, UsageTile } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";
const okMetric = (n: number) => ({ value: n, state: "ok" as const });

function BreakdownTable({ title, rows }: { title: string; rows: { key: string; label?: string; requests: number; tokens: number }[] }) {
  return (
    <PanelCard title={title} icon="Layers">
      {rows.length === 0 ? <p className="text-muted px-1 py-3 text-[13px]">אין נתונים בחלון.</p> : (
        <div className="border-line overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[360px] border-collapse text-[13px]">
            <thead><tr className="border-line bg-surface border-b text-[12px]">{["", "בקשות", "Tokens"].map((h, i) => <th key={i} className="text-muted px-3 py-2.5 text-start font-bold">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-line border-b last:border-0">
                  <td className="text-ink px-3 py-2.5 font-semibold" dir="ltr">{r.label ?? r.key}</td>
                  <td className="text-ink px-3 py-2.5 tabular-nums">{r.requests}</td>
                  <td className="text-muted px-3 py-2.5 tabular-nums">{r.tokens || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PanelCard>
  );
}

export default async function Page() {
  const operator = await authorizePlatform("platform.ai.read");
  if (!operator) return <PlatformDenied />;
  const o = await getAiUsageOverview();

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="מוצר" title="שימוש ועלויות AI" description="ניטור שימוש בספקי AI חוצה-ארגונים — בקשות, tokens, ספקים ומודלים. עלות מוצגת רק ממקור סמכותי; ללא נתונים מפוברקים." icon="Sparkles" />

      {/* State A — table not yet applied (migration gate) */}
      {!o.configured ? (
        <div className="border-warning-soft bg-warning-soft/40 flex items-start gap-3 rounded-2xl border px-5 py-4">
          <span className="text-warning mt-0.5"><Icon name="AlertCircle" size={18} /></span>
          <div>
            <div className="text-ink text-[15px] font-black">ניטור שימוש AI — ממתין להפעלה</div>
            <div className="text-muted mt-1 text-[13px]">הכותב הקנוני (<span className="font-mono" dir="ltr">recordAiUsage</span>) והמסך מוכנים. טבלת <span className="font-mono" dir="ltr">ai_usage_costs</span> (מיגרציה אדיטיבית) ממתינה לאישור והחלה — שער מיגרציה.</div>
          </div>
        </div>
      ) : !o.hasData ? (
        /* State B — applied, empty */
        <div className="border-line bg-surface flex items-center gap-2 rounded-xl border px-4 py-3">
          <span className="text-muted"><Icon name="AlertCircle" size={14} /></span>
          <span className="text-muted text-[12px] font-semibold">הטבלה פעילה אך טרם נרשם שימוש AI. הנתונים יופיעו מרגע שהאינסטרומנטציה תלכוד קריאות ספק אמיתיות. ללא השלמת היסטוריה.</span>
        </div>
      ) : (
        /* State C — real data */
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <UsageTile icon="Sparkles" label="בקשות AI" metric={okMetric(o.totalRequests)} />
            <UsageTile icon="Activity" label="Tokens (סה״כ)" metric={okMetric(o.tokens.total)} />
            <UsageTile icon="Activity" label="Tokens קלט" metric={okMetric(o.tokens.input)} />
            <UsageTile icon="Activity" label="Tokens פלט" metric={okMetric(o.tokens.output)} />
            <UsageTile icon="Building2" label="ארגונים עם AI" metric={okMetric(o.orgsUsingAi)} />
            <UsageTile icon="AlertCircle" label="כשלים" metric={okMetric(o.failures)} />
          </div>
          {!o.cost.available && (
            <div className="border-line bg-surface flex items-center gap-2 rounded-xl border px-4 py-3">
              <span className="text-muted"><Icon name="Lock" size={14} /></span>
              <span className="text-muted text-[12px] font-semibold">עלות ($/₪) אינה זמינה — אין מקור תמחור סמכותי מוגדר. נרשמים tokens בלבד; עלות תוצג רק ממקור מאומת (P6.1 אינו ממציא מחירים).</span>
            </div>
          )}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <BreakdownTable title="לפי ספק" rows={o.byProvider} />
            <BreakdownTable title="לפי מודל" rows={o.byModel} />
            <BreakdownTable title="לפי פיצ׳ר" rows={o.byFeature} />
          </div>
        </>
      )}

      <p className="text-muted px-1 text-[11px]" dir="ltr">source: {o.source} · window 35d · cost authoritative-source-only</p>
    </div>
  );
}
