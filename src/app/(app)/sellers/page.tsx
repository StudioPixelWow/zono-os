import { listSellers, sellerPropertyCounts, type SellerRow } from "@/lib/sellers/repository";
import { listSellerBoard } from "@/lib/seller-intelligence/service";
import { sellerIntelligenceRepository } from "@/lib/seller-intelligence/repository";
import type { SellerIntel } from "@/lib/sellers/insights";
import { SellersWorkspace, type IntelMembership } from "./components/SellersWorkspace";

export const dynamic = "force-dynamic";

export default async function SellersPage() {
  let sellers: SellerRow[] = [];
  let error = false;
  try {
    sellers = await listSellers();
  } catch (e) {
    console.error("[sellers] list failed:", e);
    error = true;
  }

  const counts: Record<string, number> = {};
  const profiles: Record<string, SellerIntel> = {};
  let intel: IntelMembership | null = null;
  try {
    const [board, countMap, profileRows] = await Promise.all([
      listSellerBoard(),
      sellerPropertyCounts(),
      sellerIntelligenceRepository.listForOrg(),
    ]);
    for (const [id, n] of countMap) counts[id] = n;
    for (const p of profileRows) profiles[p.seller_id] = p;
    intel = {
      needingAttention: board.needingAttention.map((x) => x.sellerId),
      highChurn: board.highChurn.map((x) => x.sellerId),
      lowTrust: board.lowTrust.map((x) => x.sellerId),
      noContact: board.noContact.map((x) => x.sellerId),
      upcomingCommitments: board.upcomingCommitments.map((x) => x.sellerId),
      trustChanges: board.trustChanges.map((x) => x.sellerId),
    };
  } catch (e) {
    console.error("[sellers] board failed:", e);
  }

  return (
    <SellersWorkspace
      sellers={sellers}
      profiles={profiles}
      counts={counts}
      intel={intel}
      error={error}
    />
  );
}
