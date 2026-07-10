import { notFound } from "next/navigation";
import {
  getPropertyActivities,
  getPropertyById,
  getPropertyDocuments,
  getPropertyNotes,
  listPropertyMedia,
} from "@/lib/properties/repository";
import { buildJourneyContext, getJourney } from "@/lib/journey/repository";
import { listPropertyTasks } from "@/lib/tasks/repository";
import { getPropertyCommandCenter } from "@/lib/intelligence/service";
import { recommendedBuyersForProperty } from "@/lib/matching-intelligence/service";
import { getPropertySellers } from "@/lib/sellers/service360";
import { validatePropertySellerReadiness } from "@/lib/sellers/propertySellers";
import {
  getActivitySummaryForEntity,
  getEntityRelationships,
  getEntityTimeline,
} from "@/lib/activity/service";
import { journeyStageForStatusFallback } from "@/lib/journey/fallback";
import { PropertyDetailView } from "./PropertyDetailView";
import { CommunicationSection } from "@/components/communication/CommunicationSection";
import { EntityCalendarSection } from "@/components/calendar/EntityCalendarSection";
import { ApprovalBundleSection } from "@/components/approval-bundle/ApprovalBundleSection";
import { EntityRecommendationsPanel } from "@/components/recommendations/EntityRecommendationsPanel";
import { listRecommendationsForEntity } from "@/lib/recommendations/service";
import { CreatePortalButton } from "@/components/portals/CreatePortalButton";
import { CreateLegalDocumentButton } from "@/components/legal/CreateLegalDocumentButton";
import { EntityLegalDocuments } from "@/components/legal/EntityLegalDocuments";
import { ContextPanel } from "@/components/intelligence/ContextPanel";
import { PropertyMarketingLog } from "@/components/property/PropertyMarketingLog";
import { PropertyMarketingActionCenter } from "@/components/property/PropertyMarketingActionCenter";

export const dynamic = "force-dynamic";

export default async function PropertyDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await getPropertyById(id);
  if (!property) notFound();

  const [
    activities,
    notes,
    documents,
    media,
    tasks,
    journeyRow,
    context,
    commandCenter,
    timeline,
    relationships,
    activitySummary,
    recommendedBuyers,
    propertySellers,
    sellerReadiness,
  ] = await Promise.all([
    getPropertyActivities(id),
    getPropertyNotes(id),
    getPropertyDocuments(id),
    listPropertyMedia(id),
    listPropertyTasks(id),
    getJourney(id),
    buildJourneyContext(property),
    getPropertyCommandCenter(id),
    getEntityTimeline("property", id),
    getEntityRelationships("property", id),
    getActivitySummaryForEntity("property", id),
    recommendedBuyersForProperty(id),
    getPropertySellers(id),
    validatePropertySellerReadiness(id),
  ]);

  const journey = {
    stage: journeyRow?.current_stage ?? journeyStageForStatusFallback(property.status),
    lastActivityAt: journeyRow?.last_activity_at ?? property.updated_at,
    stageEnteredAt: journeyRow?.stage_entered_at ?? property.created_at,
    context,
  };

  // Server-rendered sections are passed as SLOTS into the cockpit tabs (instead of
  // stacking endlessly below). Every module is reused as-is; nothing changes logic.
  const marketingSlot = (
    <div className="flex flex-col gap-5">
      <PropertyMarketingActionCenter propertyId={id} />
      <PropertyMarketingLog propertyId={id} />
      <CommunicationSection entityType="property" entityId={id} />
    </div>
  );
  const calendarSlot = <EntityCalendarSection kind="property" id={id} />;
  const documentsSlot = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <CreatePortalButton entityType="property" entityId={id} portalType="property" label="צור פורטל נכס / מוכר" />
        <div className="bg-card border-line flex flex-wrap items-center gap-2 rounded-[16px] border p-3">
          <CreateLegalDocumentButton entityType="property" entityId={id} />
        </div>
      </div>
      <EntityLegalDocuments entityType="property" entityId={id} />
    </div>
  );
  const approvalSlot = <ApprovalBundleSection entityType="property" entityId={id} />;
  const recommendationsSlot = <EntityRecommendationsPanel entityType="property" entityId={id} recommendations={await listRecommendationsForEntity("property", id).catch(() => [])} />;
  const contextSlot = <ContextPanel city={property.city} neighborhood={property.neighborhood} />;

  return (
    <PropertyDetailView
      property={property}
      activities={activities}
      notes={notes}
      documents={documents}
      media={media}
      tasks={tasks}
      journey={journey}
      commandCenter={commandCenter}
      timeline={timeline}
      relationships={relationships}
      activitySummary={activitySummary}
      recommendedBuyers={recommendedBuyers}
      propertySellers={propertySellers}
      sellerReadiness={sellerReadiness}
      marketingSlot={marketingSlot}
      calendarSlot={calendarSlot}
      documentsSlot={documentsSlot}
      approvalSlot={approvalSlot}
      recommendationsSlot={recommendationsSlot}
      contextSlot={contextSlot}
    />
  );
}
