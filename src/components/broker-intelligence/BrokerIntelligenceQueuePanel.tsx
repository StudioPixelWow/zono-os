// ============================================================================
// 🧠 ZONO — Broker Intelligence · Global queue panel (server component).
// The drop-in surface for the ONE shared priority queue. Any surface (Home V3,
// Daily OS, Today, Executive OS) mounts this to show the highest-impact, deduped,
// evidence-based recommendations across ALL areas — the broker never has to visit
// Acquisition/Buyer/Seller/Deal to find what needs attention. Reuses the shared
// RecommendationCard. Honest empty state.
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";
import { getBrokerIntelligenceQueue, type QueueOptions } from "@/lib/broker-intelligence/aggregate-service";
import { RecommendationCard } from "./RecommendationCard";

export async function BrokerIntelligenceQueuePanel({
  title = "מה דורש טיפול היום",
  subtitle = "ההמלצות בעלות ההשפעה הגבוהה ביותר — מכל תחומי המודיעין, מדורג ומאוחד",
  options = { limit: 6 },
}: { title?: string; subtitle?: string; options?: QueueOptions }) {
  const queue = await getBrokerIntelligenceQueue(options);
  if (queue.total === 0) return null; // nothing evidence-backed to surface — stay quiet

  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Sparkles" size={18} /></span>
        <div>
          <h3 className="text-ink text-sm font-black">{title}</h3>
          <p className="text-muted text-[11px]">{subtitle} · {queue.total} פעולות פתוחות</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {queue.items.map((rec) => <RecommendationCard key={rec.id} rec={rec} />)}
      </div>
    </div>
  );
}
