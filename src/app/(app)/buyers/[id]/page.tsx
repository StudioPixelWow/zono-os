import { notFound } from "next/navigation";
import {
  getBuyerActivities,
  getBuyerById,
  getBuyerMeetings,
  getBuyerNotes,
  getBuyerTasks,
} from "@/lib/buyers/repository";
import { getBuyerCommandCenter } from "@/lib/buyer-intelligence/service";
import { recommendedPropertiesForBuyer } from "@/lib/matching-intelligence/service";
import { BuyerDetailView } from "./BuyerDetailView";

export const dynamic = "force-dynamic";

export default async function BuyerDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const buyer = await getBuyerById(id);
  if (!buyer) notFound();

  const [activities, tasks, notes, meetings, commandCenter, recommendations] = await Promise.all([
    getBuyerActivities(id),
    getBuyerTasks(id),
    getBuyerNotes(id),
    getBuyerMeetings(id),
    getBuyerCommandCenter(id),
    recommendedPropertiesForBuyer(id),
  ]);

  return (
    <BuyerDetailView
      buyer={buyer}
      activities={activities}
      tasks={tasks}
      notes={notes}
      meetings={meetings}
      commandCenter={commandCenter}
      recommendations={recommendations}
    />
  );
}
