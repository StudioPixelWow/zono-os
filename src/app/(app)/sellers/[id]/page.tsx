import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { getSellerById } from "@/lib/sellers/repository";
import { getSellerCommandCenter } from "@/lib/seller-intelligence/service";
import { interestedBuyersForSeller } from "@/lib/matching-intelligence/service";
import { getSeller360 } from "@/lib/sellers/service360";
import { SellerCommandCenter } from "./SellerCommandCenter";
import { Seller360Sections } from "./Seller360Sections";
import { CommunicationSection } from "@/components/communication/CommunicationSection";
import { RelationshipSection } from "@/components/graph/RelationshipSection";
import { EntityRecommendationsPanel } from "@/components/recommendations/EntityRecommendationsPanel";
import { listRecommendationsForEntity } from "@/lib/recommendations/service";

export const dynamic = "force-dynamic";

export default async function SellerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const seller = await getSellerById(id);
  if (!seller) notFound();

  const [commandCenter, interestedBuyers, seller360] = await Promise.all([
    getSellerCommandCenter(id),
    interestedBuyersForSeller(id),
    getSeller360(id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/sellers" className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold">
          <Icon name="ChevronRight" size={16} />
          חזרה למוכרים
        </Link>
        <h1 className="text-ink mt-2 text-2xl font-black">{seller.full_name}</h1>
        <p className="text-muted text-sm">
          {seller.phone ?? "—"}
          {seller.email ? ` · ${seller.email}` : ""}
        </p>
      </div>

      {seller360 && <Seller360Sections seller={seller360.seller} properties={seller360.properties} />}

      <EntityRecommendationsPanel entityType="seller" entityId={id} recommendations={await listRecommendationsForEntity("seller", id).catch(() => [])} />
      <CommunicationSection entityType="seller" entityId={id} />
      <RelationshipSection entityType="seller" entityId={id} />

      <SellerCommandCenter sellerId={id} sellerName={seller.full_name} data={commandCenter} interestedBuyers={interestedBuyers} />
    </div>
  );
}
