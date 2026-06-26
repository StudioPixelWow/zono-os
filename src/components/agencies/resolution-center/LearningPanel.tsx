import { Card, CardTitle } from "@/components/ui/Card";
import type { LearningStats } from "@/lib/agencies/resolution-center/resolutionCenterFormat";

const pct = (n: number | null) => (n == null ? "—" : `${n}%`);

/** The learning center: what the AI has been taught by human reviews. */
export function LearningPanel({ learning }: { learning: LearningStats }) {
  const lists: { title: string; rows: { label: string; count: number }[] }[] = [
    { title: "כינויים שתוקנו", rows: learning.topCorrectedAliases.map((a) => ({ label: `${a.alias} → ${a.agency}`, count: a.count })) },
    { title: "שמות שנדחו", rows: learning.topRejectedNames.map((a) => ({ label: a.name, count: a.count })) },
    { title: "משרדים שאושרו", rows: learning.topApprovedAgencies.map((a) => ({ label: a.name, count: a.count })) },
  ];
  return (
    <Card>
      <CardTitle>מנוע הלמידה</CardTitle>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">שיפור AI:</span>
        <span className="text-brand-strong text-lg font-extrabold">{pct(learning.improvementPct)}</span>
        <span className="text-muted">· {learning.totalDecisions} החלטות · {learning.approvals} אישורים · {learning.rejections} דחיות</span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
        {lists.map((l) => (
          <div key={l.title} className="border-line/70 rounded-lg border p-3">
            <div className="text-ink mb-1.5 text-xs font-bold">{l.title}</div>
            {l.rows.length === 0 ? (
              <div className="text-muted text-[11px]">אין עדיין נתונים.</div>
            ) : (
              <ul className="space-y-1">
                {l.rows.map((r, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-ink truncate">{r.label}</span>
                    <span className="text-muted shrink-0 font-semibold">×{r.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
