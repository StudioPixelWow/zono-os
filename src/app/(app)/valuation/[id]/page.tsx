import { notFound } from "next/navigation";
import { getValuation } from "@/lib/valuation/service";
import { getLatestReport } from "@/lib/valuation/report-service";
import { ValuationResultView } from "./ValuationResultView";

export const dynamic = "force-dynamic";

export default async function ValuationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const record = await getValuation(id);
  if (!record) notFound();
  const report = await getLatestReport(id).catch(() => null);

  return <ValuationResultView record={record} initialReportToken={report?.token ?? null} />;
}
