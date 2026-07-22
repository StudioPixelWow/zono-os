// ============================================================================
// 👤 Broker Workspace — the composed grid. Layout only: three bands, each card
// wrapped in <CardBoundary> for progressive independent streaming + isolation.
// NO data fetching here — every card owns its own cached broker-scoped provider
// call. One card being unavailable or slow never affects the others.
// ============================================================================
import { CardBoundary } from "./CardBoundary";
import { TodaysPrioritiesCard } from "./cards/TodaysPrioritiesCard";
import { MorningBriefCard } from "./cards/MorningBriefCard";
import { QuickActionsCard } from "./cards/QuickActionsCard";
import { JourneySummaryCard } from "./cards/JourneySummaryCard";
import { OpportunitiesCard } from "./cards/OpportunitiesCard";
import { BuyersCard } from "./cards/BuyersCard";
import { SellersCard } from "./cards/SellersCard";
import { CalendarCard } from "./cards/CalendarCard";
import { RecentActivityCard } from "./cards/RecentActivityCard";
import { CoverageCard } from "./cards/CoverageCard";
import { PerformanceCard } from "./cards/PerformanceCard";

export function BrokerWorkspace() {
  return (
    <div dir="rtl" className="flex flex-col gap-5">
      {/* ── Top — priorities, brief, quick actions ───────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CardBoundary title="המשימות של היום"><TodaysPrioritiesCard /></CardBoundary>
        <CardBoundary title="התדריך הבוקר"><MorningBriefCard /></CardBoundary>
        <CardBoundary title="פעולות מהירות"><QuickActionsCard /></CardBoundary>
      </div>

      {/* ── Middle — journeys, opportunities, buyers, sellers ────────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CardBoundary title="המסעות שלי"><JourneySummaryCard /></CardBoundary>
        <CardBoundary title="ההזדמנויות שלי"><OpportunitiesCard /></CardBoundary>
        <CardBoundary title="הקונים שלי"><BuyersCard /></CardBoundary>
        <CardBoundary title="המוכרים שלי"><SellersCard /></CardBoundary>
      </div>

      {/* ── Bottom — calendar, activity, coverage, performance ───────────── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CardBoundary title="היומן שלי"><CalendarCard /></CardBoundary>
        <CardBoundary title="פעילות אחרונה"><RecentActivityCard /></CardBoundary>
        <CardBoundary title="כיסוי"><CoverageCard /></CardBoundary>
        <CardBoundary title="תמונת ביצועים"><PerformanceCard /></CardBoundary>
      </div>
    </div>
  );
}
