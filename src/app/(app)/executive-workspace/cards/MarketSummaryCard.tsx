// 🏛️ Market Summary card — reuses getExecutiveOS() office health + the top
// market/competition risk item. Inherited ExecItems only, no new market math.
import { loadExecutiveOS } from "@/lib/executive-workspace/providers";
import { CardShell, CardUnavailable } from "../CardShell";
import type { OfficeState } from "@/lib/executive-os/types";

const STATE_HE: Record<OfficeState, string> = { healthy: "בריא", needs_attention: "דורש תשומת לב", critical: "קריטי", growth: "צמיחה", decline: "ירידה" };
const STATE_TONE: Record<OfficeState, string> = { healthy: "text-success", growth: "text-success", needs_attention: "text-warning", critical: "text-danger", decline: "text-danger" };
const TREND: Record<string, string> = { up: "↑", flat: "→", down: "↓" };

export async function MarketSummaryCard() {
  const os = await loadExecutiveOS().catch(() => null);
  if (!os) {
    return (
      <CardShell title="תמצית שוק" subtitle="מבריאות המשרד · לא מחושב מחדש" source="executive-os">
        <CardUnavailable note="תמצית השוק אינה זמינה כעת" />
      </CardShell>
    );
  }
  const topRisk = os.risks[0] ?? null;
  return (
    <CardShell title="תמצית שוק" subtitle="מבריאות המשרד · לא מחושב מחדש" source="executive-os">
      <div className="flex items-center gap-2">
        <span className={`text-base font-black ${STATE_TONE[os.health.state]}`}>{STATE_HE[os.health.state]}</span>
        <span className="text-muted text-[12px]">מגמה {TREND[os.health.trend] ?? "→"} · ביטחון {os.health.confidence}%</span>
      </div>
      {os.health.evidence[0] ? <p className="text-muted text-[12px]">{os.health.evidence[0]}</p> : null}
      {topRisk ? (
        <div className="rounded-[14px] border border-[var(--line)] p-3">
          <div className="text-danger text-[10px] font-black">הסיכון הבולט</div>
          <div className="text-ink mt-0.5 text-[12px] font-bold">{topRisk.title}</div>
          <div className="text-muted mt-0.5 text-[11px]">{topRisk.why}</div>
        </div>
      ) : (
        <p className="text-muted text-[12px]">אין סיכון שוק בולט כרגע.</p>
      )}
    </CardShell>
  );
}
