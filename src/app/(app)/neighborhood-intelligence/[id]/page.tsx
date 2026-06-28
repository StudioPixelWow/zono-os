// ============================================================================
// 🗺️ /neighborhood-intelligence/[id] — Neighborhood Intelligence Profile.
// Presentation only: reads the existing territory intelligence via the agency
// intelligence API. The id encodes "city|neighborhood". No recompute.
// ============================================================================
import { notFound } from "next/navigation";
import { getTerritoryIntelligence } from "@/lib/agencies/api/agencyIntelligenceApi";
import { currentSessionOrgId } from "@/lib/agencies/api/agencyIntelligenceApiPermissions";
import { NeighborhoodProfileView } from "./NeighborhoodProfileView";

export const dynamic = "force-dynamic";

export default async function NeighborhoodIntelligencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [cityRaw, neighborhoodRaw] = decodeURIComponent(id).split("|");
  const city = (cityRaw ?? "").trim() || null;
  const neighborhood = (neighborhoodRaw ?? "").trim() || null;
  if (!city && !neighborhood) notFound();

  const orgId = await currentSessionOrgId();
  if (!orgId) notFound();

  let dto = null;
  try {
    dto = await getTerritoryIntelligence(orgId, { city, neighborhood });
  } catch (e) {
    console.error("[neighborhood-intelligence] load failed:", e);
  }
  if (!dto) notFound();

  return <NeighborhoodProfileView dto={dto} title={neighborhood ?? city ?? "שכונה"} />;
}
