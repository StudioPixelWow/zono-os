import { getAcquisitionBoard, getAcquisitionCommandCenter, type AcquisitionCard, type AcquisitionCommandCenter } from "@/lib/acquisition/service";
import { AcquisitionView } from "./AcquisitionView";

export const dynamic = "force-dynamic";

export default async function AcquisitionPage() {
  let cards: AcquisitionCard[] = [];
  let cc: AcquisitionCommandCenter = { total: 0, highPriority: 0, privateSellers: 0, buyerDemand: 0, doubleSide: 0, contacted: 0 };
  try {
    [cards, cc] = await Promise.all([getAcquisitionBoard(), getAcquisitionCommandCenter()]);
  } catch (e) {
    console.error("[acquisition] load failed:", e);
  }
  return <AcquisitionView cards={cards} cc={cc} />;
}
