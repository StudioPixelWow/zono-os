// 🏛️ Opportunity Summary card — reuses getExecutiveOS().opportunities (ExecItem[]),
// surfaced from Chief-of-Staff. Inherited verbatim — no new opportunity scoring.
import { loadExecutiveOS } from "@/lib/executive-workspace/providers";
import { CardShell, CardUnavailable } from "../CardShell";

export async function OpportunitySummaryCard() {
  const os = await loadExecutiveOS().catch(() => null);
  if (!os) {
    return (
      <CardShell title="תמצית הזדמנויות" subtitle="מ-Chief of Staff · לא מדורג מחדש" source="executive-os">
        <CardUnavailable note="תמצית ההזדמנויות אינה זמינה כעת" />
      </CardShell>
    );
  }
  const opps = os.opportunities.slice(0, 3);
  return (
    <CardShell title="תמצית הזדמנויות" subtitle="מ-Chief of Staff · לא מדורג מחדש" source="executive-os">
      {opps.length === 0 ? (
        <p className="text-muted text-[12px]">אין הזדמנויות בולטות כרגע.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {opps.map((o) => (
            <li key={o.id} className="rounded-[14px] border border-[var(--line)] p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="text-ink text-[12px] font-black">{o.title}</span>
                <span className="text-success shrink-0 text-[11px] font-bold">ביטחון {o.confidence}%</span>
              </div>
              <p className="text-muted mt-0.5 text-[11px]">{o.impact}</p>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}
