import { getPortalCommandCenter, type PortalCommandCenter } from "@/lib/client-portals/service";
import { PortalsView } from "./PortalsView";

export const dynamic = "force-dynamic";

const EMPTY: PortalCommandCenter = { total: 0, active: 0, buyer: 0, seller: 0, viewsToday: 0, inactive: 0, notViewed: 0, portals: [] };

export default async function PortalsPage() {
  let cc: PortalCommandCenter;
  try {
    cc = await getPortalCommandCenter();
  } catch (e) {
    console.error("[portals] load failed:", e);
    cc = EMPTY;
  }
  return <PortalsView cc={cc} />;
}
