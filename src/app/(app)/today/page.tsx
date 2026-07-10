// ============================================================================
// ☀️ ZONO — Daily AI Operating System page (/today). 40.0.
// The new default workspace: one morning surface unifying the existing broker
// workspace (missions/inbox/whatsapp/facebook/website/territory/performance) +
// Chief-of-Staff executive mode. Cached read-only; approval-gated CTAs.
// ============================================================================
import { getDailyOS } from "@/lib/daily-os/service";
import { DailyOS } from "@/components/daily-os/DailyOS";
import { BrokerIntelligenceQueuePanel } from "@/components/broker-intelligence/BrokerIntelligenceQueuePanel";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const data = await getDailyOS();
  return (
    <div dir="rtl" className="flex flex-col gap-6">
      {/* The shared Broker-Intelligence priority queue — highest-impact, deduped,
          evidence-based recommendations across all areas, first thing each morning. */}
      <BrokerIntelligenceQueuePanel title="המשימה של היום" options={{ limit: 6 }} />
      <DailyOS data={data} />
    </div>
  );
}
