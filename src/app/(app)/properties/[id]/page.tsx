import { notFound } from "next/navigation";
import {
  getPropertyActivities,
  getPropertyById,
  getPropertyDocuments,
  getPropertyNotes,
  listPropertyMedia,
} from "@/lib/properties/repository";
import { buildJourneyContext, getJourney } from "@/lib/journey/repository";
import { journeyStageForStatusFallback } from "@/lib/journey/fallback";
import { PropertyDetailView } from "./PropertyDetailView";

export const dynamic = "force-dynamic";

export default async function PropertyDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const property = await getPropertyById(id);
  if (!property) notFound();

  const [activities, notes, documents, media, journeyRow, context] =
    await Promise.all([
      getPropertyActivities(id),
      getPropertyNotes(id),
      getPropertyDocuments(id),
      listPropertyMedia(id),
      getJourney(id),
      buildJourneyContext(property),
    ]);

  const journey = {
    stage: journeyRow?.current_stage ?? journeyStageForStatusFallback(property.status),
    lastActivityAt: journeyRow?.last_activity_at ?? property.updated_at,
    stageEnteredAt: journeyRow?.stage_entered_at ?? property.created_at,
    context,
  };

  return (
    <PropertyDetailView
      property={property}
      activities={activities}
      notes={notes}
      documents={documents}
      media={media}
      journey={journey}
    />
  );
}
