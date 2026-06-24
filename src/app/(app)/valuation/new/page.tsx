import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { ValuationWizard } from "./ValuationWizard";
import type { ValuationInput } from "@/lib/valuation/types";

export const dynamic = "force-dynamic";

export default async function NewValuationPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const { propertyId } = await searchParams;
  let initialInput: ValuationInput | undefined;

  if (propertyId) {
    const { profile } = await getSessionContext();
    if (profile?.org_id) {
      const db = await createClient();
      const { data } = await db.from("properties" as never)
        .select("city,neighborhood,name,street,building_number,property_type,rooms,size_sqm,outdoor_sqm,floor,total_floors,has_elevator,parking_count,has_storage,has_safe_room,latitude,longitude")
        .eq("id", propertyId).eq("org_id", profile.org_id).maybeSingle();
      const p = data as Record<string, unknown> | null;
      if (p) {
        const n = (x: unknown) => (x == null ? null : Number(x));
        initialInput = {
          city: (p.city as string) ?? null, neighborhood: (p.neighborhood as string) ?? null,
          street: (p.street as string) ?? (p.name as string) ?? null, houseNumber: (p.building_number as string) ?? null,
          propertyType: (p.property_type as string) ?? null, rooms: n(p.rooms), builtSqm: n(p.size_sqm),
          balconySqm: n(p.outdoor_sqm), floor: n(p.floor), totalFloors: n(p.total_floors),
          elevator: p.has_elevator == null ? null : Boolean(p.has_elevator),
          parkingCount: n(p.parking_count), storage: p.has_storage == null ? null : Boolean(p.has_storage),
          mamad: p.has_safe_room == null ? null : Boolean(p.has_safe_room),
          latitude: n(p.latitude), longitude: n(p.longitude),
        };
      }
    }
  }

  return <ValuationWizard initialInput={initialInput} propertyId={propertyId ?? null} />;
}
