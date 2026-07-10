// ============================================================================
// 🛡️ ZONO — Broker Intelligence · Seller panel (server component).
// "מוכרים שדורשים טיפול היום" — sellers ranked by business impact, each with ONE
// proactive, evidence-based Next Best Action (retention / pricing / marketing /
// follow-up). Reads real signals via getSellerIntelligence and reuses the shared
// RecommendationCard. Honest empty state; not alphabetical.
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";
import { getSellerIntelligence } from "@/lib/broker-intelligence/seller-service";
import { RecommendationCard } from "./RecommendationCard";

export async function SellerIntelligencePanel({ limit = 6 }: { limit?: number }) {
  const intel = await getSellerIntelligence(limit);
  const actionable = intel.recommendations.filter((r) => !r.insufficientEvidence);

  if (intel.scanned === 0) return null;

  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="ShieldCheck" size={18} /></span>
        <div>
          <h3 className="text-ink text-sm font-black">מוכרים שדורשים טיפול היום</h3>
          <p className="text-muted text-[11px]">מדורג לפי השפעה עסקית · {intel.actionable} לפעולה מתוך {intel.scanned} מוכרים</p>
        </div>
      </div>

      {actionable.length === 0 ? (
        <p className="text-muted py-6 text-center text-sm">אין כרגע מוכר עם מספיק אותות אמת לפעולה. נמשיך לנטר סיכון נטישה, ביצועי מודעה ומחיר.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {actionable.map((rec) => <RecommendationCard key={rec.id} rec={rec} />)}
        </div>
      )}
    </div>
  );
}
