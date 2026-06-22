import { getCreativeStudio, type CreativeStudio } from "@/lib/creative-studio/service";
import { listConcepts, type ConceptRow } from "@/lib/creative-studio/concept-service";
import { listCampaigns, listEntityCampaignAssets, type CampaignListItem, type CampaignAssetRow } from "@/lib/creative-studio/campaign-service";
import { listEntityCreativeAssets, type CreativeAssetRow } from "@/lib/creative-studio/asset-service";
import { listEntityCopy, type CopyRow } from "@/lib/creative-studio/copy-service";
import { listEntityOutputs, type OutputRow } from "@/lib/creative-studio/output-service";
import { listEntityVisuals, type VisualRow } from "@/lib/creative-studio/visual-service";
import { listQuickOutputs, type QuickOutputRow } from "@/lib/creative-studio/quick-creative-service";
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/utils";
import { CreativeStudioView } from "../../CreativeStudioView";

export const dynamic = "force-dynamic";

export default async function CreativeStudioEntityPage({ params }: { params: Promise<{ entityType: string; entityId: string }> }) {
  const { entityType, entityId: rawEntityId } = await params;
  const entityId = decodeURIComponent(rawEntityId);

  // Guard: never run uuid queries with a human-readable name/slug (#P2-8).
  if (!isUuid(entityId)) {
    return (
      <main dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-10 text-center">
        <h1 className="text-ink text-xl font-black">בחירת ישות לא תקינה</h1>
        <p className="text-muted mt-2 text-sm">פתיחת קריאייטיב לישות מתבצעת מהבחירה ב-ZONO קריאייטיב — לא דרך הקלדת מזהה.</p>
        <Link href="/creative" className="text-brand-strong mt-4 inline-block text-sm font-bold">← חזרה ל-ZONO קריאייטיב</Link>
      </main>
    );
  }
  let studio: CreativeStudio | null = null;
  let concepts: ConceptRow[] = [];
  let campaigns: CampaignListItem[] = [];
  let campaignAssets: CampaignAssetRow[] = [];
  let creativeAssets: CreativeAssetRow[] = [];
  let copyAssets: CopyRow[] = [];
  let creativeOutputs: OutputRow[] = [];
  let visuals: VisualRow[] = [];
  let quickOutputs: QuickOutputRow[] = [];
  let orgId = ""; let userId = ""; let isManager = false;
  let quickPrefill: Record<string, string | boolean | number> | undefined;
  try {
    const { user, profile } = await getSessionContext();
    orgId = profile?.org_id ?? ""; userId = user?.id ?? "";
    try { const sb = await createClient(); const { data } = await sb.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* default */ }
    studio = await getCreativeStudio(entityType, entityId);
    concepts = await listConcepts(entityType, entityId);
    campaigns = await listCampaigns(entityType, entityId);
    campaignAssets = await listEntityCampaignAssets(entityType, entityId);
    creativeAssets = await listEntityCreativeAssets(entityType, entityId);
    copyAssets = await listEntityCopy(entityType, entityId);
    creativeOutputs = await listEntityOutputs(entityType, entityId);
    visuals = await listEntityVisuals(entityType, entityId);
    quickOutputs = await listQuickOutputs({ entityType, entityId });
    // Prefill the quick-creative wizard from the property so the agent never
    // retypes address/price/rooms/area/floor/parking/image (#P3-4).
    if (entityType === "property") {
      try {
        const { getPropertyById, getPropertyMedia } = await import("@/lib/properties/repository");
        const { propertyLocation } = await import("@/lib/properties/labels");
        const [p, mediaRes] = await Promise.all([getPropertyById(entityId), getPropertyMedia(entityId)]);
        if (p) {
          const loc = propertyLocation(p);
          quickPrefill = {
            address: [loc.address, p.building_number].filter(Boolean).join(" ") || p.title || "",
            city: p.city ?? "",
            neighborhood: p.neighborhood ?? loc.neighborhood ?? "",
            price: p.price ? String(p.price) : "",
            rooms: p.rooms != null ? String(p.rooms) : "",
            sizeSqm: p.size_sqm != null ? String(p.size_sqm) : "",
            floor: p.floor != null ? String(p.floor) : "",
            parking: p.parking_count != null ? String(p.parking_count) : "",
            storage: Boolean(p.has_storage),
            balcony: Boolean(p.has_balcony),
            elevator: Boolean(p.has_elevator),
            importantText: p.marketing_description ?? p.description ?? "",
            propertyImage: mediaRes.coverUrl ?? "",
          };
        }
      } catch (e) { console.error("[creative-studio] property prefill failed:", e); }
    }
  } catch (e) { console.error("[creative-studio] load failed:", e); }

  if (!studio) {
    return (
      <main dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-10 text-center">
        <h1 className="text-ink text-xl font-black">לא ניתן לטעון את הסטודיו</h1>
        <p className="text-muted mt-2 text-sm">ודא שאתה מחובר ושהישות שייכת לארגון שלך.</p>
      </main>
    );
  }
  return <CreativeStudioView studio={studio} concepts={concepts} campaigns={campaigns} campaignAssets={campaignAssets} creativeAssets={creativeAssets} copyAssets={copyAssets} creativeOutputs={creativeOutputs} visuals={visuals} quickOutputs={quickOutputs} isManager={isManager} orgId={orgId} userId={userId} quickPrefill={quickPrefill} />;
}
