import { getCommunicationHealth } from "@/lib/communication/service";
import { CommunicationHealthCard } from "./CommunicationPanel";

/** Server wrapper: fetches communication health and renders the panel. */
export async function CommunicationSection({ entityType, entityId }: { entityType: string; entityId: string }) {
  let health;
  try {
    health = await getCommunicationHealth(entityType, entityId);
  } catch (e) {
    console.error("[communication] health load failed:", e);
    return null;
  }
  return <CommunicationHealthCard entityType={entityType} entityId={entityId} health={health} />;
}
