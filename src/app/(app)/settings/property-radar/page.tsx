import { getPropertyRadarSettingsPageData } from "@/lib/property-radar/settings/service";
import { PropertyRadarSettingsView } from "./PropertyRadarSettingsView";

export const dynamic = "force-dynamic";

/** Property Radar™ settings — authenticated org users only (guarded by app layout). */
export default async function PropertyRadarSettingsPage() {
  const data = await getPropertyRadarSettingsPageData();
  return <PropertyRadarSettingsView initial={data} />;
}
