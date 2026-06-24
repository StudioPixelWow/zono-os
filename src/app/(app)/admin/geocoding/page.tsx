import { GeocodingAdminView } from "./GeocodingAdminView";
import { getGeoCoverage } from "@/lib/maps/geo-coverage";

export const dynamic = "force-dynamic";

// Geo Intelligence Center: real coverage % per entity + "geocode missing" runner.
// Real geocoding only — see src/lib/maps/geocoding-actions.ts. No invented points.
export default async function GeocodingAdminPage() {
  const coverage = await getGeoCoverage().catch(() => []);
  return <GeocodingAdminView coverage={coverage} />;
}
