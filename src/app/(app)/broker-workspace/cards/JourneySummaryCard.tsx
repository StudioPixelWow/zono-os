// 👤 My Journey Summary — the canonical Journey Center scoped to the broker
// (owner filter). Counts inherited verbatim from the KPIs; no re-counting.
import Link from "next/link";
import { loadBrokerJourney } from "@/lib/broker-home/providers";
import { CardShell, CardUnavailable } from "../CardShell";

export async function JourneySummaryCard() {
  const journey = await loadBrokerJourney().catch(() => null);
  if (!journey) {
    return (
      <CardShell title="המסעות שלי" subtitle="Journey Center · שלך בלבד" source="journey-center({owner})">
        <CardUnavailable note="נתוני המסעות אינם זמינים כעת" />
      </CardShell>
    );
  }
  const k = journey.kpis;
  const stat = (label: string, n: number, tone: string) => (
    <div className="flex flex-col items-center rounded-[12px] border border-[var(--line)] px-2 py-2">
      <span className={`text-xl font-black ${tone}`}>{n}</span>
      <span className="text-muted text-[10px] font-bold">{label}</span>
    </div>
  );
  return (
    <CardShell title="המסעות שלי" subtitle="Journey Center · שלך בלבד" source="journey-center({owner})">
      <div className="grid grid-cols-4 gap-2">
        {stat("פעילים", k.active, "text-ink")}
        {stat("ממתינים", k.waiting, "text-brand")}
        {stat("תקועים", k.stalled ?? 0, "text-warning")}
        {stat("חסומים", k.blocked ?? 0, "text-danger")}
      </div>
      <Link href="/journeys" className="text-brand text-[11px] font-bold">לכל המסעות שלי →</Link>
    </CardShell>
  );
}
