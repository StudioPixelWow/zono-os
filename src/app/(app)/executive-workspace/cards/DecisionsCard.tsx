// 🏛️ Executive Decisions card — composes getExecutiveDecisions (≤3). Never
// recomputes priorities: rank, confidence and action are inherited verbatim.
import Link from "next/link";
import { loadDecisions } from "@/lib/executive-workspace/providers";
import { CardShell, CardUnavailable } from "../CardShell";

export async function DecisionsCard() {
  const data = await loadDecisions().catch(() => null);
  if (!data) {
    return (
      <CardShell title="ההחלטות הניהוליות" subtitle="עד שלוש · מנוע ההחלטות" source="executive-decision">
        <CardUnavailable note="מנוע ההחלטות אינו זמין כעת" />
      </CardShell>
    );
  }
  return (
    <CardShell title="ההחלטות הניהוליות" subtitle="עד שלוש · בעדיפות מנוע ההחלטות" source="executive-decision">
      {data.noActionRequired ? (
        <p className="text-muted rounded-[14px] border border-[var(--line)] p-4 text-sm">
          {data.decisions[0]?.headline ?? "אין החלטה הדורשת התערבות כרגע ✓"}
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {data.decisions.map((d) => (
            <li key={d.id} className="rounded-[14px] border border-[var(--line)] p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-ink text-[13px] font-black">
                  <span className="text-brand">{d.priority}.</span> {d.headline}
                </span>
                {d.confidence != null ? <span className="text-muted shrink-0 text-[11px] font-bold">ביטחון {d.confidence}%</span> : null}
              </div>
              <p className="text-muted mt-1 text-[12px]">{d.recommendedAction}</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-muted/80 text-[10px] font-bold">{d.category}</span>
                {d.links[0] ? <Link href={d.links[0]} className="text-brand text-[10px] font-bold">פתח →</Link> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </CardShell>
  );
}
