// ============================================================================
// 🎯 ZONO — Broker Intelligence · Acquisition panel (server component).
// "Today's acquisition opportunities" — ranked, evidence-based, honest. Reads
// real external-listing signals via getAcquisitionIntelligence and renders each
// as a RecommendationCard. Shows honest coverage (scanned/actionable) and a
// truthful empty state when there's nothing evidence-backed to surface.
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";
import { getAcquisitionIntelligence } from "@/lib/broker-intelligence/acquisition-service";
import { RecommendationCard } from "./RecommendationCard";

export async function AcquisitionIntelligencePanel({ limit = 8 }: { limit?: number }) {
  const intel = await getAcquisitionIntelligence(limit);
  const actionable = intel.recommendations.filter((r) => !r.insufficientEvidence);

  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Sparkles" size={18} /></span>
          <div>
            <h3 className="text-ink text-sm font-black">הזדמנויות גיוס להיום</h3>
            <p className="text-muted text-[11px]">מבוסס-ראיות · {intel.actionable} ניתנות לפעולה מתוך {intel.scanned} שנסרקו</p>
          </div>
        </div>
      </div>

      {intel.scanned === 0 ? (
        <p className="text-muted py-8 text-center text-sm">אין מודעות חיצוניות סרוקות עדיין. הרץ סריקת שוק כדי לגלות הזדמנויות.</p>
      ) : actionable.length === 0 ? (
        <p className="text-muted py-8 text-center text-sm">נסרקו {intel.scanned} מודעות, אך אין כרגע הזדמנות עם מספיק ראיות לפעולה בטוחה. נמשיך לנטר.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {actionable.map((rec) => <RecommendationCard key={rec.id} rec={rec} />)}
        </div>
      )}
    </div>
  );
}
