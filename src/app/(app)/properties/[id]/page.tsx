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
import { RelationshipSection } from "@/components/graph/RelationshipSection";
import { EntityRecommendationsPanel } from "@/components/recommendations/EntityRecommendationsPanel";
import { listRecommendationsForEntity } from "@/lib/recommendations/service";
import { CreatePortalButton } from "@/components/portals/CreatePortalButton";

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

  return (
    <div className="flex flex-col gap-6">
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
      />
      <EntityRecommendationsPanel entityType="property" entityId={id} recommendations={await listRecommendationsForEntity("property", id).catch(() => [])} />
      <CreatePortalButton entityType="property" entityId={id} portalType="property" label="צור פורטל נכס / מוכר" />
      <CommunicationSection entityType="property" entityId={id} />
      <RelationshipSection entityType="property" entityId={id} />
    </div>
  );
}
