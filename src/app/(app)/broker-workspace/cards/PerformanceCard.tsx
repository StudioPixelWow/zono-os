// 👤 Performance Snapshot — the broker's EXISTING metrics (Daily OS performance,
// computed from the owner-filtered book). No new KPIs; all fields inherited.
import { loadDailyOS } from "@/lib/broker-home/providers";
import { CardShell, CardUnavailable } from "../CardShell";

const scoreTone = (n: number) => (n >= 80 ? "text-success" : n >= 60 ? "text-brand" : n >= 40 ? "text-warning" : "text-danger");

export async function PerformanceCard() {
  const os = await loadDailyOS().catch(() => null);
  if (!os) {
    return (
      <CardShell title="תמונת ביצועים" subtitle="המדדים שלך · לא מדדים חדשים" source="daily-os.performance">
        <CardUnavailable note="הביצועים אינם זמינים כעת" />
      </CardShell>
    );
  }
  const p = os.performance;
  const stat = (label: string, value: string | number, tone = "text-ink") => (
    <div className="flex flex-col items-center rounded-[12px] border border-[var(--line)] px-2 py-2">
      <span className={`text-lg font-black ${tone}`}>{value}</span>
      <span className="text-muted text-[10px] font-bold">{label}</span>
    </div>
  );
  return (
    <CardShell title="תמונת ביצועים" subtitle="המדדים שלך · לא מדדים חדשים" source="daily-os.performance">
      <div className="grid grid-cols-2 gap-2">
        {stat("ציון יומי", p.daily, scoreTone(p.daily))}
        {stat("ציון שבועי", p.weekly, scoreTone(p.weekly))}
        {stat("מעקב", `${p.followUpRatePct}%`)}
        {stat("הזדמנויות המרה", p.conversionOpportunities)}
      </div>
      {p.weakSpots[0] ? (
        <div className="rounded-[12px] border border-[var(--line)] px-3 py-2">
          <div className="text-warning text-[10px] font-black">נקודה לחיזוק</div>
          <div className="text-ink mt-0.5 text-[12px] font-bold">{p.weakSpots[0].title}</div>
          <div className="text-muted text-[11px]">{p.weakSpots[0].detail}</div>
        </div>
      ) : null}
    </CardShell>
  );
}
