// ============================================================================
// ZONO — Office Intelligence (/office/intelligence). "תובנות על המשרד" — explainable
// business patterns for managers/owners: real facts → deterministic analysis →
// insight with evidence + honest confidence → a management question. NOT the
// Command Center (that owns action NOW); this owns explanation. Server-gated
// (agents redirected). Records office_intelligence_opened. RTL. Period via ?period.
// ============================================================================
import { redirect } from "next/navigation";
import { getOfficeIntelligence, type IntelPeriod } from "@/lib/office/office-intelligence";
import { recordUsage } from "@/lib/launch/server/services";
import { OfficeIntelligenceView } from "./OfficeIntelligenceView";

export const dynamic = "force-dynamic";
const VALID: IntelPeriod[] = [7, 30, 90];

export default async function OfficeIntelligencePage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const sp = await searchParams;
  const period = (VALID.includes(Number(sp?.period) as IntelPeriod) ? Number(sp?.period) : 30) as IntelPeriod;

  const intel = await getOfficeIntelligence(period);
  if (!intel) redirect("/today/plan");   // agents / no active org

  await recordUsage({ category: "screen", name: "office_intelligence_opened", props: { period, learning: intel.learning } });
  return <OfficeIntelligenceView intel={intel} />;
}
