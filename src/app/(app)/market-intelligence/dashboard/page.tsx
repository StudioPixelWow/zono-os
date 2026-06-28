// 🌍 /market-intelligence/dashboard — Market Intelligence Dashboard (presentation only).
import { getIntelligenceDashboard } from "@/lib/intelligence-explorer/dashboard";
import { MarketIntelligenceDashboardView } from "./MarketIntelligenceDashboardView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export default async function MarketIntelligenceDashboardPage() {
  const data = await getIntelligenceDashboard();
  return <MarketIntelligenceDashboardView data={data} />;
}
