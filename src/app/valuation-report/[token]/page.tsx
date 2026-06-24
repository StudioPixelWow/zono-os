import { notFound } from "next/navigation";
import { getReportByToken } from "@/lib/valuation/report-service";

export const dynamic = "force-dynamic";

/**
 * Public seller-facing valuation report (no app shell, no auth). Renders the
 * stored branded HTML snapshot in an isolated iframe so its print-to-PDF styles
 * stay self-contained. Read by public_token via the service-role client.
 */
export default async function ValuationReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const report = await getReportByToken(token).catch(() => null);
  if (!report) notFound();

  return (
    <iframe
      title="דוח הערכת שווי"
      srcDoc={report.html}
      style={{ position: "fixed", inset: 0, width: "100%", height: "100%", border: "none" }}
    />
  );
}
