import { notFound } from "next/navigation";
import { getExternalListingDetail } from "@/lib/external-listings/service";
import { ExternalListingDetailView } from "./ExternalListingDetailView";

export const dynamic = "force-dynamic";

export default async function ExternalListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail = null;
  try {
    detail = await getExternalListingDetail(id);
  } catch (e) {
    console.error("[external] detail load failed:", e);
  }
  if (!detail) notFound();
  return <ExternalListingDetailView detail={detail} />;
}
