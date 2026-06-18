import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { getPropertyById } from "@/lib/properties/repository";
import { updatePropertyAction } from "@/lib/properties/actions";
import { propertyLocation } from "@/lib/properties/labels";
import type { PropertyInput } from "@/lib/properties/types";
import { PropertyForm } from "../../PropertyForm";

export const dynamic = "force-dynamic";

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const p = await getPropertyById(id);
  if (!p) notFound();

  const loc = propertyLocation(p);
  const initial: Partial<PropertyInput> = {
    title: p.title,
    description: p.description,
    type: p.type,
    listingKind: p.listing_kind,
    status: p.status,
    price: p.price,
    monthlyRent: p.monthly_rent,
    rooms: p.rooms,
    sizeSqm: p.size_sqm,
    outdoorSqm: p.outdoor_sqm,
    floor: p.floor,
    totalFloors: p.total_floors,
    city: p.city,
    region: p.region,
    address: loc.address ?? "",
    neighborhood: loc.neighborhood ?? "",
    hasParking: p.has_parking,
    hasElevator: p.has_elevator,
    hasBalcony: p.has_balcony,
    hasSafeRoom: p.has_safe_room,
    hasStorage: p.has_storage,
    isAccessible: p.is_accessible,
    hasExclusivity: p.has_exclusivity,
    exclusivityEndsAt: p.exclusivity_ends_at ? p.exclusivity_ends_at.slice(0, 10) : null,
  };

  async function onSubmit(input: PropertyInput) {
    "use server";
    return updatePropertyAction(id, input);
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <Link
          href={`/properties/${id}`}
          className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold"
        >
          <Icon name="ChevronRight" size={16} />
          חזרה לנכס
        </Link>
        <h1 className="text-ink mt-2 text-2xl font-black">עריכת נכס</h1>
      </div>

      <PropertyForm
        initial={initial}
        submitLabel="שמור שינויים"
        cancelHref={`/properties/${id}`}
        onSubmit={onSubmit}
      />
    </div>
  );
}
