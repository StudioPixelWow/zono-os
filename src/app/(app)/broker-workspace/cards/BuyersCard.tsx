// 👤 My Buyers — the broker's own hot buyers (Daily OS deals, from the
// owner-scoped buyer projection). Inherited ScoredEntity fields; no new scoring.
import { loadDailyOS } from "@/lib/broker-home/providers";
import { CardShell, CardUnavailable } from "../CardShell";
import { EntityList } from "./EntityList";

export async function BuyersCard() {
  const os = await loadDailyOS().catch(() => null);
  if (!os) {
    return (
      <CardShell title="הקונים שלי" subtitle="החמים ביותר · שלך בלבד" source="daily-os.deals.hotBuyers">
        <CardUnavailable note="הקונים אינם זמינים כעת" />
      </CardShell>
    );
  }
  const buyers = os.deals.hotBuyers.slice(0, 5);
  return (
    <CardShell title="הקונים שלי" subtitle="החמים ביותר · שלך בלבד" source="daily-os.deals.hotBuyers">
      {buyers.length === 0 ? <p className="text-muted text-[12px]">אין קונים פעילים כרגע.</p> : <EntityList items={buyers} />}
    </CardShell>
  );
}
