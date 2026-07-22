// 👤 My Sellers — the broker's own sellers at risk (Daily OS deals, from the
// owner-scoped seller projection). Inherited ScoredEntity fields; no new scoring.
import { loadDailyOS } from "@/lib/broker-home/providers";
import { CardShell, CardUnavailable } from "../CardShell";
import { EntityList } from "./EntityList";

export async function SellersCard() {
  const os = await loadDailyOS().catch(() => null);
  if (!os) {
    return (
      <CardShell title="המוכרים שלי" subtitle="בסיכון נטישה · שלך בלבד" source="daily-os.deals.sellersAtRisk">
        <CardUnavailable note="המוכרים אינם זמינים כעת" />
      </CardShell>
    );
  }
  const sellers = os.deals.sellersAtRisk.slice(0, 5);
  return (
    <CardShell title="המוכרים שלי" subtitle="בסיכון נטישה · שלך בלבד" source="daily-os.deals.sellersAtRisk">
      {sellers.length === 0 ? <p className="text-muted text-[12px]">אין מוכרים בסיכון כרגע ✓</p> : <EntityList items={sellers} />}
    </CardShell>
  );
}
