// ZONO — Competition Radar UI™ (Phase 26.8). Server entry: loads the radar bundle
// (real data only) and hands it to the client orchestrator. Honest empty states
// when there isn't yet enough agency intelligence.
import { getCompetitionRadarBundle } from "@/lib/agencies/ui/competitionRadarQueries";
import { CompetitionRadarPage } from "@/components/agencies/competition-radar/CompetitionRadarPage";

export const dynamic = "force-dynamic";

export default async function CompetitionRadarRoute() {
  let bundle;
  try {
    bundle = await getCompetitionRadarBundle();
  } catch (e) {
    console.error("[competition-radar] load failed:", e);
    bundle = {
      overview: { agencies: 0, agentsLinked: 0, territories: 0, activeSignals: 0, highThreat: 0, opportunities: 0 },
      agencies: [],
      scoredCount: 0,
      selected: null,
    };
  }
  return (
    <CompetitionRadarPage
      overview={bundle.overview}
      agencies={bundle.agencies}
      scoredCount={bundle.scoredCount}
      selected={bundle.selected}
    />
  );
}
