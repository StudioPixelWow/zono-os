import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { getSellerById } from "@/lib/sellers/repository";
import { getSellerCommandCenter } from "@/lib/seller-intelligence/service";
import { interestedBuyersForSeller } from "@/lib/matching-intelligence/service";
import { SellerCommandCenter } from "./SellerCommandCenter";

export const dynamic = "force-dynamic";

export default async function SellerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const seller = await getSellerById(id);
  if (!seller) notFound();

  const [commandCenter, interestedBuyers] = await Promise.all([
    getSellerCommandCenter(id),
    interestedBuyersForSeller(id),
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

      <SellerCommandCenter sellerId={id} sellerName={seller.full_name} data={commandCenter} interestedBuyers={interestedBuyers} />
    </div>
  );
}
