/**
 * Server containers that feed the presentational dashboard sections with real,
 * organization-scoped data from the intelligence layers. Each falls back to the
 * section's built-in mock default if the data load fails. Wrap in <Suspense>.
 */
import {
  getDealWidgets, getJourneyWidgets, getMarketWidgets, getMatchWidgets, getOpportunityWidgets,
} from "@/lib/dashboard/widgets";
import { getCurrentMarketHeatmap } from "@/lib/market/service";
import { heatNeighborhoods } from "@/data/mock";
import type { HeatNeighborhood } from "@/types/dashboard";
import { OpportunitiesSection } from "./OpportunitiesSection";
import { MatchingSection } from "./MatchingSection";
import { JourneysSection } from "./JourneysSection";
import { MarketSection } from "./MarketSection";
import { DealsSection } from "./DealsSection";
import { HeatmapSection } from "./HeatmapSection";

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

export async function HeatmapSectionContainer() {
  let neighborhoods: HeatNeighborhood[] | undefined;
  let insight: string | undefined;
  try {
    const cells = await getCurrentMarketHeatmap();
    if (cells.length) {
      // Phase 25.1 — real opportunity score + band + explainability reasons.
      neighborhoods = cells.slice(0, heatNeighborhoods.length).map((c, i) => {
        const slot = heatNeighborhoods[i];
        return { id: c.localityId ?? c.localityName, name: c.localityName, changePct: Math.round(c.demand - c.supply), tone: c.tone, label: c.bandLabel, score: c.opportunity, reasons: c.reasons, points: slot.points, labelX: slot.labelX, labelY: slot.labelY };
      });
      const top = cells[0];
      const topReason = top.reasons[0] ?? "";
      insight = `${top.localityName}: ${top.bandLabel} (${top.opportunity}/100)${topReason ? ` · ${topReason}` : ""}`;
    } else {
      neighborhoods = []; // real empty state (no fake data)
    }
  } catch (e) {
    console.error("[dashboard] heatmap failed:", e);
    neighborhoods = [];
  }
  return <HeatmapSection neighborhoods={neighborhoods} insight={insight} />;
}
