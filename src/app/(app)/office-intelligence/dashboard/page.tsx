// 🏢 /office-intelligence/dashboard — Office Intelligence Dashboard (presentation only).
import { getIntelligenceExplorer } from "@/lib/intelligence-explorer/service";
import { OfficeIntelligenceDashboardView } from "./OfficeIntelligenceDashboardView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export default async function OfficeIntelligenceDashboardPage() {
  const data = await getIntelligenceExplorer();
  return <OfficeIntelligenceDashboardView offices={data.offices} />;
}
