// ============================================================================
// 🏢 /brokerage-data/office/[id] — Brokerage Office profile.
// Shows the office header + stats + its linked agents + its listings/properties
// from real connected data (brokerage_offices · agents · listing links). No
// recompute, no fabrication.
// ============================================================================
import { notFound } from "next/navigation";
import { getBrokerageOfficeProfile } from "@/lib/brokerage-data/office-profile";
import { getOfficeInventory } from "@/lib/brokerage-data/office-inventory";
import { getOfficeBrokerRanking } from "@/lib/brokerage-data/broker-intelligence";
import { getOfficeTerritory } from "@/lib/brokerage-data/territory-intelligence";
import { getOfficeCompetitiveProfile } from "@/lib/brokerage-data/competitive-intelligence";
import { getOfficeDecisionPackage } from "@/lib/decision-engine";
import { listEntityMissions } from "@/lib/mission-engine";
import { OfficeProfileView } from "./OfficeProfileView";

export const dynamic = "force-dynamic";

export default async function BrokerageOfficeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const officeId = decodeURIComponent(id);
  let profile = null, inventory = null, ranking = [] as Awaited<ReturnType<typeof getOfficeBrokerRanking>>;
  let territory = null as Awaited<ReturnType<typeof getOfficeTerritory>>;
  let competitive = null as Awaited<ReturnType<typeof getOfficeCompetitiveProfile>>;
  let decisions = null as Awaited<ReturnType<typeof getOfficeDecisionPackage>>;
  let missions = [] as Awaited<ReturnType<typeof listEntityMissions>>;
  try {
    [profile, inventory, ranking, territory, competitive, decisions, missions] = await Promise.all([
      getBrokerageOfficeProfile(officeId),
      getOfficeInventory(officeId).catch(() => null),
      getOfficeBrokerRanking(officeId).catch(() => []),
      getOfficeTerritory(officeId).catch(() => null),
      getOfficeCompetitiveProfile(officeId).catch(() => null),
      getOfficeDecisionPackage(officeId).catch(() => null),
      listEntityMissions("office", officeId).catch(() => []),
    ]);
  } catch (e) {
    console.error("[brokerage-office] profile load failed:", e);
  }
  if (!profile) notFound();
  return <OfficeProfileView profile={profile} inventory={inventory} ranking={ranking} territory={territory} competitive={competitive} decisions={decisions} officeId={officeId} missions={missions} />;
}
