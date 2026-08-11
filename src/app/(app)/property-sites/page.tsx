// ZONO — "אתרי נכסים" (Property Sites). Lists the broker's properties, each with
// its public /p/[id] marketing landing page (preview + copy-link). Org-scoped via
// the RLS session (listProperties). Drafts are excluded (wizard-internal).
import { listProperties } from "@/lib/properties/repository";
import { PropertySitesView, type PropertySiteItem } from "./PropertySitesView";

export const dynamic = "force-dynamic";

export default async function PropertySitesPage() {
  let items: PropertySiteItem[] = [];
  try {
    const rows = await listProperties({ includeArchived: false });
    items = rows.map((r) => {
      const p = r as unknown as {
        id: string; title: string | null; status: string; city: string | null; neighborhood: string | null;
        primary_image_url: string | null; listing_kind: string | null; price: number | null; monthly_rent: number | null;
      };
      return {
        id: p.id, title: p.title ?? "נכס", status: p.status, city: p.city ?? null, neighborhood: p.neighborhood ?? null,
        image: p.primary_image_url ?? null, listingKind: p.listing_kind ?? null, price: p.price ?? null, monthlyRent: p.monthly_rent ?? null,
      };
    });
  } catch (e) {
    console.error("[property-sites] load failed:", e);
  }
  return <PropertySitesView items={items} />;
}
