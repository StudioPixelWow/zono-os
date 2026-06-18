import {
  createDraftProperty,
  listPropertyMedia,
  type PropertyRow,
} from "@/lib/properties/repository";
import { propertyLocation } from "@/lib/properties/labels";
import type { PropertyInput } from "@/lib/properties/types";
import { PropertyWizard } from "./PropertyWizard";

export const dynamic = "force-dynamic";

function rowToInput(p: PropertyRow): PropertyInput {
  const loc = propertyLocation(p);
  return {
    title: p.title === "טיוטה ללא שם" ? "" : p.title,
    description: p.description,
    type: p.type,
    listingKind: p.listing_kind,
    status: p.status,
    price: p.price || 0,
    monthlyRent: p.monthly_rent,
    rooms: p.rooms,
    sizeSqm: p.size_sqm,
    outdoorSqm: p.outdoor_sqm,
    floor: p.floor,
    totalFloors: p.total_floors,
    city: p.city,
    region: p.region,
    address: loc.address ?? "",
    neighborhood: p.neighborhood ?? loc.neighborhood ?? "",
    buildingNumber: p.building_number,
    latitude: p.latitude,
    longitude: p.longitude,
    showExactAddress: p.show_exact_address,
    showNeighborhoodOnly: p.show_neighborhood_only,
    hasParking: p.has_parking,
    hasElevator: p.has_elevator,
    hasBalcony: p.has_balcony,
    hasSafeRoom: p.has_safe_room,
    hasStorage: p.has_storage,
    isAccessible: p.is_accessible,
    parkingCount: p.parking_count,
    storageCount: p.storage_count,
    balconyCount: p.balcony_count,
    features: Array.isArray(p.features) ? (p.features as string[]) : [],
    listingTag: p.listing_tag,
    availabilityDate: p.availability_date,
    priceBeforeDiscount: p.price_before_discount,
    pricePerSqm: p.price_per_sqm,
    marketingDescription: p.marketing_description,
    aiDescription: p.ai_description,
    internalNotes: p.internal_notes,
    targetAudience: p.target_audience,
    primaryImageUrl: p.primary_image_url,
    hasExclusivity: p.has_exclusivity,
    exclusivityEndsAt: p.exclusivity_ends_at
      ? p.exclusivity_ends_at.slice(0, 10)
      : null,
  };
}

export default async function NewPropertyPage() {
  const draft = await createDraftProperty();
  const media = await listPropertyMedia(draft.id);

  return (
    <PropertyWizard
      draftId={draft.id}
      initial={rowToInput(draft)}
      initialMedia={media}
    />
  );
}
