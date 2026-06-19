/**
 * Server containers that feed the presentational dashboard sections with real,
 * organization-scoped data from the intelligence layers. Each falls back to the
 * section's built-in mock default if the data load fails. Wrap in <Suspense>.
 */
import {
  getDealWidgets, getJourneyWidgets, getMarketWidgets, getMatchWidgets, getOpportunityWidgets,
} from "@/lib/dashboard/widgets";
import { OpportunitiesSection } from "./OpportunitiesSection";
import { MatchingSection } from "./MatchingSection";
import { JourneysSection } from "./JourneysSection";
import { MarketSection } from "./MarketSection";
import { DealsSection } from "./DealsSection";

export async function OpportunitiesSectionContainer() {
  let items;
  try { items = await getOpportunityWidgets(); } catch (e) { console.error("[dashboard] opportunities failed:", e); }
  return <OpportunitiesSection items={items} />;
}

export async function MatchingSectionContainer() {
  let data;
  try { data = await getMatchWidgets(); } catch (e) { console.error("[dashboard] matches failed:", e); }
  return <MatchingSection matches={data?.matches} note={data?.note} />;
}

export async function JourneysSectionContainer() {
  let data;
  try { data = await getJourneyWidgets(); } catch (e) { console.error("[dashboard] journeys failed:", e); }
  return <JourneysSection stages={data?.stages} properties={data?.properties} />;
}

export async function MarketSectionContainer() {
  let stats;
  try { stats = await getMarketWidgets(); } catch (e) { console.error("[dashboard] market failed:", e); }
  return <MarketSection stats={stats} />;
}

export async function DealsSectionContainer() {
  let deals;
  try { deals = await getDealWidgets(); } catch (e) { console.error("[dashboard] deals failed:", e); }
  return <DealsSection deals={deals} />;
}
