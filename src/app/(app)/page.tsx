import { listProperties, type PropertyRow } from "@/lib/properties/repository";
import { getSessionContext } from "@/lib/auth/session";
import { getDashboardDict } from "@/lib/dashboard-home/i18n";
import { buildDashboardHomeData } from "@/lib/dashboard-home/data";
import { DashboardHomeView } from "@/components/dashboard-home/DashboardHomeView";

// Reads live data on the server (properties woven into the command center).
export const dynamic = "force-dynamic";

export default async function Home() {
  const { profile } = await getSessionContext();
  const agentName = (profile?.full_name ?? "").trim().split(/\s+/)[0] || "סוכן";
  const cityName = profile?.primary_city ?? undefined;

  let properties: PropertyRow[] = [];
  try {
    properties = await listProperties({});
  } catch (e) {
    console.error("[home] properties failed:", e);
  }

  const dict = getDashboardDict("he");
  const data = buildDashboardHomeData({ agentName, cityName, realProperties: properties });

  return <DashboardHomeView dict={dict} data={data} />;
}
