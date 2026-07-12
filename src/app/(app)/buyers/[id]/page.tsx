import { notFound } from "next/navigation";
import { EntityJourneySection } from "@/components/journey/EntityJourneySection";
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

  // Server-rendered sections are passed as SLOTS into the buyer cockpit tabs
  // (instead of stacking endlessly below). Every module reused as-is; no logic change.
  const communicationSlot = <CommunicationSection entityType="buyer" entityId={id} />;
  const calendarSlot = <EntityCalendarSection kind="buyer" id={id} name={buyer.full_name} />;
  const documentsSlot = (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <CreatePortalButton entityType="buyer" entityId={id} portalType="buyer" label="צור פורטל קונה" />
        <div className="bg-card border-line flex flex-wrap items-center gap-2 rounded-[16px] border p-3">
          <CreateLegalDocumentButton entityType="buyer" entityId={id} />
        </div>
      </div>
      <EntityLegalDocuments entityType="buyer" entityId={id} />
    </div>
  );
  const approvalSlot = <ApprovalBundleSection entityType="buyer" entityId={id} />;
  const recommendationsSlot = (
    <div className="flex flex-col gap-3">
      <EntityAIContextSection entityType="buyer" entityId={id} canonicalTruth={canonicalFactsFor("buyer", buyer as unknown as Record<string, unknown>)} />
      <EntityRecommendationsPanel entityType="buyer" entityId={id} recommendations={await listRecommendationsForEntity("buyer", id).catch(() => [])} />
    </div>
  );
  const graphSlot = <RelationshipSection entityType="buyer" entityId={id} />;

  // Batch 5.5 (Part 10) — the ONE canonical journey block, shared by all five cockpits.
  const journeySlot = <EntityJourneySection entityType="buyer" entityId={id} />;

  return (
    <BuyerDetailView
      journeySlot={journeySlot}
      buyer={buyer}
      activities={activities}
      tasks={tasks}
      notes={notes}
      meetings={meetings}
      commandCenter={commandCenter}
      recommendations={recommendations}
      buyerMatches={buyerMatches}
      communicationSlot={communicationSlot}
      calendarSlot={calendarSlot}
      documentsSlot={documentsSlot}
      approvalSlot={approvalSlot}
      recommendationsSlot={recommendationsSlot}
      graphSlot={graphSlot}
    />
  );
}
