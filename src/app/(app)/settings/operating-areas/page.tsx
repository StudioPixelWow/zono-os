import { getMyOperatingAreas } from "@/lib/operating-areas/service";
import { OperatingAreasView } from "./OperatingAreasView";

export const dynamic = "force-dynamic";

export default async function OperatingAreasPage() {
  const { areas, canManageOthers } = await getMyOperatingAreas();
  return <OperatingAreasView areas={areas} canManageOthers={canManageOthers} />;
}
