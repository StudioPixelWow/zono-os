import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { getSellerById } from "@/lib/sellers/repository";
import type { Seller360Input } from "@/lib/sellers/types";
import { SellerEditForm } from "./SellerEditForm";

export const dynamic = "force-dynamic";

/** Date columns come back as ISO timestamps; the date input wants YYYY-MM-DD. */
const toDateInput = (s: string | null): string => (s ? s.slice(0, 10) : "");

export default async function EditSellerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const seller = await getSellerById(id);
  if (!seller) notFound();

  // Map the live seller row → form input (reverse of the repository's to360Record).
  const initial: Partial<Seller360Input> = {
    fullName: seller.full_name ?? "",
    phone: seller.phone,
    secondaryPhone: seller.secondary_phone,
    email: seller.email,
    address: seller.address,
    city: seller.city,
    sellerType: seller.seller_type,
    motivationType: seller.motivation_type,
    motivationNotes: seller.motivation_notes,
    urgencyLevel: seller.urgency_level,
    targetSaleDate: toDateInput(seller.target_sale_date),
    mustSellBy: toDateInput(seller.must_sell_by),
    desiredPrice: seller.desired_price,
    minimumPrice: seller.minimum_price,
    dreamPrice: seller.dream_price,
    mortgageExists: seller.mortgage_exists ?? false,
    mortgageBalance: seller.mortgage_balance,
    financialNotes: seller.financial_notes,
    decisionStyle: seller.decision_style,
    mainObjection: seller.main_objection,
    negotiationSensitivity: seller.negotiation_sensitivity,
    priceSensitivityScore: seller.price_sensitivity_score ?? 50,
    timeSensitivityScore: seller.time_sensitivity_score ?? 50,
    trustSensitivityScore: seller.trust_sensitivity_score ?? 50,
    marketingOpennessScore: seller.marketing_openness_score ?? 50,
    negotiationFlexibilityScore: seller.negotiation_flexibility_score ?? 50,
    cooperationScore: seller.cooperation_score ?? 50,
    preferredContactMethod: seller.preferred_contact_method,
    preferredContactTime: seller.preferred_contact_time,
    communicationNotes: seller.communication_notes,
    availableForShowings: seller.available_for_showings ?? true,
    allowsMarketing: seller.allows_marketing ?? true,
    allowsSignage: seller.allows_signage ?? false,
    allowsExclusive: seller.allows_exclusive ?? false,
    hasSignedAgreement: seller.has_signed_agreement ?? false,
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <Link
          href={`/sellers/${id}`}
          className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold"
        >
          <Icon name="ChevronRight" size={16} />
          חזרה למוכר
        </Link>
        <h1 className="text-ink mt-2 text-2xl font-black">עריכת מוכר — {seller.full_name}</h1>
      </div>

      <SellerEditForm id={id} initial={initial} />
    </div>
  );
}
