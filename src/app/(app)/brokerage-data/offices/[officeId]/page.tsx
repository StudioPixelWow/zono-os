// ============================================================================
// ZONO — Office Detail (/brokerage-data/offices/[officeId]). Full intelligence for
// one office on REAL, backfilled data: identity, KPI strip, agents, the org's
// observed listings, and a ranked-neighborhood territory. Server-gated, RTL.
// ============================================================================
import { notFound } from "next/navigation";
import { getOfficeDetail } from "@/lib/office-intel/office-detail";
import { OfficeDetailView } from "./OfficeDetailView";

export const dynamic = "force-dynamic";

export default async function OfficeDetailPage({ params }: { params: Promise<{ officeId: string }> }) {
  const { officeId } = await params;
  const detail = await getOfficeDetail(officeId);
  if (!detail) notFound();
  return <OfficeDetailView detail={detail} />;
}
