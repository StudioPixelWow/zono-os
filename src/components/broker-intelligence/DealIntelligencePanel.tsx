// ============================================================================
// 🤝 ZONO — Broker Intelligence · Deal panel (server component).
// "עסקאות בסיכון היום" — deals ranked by business impact, each with ONE action to
// unstick them (objections / overdue close / stalled velocity). Escalates ONLY
// meaningful risk; healthy deals are never shown. Reuses the shared card.
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";
import { getDealIntelligence } from "@/lib/broker-intelligence/deal-service";
import { RecommendationCard } from "./RecommendationCard";

export async function DealIntelligencePanel({ limit = 6 }: { limit?: number }) {
  const intel = await getDealIntelligence(limit);
  const actionable = intel.recommendations.filter((r) => !r.insufficientEvidence);

  if (intel.scanned === 0 || actionable.length === 0) return null; // no meaningful risk → stay quiet

  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="bg-danger-soft text-danger grid h-9 w-9 place-items-center rounded-xl"><Icon name="AlertTriangle" size={18} /></span>
        <div>
          <h3 className="text-ink text-sm font-black">עסקאות בסיכון היום</h3>
          <p className="text-muted text-[11px]">מדורג לפי השפעה עסקית · {intel.actionable} בסיכון מתוך {intel.scanned} עסקאות פעילות</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {actionable.map((rec) => <RecommendationCard key={rec.id} rec={rec} />)}
      </div>
    </div>
  );
}
