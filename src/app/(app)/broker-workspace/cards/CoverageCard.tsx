// 👤 Coverage — the broker's journey evidence coverage: inherited canonical vs
// fallback record counts from the owner-scoped Journey Center KPIs. The ratio
// shown is the standing definition of evidence coverage, not a new score.
import { loadBrokerJourney } from "@/lib/broker-home/providers";
import { brokerCoverage } from "@/lib/broker-home/compose";
import { CardShell, CardUnavailable } from "../CardShell";

export async function CoverageCard() {
  const journey = await loadBrokerJourney().catch(() => null);
  const cov = brokerCoverage(journey);
  if (!cov) {
    return (
      <CardShell title="כיסוי" subtitle="ראיות המסעות שלך · לא מחושב מחדש" source="journey-center({owner}).kpis">
        <CardUnavailable note="נתוני הכיסוי אינם זמינים כעת" />
      </CardShell>
    );
  }
  return (
    <CardShell title="כיסוי" subtitle="ראיות המסעות שלך · לא מחושב מחדש" source="journey-center({owner}).kpis">
      <div className="rounded-[14px] border border-[var(--line)] p-3">
        <div className="flex items-center justify-between">
          <span className="text-ink text-[12px] font-black">כיסוי ראיות מסעות</span>
          <span className="text-brand text-lg font-black">{cov.value == null ? "—" : `${cov.value}%`}</span>
        </div>
        <p className="text-muted mt-1 text-[11px]">
          רשומות קנוניות {cov.canonicalRecords} · גיבוי {cov.fallbackRecords} · סה״כ {cov.total}
        </p>
      </div>
    </CardShell>
  );
}
