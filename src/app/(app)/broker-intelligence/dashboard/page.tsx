// 👤 /broker-intelligence/dashboard — real Broker Directory (presentation only).
// CANONICAL source: brokerage_agents + brokerage_external_listing_links (the same
// single source of truth as /brokerage-data). Replaces the old broker_profiles
// board whose listings_count was never updated by the Listing→Broker pipeline.
import { getBrokerDirectoryAction } from "@/lib/brokerage-data/actions";
import { BrokerDirectoryView } from "./BrokerIntelligenceDashboardView";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

export default async function BrokerIntelligenceDashboardPage() {
  const directory = await getBrokerDirectoryAction();
  return <BrokerDirectoryView directory={directory} />;
}
