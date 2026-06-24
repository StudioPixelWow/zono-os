import { GeocodingAdminView } from "./GeocodingAdminView";

export const dynamic = "force-dynamic";

// Admin tool: "Geocode missing locations" for properties / external listings /
// transactions. Real geocoding only — see src/lib/maps/geocoding-actions.ts.
export default function GeocodingAdminPage() {
  return <GeocodingAdminView />;
}
