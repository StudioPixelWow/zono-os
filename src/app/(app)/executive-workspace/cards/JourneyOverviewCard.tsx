// 🏛️ Journey Overview card — reuses getExecutiveOS().journey, the canonical
// ExecJourneyProjection (built from the Journey Center spine + evidence-gated
// queue). Counts, headline and dwell are inherited verbatim — no re-counting.
import Link from "next/link";
import { loadExecutiveOS } from "@/lib/executive-workspace/providers";
import { CardShell, CardUnavailable } from "../CardShell";

export async function JourneyOverviewCard() {
  const os = await loadExecutiveOS().catch(() => null);
  const j = os?.journey ?? null;
  if (!j || j.status === "unavailable") {
    return (
      <CardShell title="סקירת מסעות" subtitle="מהפרויקציה הקנונית" source="executive-os.journey">
        <CardUnavailable note="נתוני המסעות אינם זמינים כעת" />
      </CardShell>
    );
  }
  const stat = (label: string, n: number, tone: string) => (
    <div className="flex flex-col items-center rounded-[12px] border border-[var(--line)] px-2 py-2">
      <span className={`text-xl font-black ${tone}`}>{n}</span>
      <span className="text-muted text-[10px] font-bold">{label}</span>
    </div>
  );
  return (
    <CardShell title="סקירת מסעות" subtitle="מהפרויקציה הקנונית" source="executive-os.journey">
      <div className="grid grid-cols-4 gap-2">
        {stat("פעילים", j.counts.active, "text-ink")}
        {stat("תקועים", j.counts.stalled, "text-warning")}
        {stat("חסומים", j.counts.blocked, "text-danger")}
        {stat("המלצות", j.counts.eligibleRecommendations, "text-brand")}
      </div>
      <p className="text-muted text-[12px]">{j.headline}</p>
      <Link href="/journeys" className="text-brand text-[11px] font-bold">לכל המסעות →</Link>
    </CardShell>
  );
}
