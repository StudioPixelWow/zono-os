import { notFound } from "next/navigation";
import { getSellerById } from "@/lib/sellers/repository";
import { getPropertyById } from "@/lib/properties/repository";
import { getSellerCommandCenter } from "@/lib/seller-intelligence/service";
import { interestedBuyersForSeller } from "@/lib/matching-intelligence/service";
import { getSeller360 } from "@/lib/sellers/service360";
import { SellerDetailView, type LinkedProp } from "./SellerDetailView";
import { Seller360Sections } from "./Seller360Sections";
import { CommunicationSection } from "@/components/communication/CommunicationSection";
import { EntityCalendarSection } from "@/components/calendar/EntityCalendarSection";
import { ApprovalBundleSection } from "@/components/approval-bundle/ApprovalBundleSection";
import { RelationshipSection } from "@/components/graph/RelationshipSection";
import { EntityRecommendationsPanel } from "@/components/recommendations/EntityRecommendationsPanel";
import { listRecommendationsForEntity } from "@/lib/recommendations/service";
import { CreatePortalButton } from "@/components/portals/CreatePortalButton";
import { CreateLegalDocumentButton } from "@/components/legal/CreateLegalDocumentButton";
import { EntityLegalDocuments } from "@/components/legal/EntityLegalDocuments";
import { EntityAIContextSection } from "@/components/ai-context/EntityAIContextSection";
import { canonicalFactsFor } from "@/lib/ai-context";

export const dynamic = "force-dynamic";

export default async function SellerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const seller = await getSellerById(id);
  if (!seller) notFound();

  const [commandCenter, interestedBuyers, seller360] = await Promise.all([
    getSellerCommandCenter(id),
    interestedBuyersForSeller(id),
    getSeller360(id),
  ]);

  // Enrich the seller's owned properties with real image/price/status (reuses the
  // existing property repository) so the Linked Property section is premium — the
  // full property intelligence lives one click away on the property cockpit.
  const owned = seller360?.properties ?? [];
  const linkedProperties: LinkedProp[] = await Promise.all(
    owned.map(async (op) => {
      const pr = await getPropertyById(op.propertyId).catch(() => null);
      return {
        propertyId: op.propertyId,
        title: op.title,
        relationshipType: op.relationshipType,
        ownershipPercentage: op.ownershipPercentage,
        isPrimary: op.isPrimary,
        isDecisionMaker: op.isDecisionMaker,
        canSign: op.canSign,
        price: pr?.price ?? null,
        status: pr?.status ?? null,
        image: pr?.primary_image_url ?? null,
      };
    }),
  );

  // Server-rendered sections passed as SLOTS into the seller cockpit tabs.
  const memorySlot = seller360 ? <Seller360Sections seller={seller360.seller} properties={seller360.properties} /> : null;
  const communicationSlot = <CommunicationSection entityType="seller" entityId={id} />;
  const calendarSlot = <EntityCalendarSection kind="seller" id={id} name={seller.full_name} />;
  const documentsSlot = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <CreatePortalButton entityType="seller" entityId={id} portalType="seller" label="צור פורטל מוכר" />
        <div className="bg-card border-line flex flex-wrap items-center gap-2 rounded-[16px] border p-3">
          <CreateLegalDocumentButton entityType="seller" entityId={id} />
        </div>
      </div>
      <EntityLegalDocuments entityType="seller" entityId={id} />
    </div>
  );
  const approvalSlot = <ApprovalBundleSection entityType="seller" entityId={id} />;
  const recommendationsSlot = (
    <div className="flex flex-col gap-3">
      <EntityAIContextSection entityType="seller" entityId={id} canonicalTruth={canonicalFactsFor("seller", seller as unknown as Record<string, unknown>)} />
      <EntityRecommendationsPanel entityType="seller" entityId={id} recommendations={await listRecommendationsForEntity("seller", id).catch(() => [])} />
    </div>
  );
  const graphSlot = <RelationshipSection entityType="seller" entityId={id} />;

  return (
    <SellerDetailView
      seller={seller}
      commandCenter={commandCenter}
      interestedBuyers={interestedBuyers}
      linkedProperties={linkedProperties}
      memorySlot={memorySlot}
      communicationSlot={communicationSlot}
      calendarSlot={calendarSlot}
      documentsSlot={documentsSlot}
      approvalSlot={approvalSlot}
      recommendationsSlot={recommendationsSlot}
      graphSlot={graphSlot}
    />
  );
}
