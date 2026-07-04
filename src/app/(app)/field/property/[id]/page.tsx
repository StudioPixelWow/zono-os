// ============================================================================
// 📱 ZONO — Mobile Field Operations · Property Visit Mode (/field/property/[id]).
// 41.0. Composes the EXISTING property/seller/document reads into a mobile,
// one-hand visit view (cached for offline). Creation reuses approval-gated flows.
// ============================================================================
import { notFound } from "next/navigation";
import { getVisitMode } from "@/lib/field-ops/service";
import { VisitMode } from "@/components/field-ops/VisitMode";

export const dynamic = "force-dynamic";

export default async function FieldVisitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getVisitMode(id);
  if (!data) notFound();
  return <VisitMode data={data} />;
}
