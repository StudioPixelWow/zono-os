// ============================================================================
// 🏛️ Executive Workspace (manager) — the composed grid. Layout only: three
// bands, each card wrapped in <CardBoundary> so cards render progressively and
// in isolation. NO data fetching here — every card owns its own cached provider
// call. One card being unavailable or slow never affects the others.
// ============================================================================
import { CardBoundary } from "./CardBoundary";
import { DecisionsCard } from "./cards/DecisionsCard";
import { MemoryCard } from "./cards/MemoryCard";
import { MorningBriefCard } from "./cards/MorningBriefCard";
import { OrganizationScoreCard } from "./cards/OrganizationScoreCard";
import { JourneyOverviewCard } from "./cards/JourneyOverviewCard";
import { BrokerIntelligenceCard } from "./cards/BrokerIntelligenceCard";
import { MarketSummaryCard } from "./cards/MarketSummaryCard";
import { OpportunitySummaryCard } from "./cards/OpportunitySummaryCard";
import { CoverageCard } from "./cards/CoverageCard";
import { RecentActivityCard } from "./cards/RecentActivityCard";
import { QuickActionsCard } from "./cards/QuickActionsCard";

export function ExecutiveWorkspace() {
  return (
    <div dir="rtl" className="flex flex-col gap-5">
      {/* ── Top — decide, remember, brief ────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CardBoundary title="ההחלטות הניהוליות"><DecisionsCard /></CardBoundary>
        <CardBoundary title="הזיכרון הניהולי"><MemoryCard /></CardBoundary>
        <CardBoundary title="התדריך הבוקר"><MorningBriefCard /></CardBoundary>
      </div>

      {/* ── Middle — score, journeys, intelligence, market, opportunities ── */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CardBoundary title="ציון הארגון"><OrganizationScoreCard /></CardBoundary>
        <CardBoundary title="סקירת מסעות"><JourneyOverviewCard /></CardBoundary>
        <CardBoundary title="מודיעין מתווכים"><BrokerIntelligenceCard /></CardBoundary>
        <CardBoundary title="תמצית שוק"><MarketSummaryCard /></CardBoundary>
        <CardBoundary title="תמצית הזדמנויות"><OpportunitySummaryCard /></CardBoundary>
      </div>

      {/* ── Bottom — coverage, activity, quick actions ───────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CardBoundary title="כיסוי"><CoverageCard /></CardBoundary>
        <CardBoundary title="פעילות ניהולית אחרונה"><RecentActivityCard /></CardBoundary>
        <CardBoundary title="פעולות מהירות"><QuickActionsCard /></CardBoundary>
      </div>
    </div>
  );
}
