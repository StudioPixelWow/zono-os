// ============================================================================
// 🏢 /office-intelligence/[officeId] — per-office Intelligence Profile.
// Presentation only: reads the existing per-agency BIE composite via the
// agency intelligence API (RLS + org-isolation enforced there). No recompute.
// ============================================================================
import { notFound } from "next/navigation";
import { getAgencyIntelligenceAgency } from "@/lib/agencies/api/agencyIntelligenceApi";
import { currentSessionOrgId } from "@/lib/agencies/api/agencyIntelligenceApiPermissions";
import { OfficeIntelligenceProfileView } from "./OfficeIntelligenceProfileView";

export const dynamic = "force-dynamic";

export default async function OfficeIntelligenceProfilePage({ params }: { params: Promise<{ officeId: string }> }) {
  const { officeId } = await params;
  const orgId = await currentSessionOrgId();
  if (!orgId) notFound();

  let dto = null;
  try {
    dto = await getAgencyIntelligenceAgency(orgId, decodeURIComponent(officeId));
  } catch (e) {
    console.error("[office-intelligence] profile load failed:", e);
  }
  if (!dto) notFound();

  return <OfficeIntelligenceProfileView dto={dto} />;
}
