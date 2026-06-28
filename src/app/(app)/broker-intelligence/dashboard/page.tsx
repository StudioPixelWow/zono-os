// 👤 /broker-intelligence/dashboard — Broker Intelligence Dashboard (presentation only).
import { getIntelligenceExplorer } from "@/lib/intelligence-explorer/service";
import { BrokerIntelligenceDashboardView } from "./BrokerIntelligenceDashboardView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export default async function BrokerIntelligenceDashboardPage() {
  const data = await getIntelligenceExplorer();
  return <BrokerIntelligenceDashboardView brokers={data.brokers} />;
}
