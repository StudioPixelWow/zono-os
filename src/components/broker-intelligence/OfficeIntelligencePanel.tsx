// ============================================================================
// 🏢 ZONO — Broker Intelligence · Office panel (server component, manager view).
// Surfaces the four things a manager must see automatically — highest office
// opportunity, highest risk, biggest revenue opportunity, biggest retention risk
// — all from the SAME shared priority queue. Reuses the shared RecommendationCard.
// Honest empty state.
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";
import { getOfficeIntelligence } from "@/lib/broker-intelligence/office-service";
import { RecommendationCard } from "./RecommendationCard";
import type { PrioritizedRecommendation } from "@/lib/broker-intelligence/priority";

export async function OfficeIntelligencePanel() {
  const s = await getOfficeIntelligence();
  const cells: { label: string; rec: PrioritizedRecommendation | null }[] = [
    { label: "ההזדמנות הגדולה של המשרד", rec: s.topOpportunity },
    { label: "הסיכון הגבוה ביותר", rec: s.topRisk },
    { label: "הזדמנות ההכנסה הגדולה", rec: s.biggestRevenue },
    { label: "סיכון השימור הגבוה", rec: s.biggestRetention },
  ].filter((c) => c.rec);

  if (cells.length === 0) return null;

  // De-dup: the same rec can be both e.g. top opportunity and biggest revenue.
  const seen = new Set<string>();

  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Building2" size={18} /></span>
        <div>
          <h3 className="text-ink text-sm font-black">מודיעין משרד — למנהל</h3>
          <p className="text-muted text-[11px]">הזדמנויות וסיכונים בעלי ההשפעה הגבוהה ביותר · {s.totalActionable} פעולות פתוחות</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {cells.map((c) => {
          const dup = c.rec && seen.has(c.rec.id);
          if (c.rec) seen.add(c.rec.id);
          return (
            <div key={c.label}>
              <p className="text-muted mb-1.5 text-[11px] font-black">{c.label}</p>
              {c.rec && !dup ? <RecommendationCard rec={c.rec} /> : (
                <p className="text-muted bg-surface rounded-xl px-3 py-4 text-center text-[12px]">{dup ? "זהה לפריט אחר למעלה" : "אין פריט מתאים"}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
