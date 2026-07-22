// ============================================================================
// 🏛️ Member Workspace — the least-privileged home. Composes ONLY member-safe
// canonical surfaces (the Journey Overview + Coverage are built from providers
// that fail closed to member audience: no workload, no manager headline). The
// manager-only cards — Executive Decisions, Executive Memory, Organization
// Score, Broker Intelligence, Quick Actions — are NOT mounted here at all, so
// there is no manager leakage even before the providers' own audience gating.
// ============================================================================
import { CardBoundary } from "./CardBoundary";
import { JourneyOverviewCard } from "./cards/JourneyOverviewCard";
import { CoverageCard } from "./cards/CoverageCard";

export function MemberWorkspace() {
  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <div className="bg-card border-line rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
        <h2 className="text-ink text-base font-black">סביבת העבודה שלי</h2>
        <p className="text-muted mt-1 text-[12px]">תצוגה מותאמת להרשאות שלך — מבוססת ראיות בלבד.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <CardBoundary title="סקירת מסעות"><JourneyOverviewCard /></CardBoundary>
        <CardBoundary title="כיסוי"><CoverageCard /></CardBoundary>
      </div>
    </div>
  );
}
