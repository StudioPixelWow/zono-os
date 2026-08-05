import { getOffersCommandCenter, type OffersCommandCenter } from "@/lib/offers/service";
import { OffersView } from "./OffersView";

export const dynamic = "force-dynamic";

const EMPTY: OffersCommandCenter = { offers: [], open: 0, accepted: 0, awaitingSeller: 0, awaitingBuyer: 0 };

export default async function OffersPage() {
  let cc: OffersCommandCenter = EMPTY;
  try {
    cc = await getOffersCommandCenter();
  } catch (e) {
    console.error("[offers] load failed:", e);
  }
  return <OffersView cc={cc} />;
}
