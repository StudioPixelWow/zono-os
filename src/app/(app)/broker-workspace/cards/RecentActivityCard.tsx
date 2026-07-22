// 👤 Recent Activity — the broker's OWN entities by last activity (Daily OS
// deals). Broker-scoped by construction; the org-wide "since you were away"
// ledger is deliberately NOT used, so no other broker's activity can leak.
import { loadDailyOS } from "@/lib/broker-home/providers";
import { recentActivity } from "@/lib/broker-home/compose";
import { CardShell, CardUnavailable } from "../CardShell";
import { EntityList } from "./EntityList";

export async function RecentActivityCard() {
  const os = await loadDailyOS().catch(() => null);
  if (!os) {
    return (
      <CardShell title="פעילות אחרונה" subtitle="הישויות שלך · שלך בלבד" source="daily-os.deals (own, by lastActivityAt)">
        <CardUnavailable note="הפעילות אינה זמינה כעת" />
      </CardShell>
    );
  }
  const items = recentActivity(os);
  return (
    <CardShell title="פעילות אחרונה" subtitle="הישויות שלך · שלך בלבד" source="daily-os.deals (own, by lastActivityAt)">
      {items.length === 0 ? <p className="text-muted text-[12px]">אין פעילות אחרונה מתועדת.</p> : <EntityList items={items} show="activity" />}
    </CardShell>
  );
}
