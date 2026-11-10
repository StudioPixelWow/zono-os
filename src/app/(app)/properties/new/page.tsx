import Link from "next/link";
import {
  getOrCreateDraftProperty,
  createDraftProperty,
  listPropertyMedia,
  type PropertyRow,
} from "@/lib/properties/repository";
import { propertyLocation } from "@/lib/properties/labels";
import type { PropertyInput } from "@/lib/properties/types";
import { getSessionContext } from "@/lib/auth/session";
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
    marketingAudiences: Array.isArray(p.marketing_audiences)
      ? (p.marketing_audiences as string[])
      : [],
    primaryImageUrl: p.primary_image_url,
    hasExclusivity: p.has_exclusivity,
    exclusivityEndsAt: p.exclusivity_ends_at
      ? p.exclusivity_ends_at.slice(0, 10)
      : null,
  };
}

/** P7.1B block UX: at the monitoredListings cap, the wizard can't open a new
 *  draft. Show a clean Hebrew notice (no SQL/RPC/stack) instead of crashing. */
function ListingLimitReached() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <h1 className="text-xl font-semibold">הגעתם למכסת הנכסים בתוכנית</h1>
      <p className="text-sm text-muted-foreground">
        כדי להוסיף נכס חדש יש לשדרג את התוכנית או להעביר נכס קיים לארכיון.
      </p>
      <Link href="/properties" className="text-sm font-medium text-primary underline underline-offset-4">
        חזרה לרשימת הנכסים
      </Link>
    </div>
  );
}

export default async function NewPropertyPage({ searchParams }: { searchParams: Promise<{ fresh?: string }> }) {
  const { fresh } = await searchParams;
  // Resume an existing in-progress draft instead of inserting a new row every
  // visit — prevents the "saved twice (one with images, one without)" bug.
  let draft: PropertyRow;
  try {
    // ?fresh=1 → the agent explicitly asked for a brand-new listing.
    draft = fresh === "1" ? await createDraftProperty() : await getOrCreateDraftProperty();
  } catch (e) {
    if (e instanceof Error && e.message === "LIMIT_REACHED") return <ListingLimitReached />;
    throw e;
  }
  const media = await listPropertyMedia(draft.id);

  // P9.0C — city-first context: prefill the office's primary city into a fresh
  // draft (contextual only; the agent can change it, and nothing is committed
  // until they save). Never overrides a city the draft already has.
  const initial = rowToInput(draft);
  if (!initial.city) {
    try {
      const { organization, profile } = await getSessionContext();
      initial.city = organization?.city ?? profile?.primary_city ?? organization?.operating_cities?.[0] ?? null;
    } catch { /* best-effort prefill */ }
  }

  // Resuming a draft that already has content → say so, and offer a clean start
  // (previously "הוסף נכס" silently opened an old, half-filled listing).
  const resuming = fresh !== "1" && (!!initial.title || media.length > 0 || (initial.price ?? 0) > 0);

  return (
    <>
      {resuming && (
        <div dir="rtl" className="bg-brand-soft border-brand-light mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border px-4 py-3 text-sm">
          <span className="text-ink font-bold">ממשיכים טיוטה שהתחלת{initial.title ? `: ${initial.title}` : ""}</span>
          <Link href="/properties/new?fresh=1" className="bg-brand rounded-xl px-3 py-1.5 text-xs font-black text-white">התחל נכס חדש</Link>
        </div>
      )}
      <PropertyWizard
        key={draft.id}
        draftId={draft.id}
        initial={initial}
        initialMedia={media}
      />
    </>
  );
}
