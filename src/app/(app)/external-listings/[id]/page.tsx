import { notFound } from "next/navigation";
import { getExternalListingDetail } from "@/lib/external-listings/service";
import { resolveExternalListingContactForView } from "@/lib/properties/contact/property-contact-service";
import { ExternalListingDetailView } from "./ExternalListingDetailView";

export const dynamic = "force-dynamic";

export default async function ExternalListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let detail = null;
  try {
    detail = await getExternalListingDetail(id);
  } catch (e) {
    console.error("[external] detail load failed:", e);
  }
  if (!detail) notFound();

  // Same owner/broker contact CTA the CRM property page uses — built from the
  // discovered listing's public contact fields. Never blocks the page.
  const l = detail.listing;
  const contact = await resolveExternalListingContactForView({
    title: l.title ?? null,
    neighborhood: l.neighborhood ?? null,
    city: l.city ?? null,
    contact_name: l.contact_name ?? null,
    contact_phone: l.contact_phone ?? null,
    contact_type: l.contact_type ?? null,
    has_agent: l.has_agent ?? null,
  }).catch(() => null);

  return <ExternalListingDetailView detail={detail} contact={contact} />;
}
