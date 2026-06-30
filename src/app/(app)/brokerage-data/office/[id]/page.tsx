// ============================================================================
// 🏢 /brokerage-data/office/[id] — Brokerage Office profile.
// Shows the office header + stats + its linked agents + its listings/properties
// from real connected data (brokerage_offices · agents · listing links). No
// recompute, no fabrication.
// ============================================================================
import { notFound } from "next/navigation";
import { getBrokerageOfficeProfile } from "@/lib/brokerage-data/office-profile";
import { OfficeProfileView } from "./OfficeProfileView";

export const dynamic = "force-dynamic";

export default async function BrokerageOfficeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let profile = null;
  try {
    profile = await getBrokerageOfficeProfile(decodeURIComponent(id));
  } catch (e) {
    console.error("[brokerage-office] profile load failed:", e);
  }
  if (!profile) notFound();
  return <OfficeProfileView profile={profile} />;
}
