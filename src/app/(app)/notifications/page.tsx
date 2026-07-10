import { getNotificationFeed } from "@/lib/notifications/service";
import { NotificationsView } from "./NotificationsView";
import { BrokerIntelligenceQueuePanel } from "@/components/broker-intelligence/BrokerIntelligenceQueuePanel";

export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const feed = await getNotificationFeed(category);
  return (
    <div className="flex flex-col gap-5">
      {/* Attention threshold: only URGENT intelligence (priority ≥ 65) surfaces
          here so the broker isn't spammed — everything else lives on Today. */}
      <BrokerIntelligenceQueuePanel
        title="דורש תשומת לב דחופה"
        subtitle="המלצות דחופות בלבד — מעל סף הדחיפות"
        options={{ minPriority: 65, limit: 6 }}
      />
      <NotificationsView feed={feed} active={category ?? ""} />
    </div>
  );
}
