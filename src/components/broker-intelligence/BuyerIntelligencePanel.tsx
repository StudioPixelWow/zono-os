// ============================================================================
// 🧭 ZONO — Broker Intelligence · Buyer panel (server component).
// "הקונים שדורשים טיפול היום" — buyers ranked by business impact, each with ONE
// evidence-based Next Best Action. Reads real signals via getBuyerIntelligence
// and reuses the shared RecommendationCard. Honest empty state; not alphabetical.
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";
import { getBuyerIntelligence } from "@/lib/broker-intelligence/buyer-service";
import { RecommendationCard } from "./RecommendationCard";

export async function BuyerIntelligencePanel({ limit = 6 }: { limit?: number }) {
  const intel = await getBuyerIntelligence(limit);
  const actionable = intel.recommendations.filter((r) => !r.insufficientEvidence);

  if (intel.scanned === 0) return null; // no buyers yet — nothing to nag about

  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Sparkles" size={18} /></span>
        <div>
          <h3 className="text-ink text-sm font-black">הקונים שדורשים טיפול היום</h3>
          <p className="text-muted text-[11px]">מדורג לפי השפעה עסקית · {intel.actionable} לפעולה מתוך {intel.scanned} קונים</p>
        </div>
      </div>

      {actionable.length === 0 ? (
        <p className="text-muted py-6 text-center text-sm">אין כרגע קונה עם מספיק אותות אמת לפעולה. נמשיך לנטר פעילות, התאמות ומוכנות.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {actionable.map((rec) => <RecommendationCard key={rec.id} rec={rec} />)}
        </div>
      )}
    </div>
  );
}
