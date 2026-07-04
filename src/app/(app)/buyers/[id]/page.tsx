import { notFound } from "next/navigation";
import {
  getBuyerActivities,
  getBuyerById,
  getBuyerMeetings,
  getBuyerNotes,
  getBuyerTasks,
} from "@/lib/buyers/repository";
import { getBuyerCommandCenter } from "@/lib/buyer-intelligence/service";
import { recommendedPropertiesForBuyer, getBuyerPropertyMatches } from "@/lib/matching-intelligence/service";
import { BuyerDetailView } from "./BuyerDetailView";
import { CommunicationSection } from "@/components/communication/CommunicationSection";
import { EntityCalendarSection } from "@/components/calendar/EntityCalendarSection";
import { RelationshipSection } from "@/components/graph/RelationshipSection";
import { EntityRecommendationsPanel } from "@/components/recommendations/EntityRecommendationsPanel";
import { listRecommendationsForEntity } from "@/lib/recommendations/service";
import { CreatePortalButton } from "@/components/portals/CreatePortalButton";
import { CreateLegalDocumentButton } from "@/components/legal/CreateLegalDocumentButton";

export const dynamic = "force-dynamic";

export default async function BuyerDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const buyer = await getBuyerById(id);
  if (!buyer) notFound();

  const [activities, tasks, notes, meetings, commandCenter, recommendations, buyerMatches] = await Promise.all([
    getBuyerActivities(id),
    getBuyerTasks(id),
    getBuyerNotes(id),
    getBuyerMeetings(id),
    getBuyerCommandCenter(id),
    recommendedPropertiesForBuyer(id),
    getBuyerPropertyMatches(id).catch(() => []),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <BuyerDetailView
        buyer={buyer}
        activities={activities}
        tasks={tasks}
        notes={notes}
        meetings={meetings}
        commandCenter={commandCenter}
        recommendations={recommendations}
        buyerMatches={buyerMatches}
      />
      <EntityRecommendationsPanel entityType="buyer" entityId={id} recommendations={await listRecommendationsForEntity("buyer", id).catch(() => [])} />
      <CreatePortalButton entityType="buyer" entityId={id} portalType="buyer" label="צור פורטל קונה" />
      <div className="bg-card border-line flex flex-wrap items-center gap-2 rounded-[16px] border p-3">
        <CreateLegalDocumentButton entityType="buyer" entityId={id} />
      </div>
      <EntityCalendarSection kind="buyer" id={id} name={buyer.full_name} />
      <CommunicationSection entityType="buyer" entityId={id} />
      <RelationshipSection entityType="buyer" entityId={id} />
    </div>
  );
}
