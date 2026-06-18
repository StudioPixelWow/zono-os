import { notFound } from "next/navigation";
import {
  getPropertyActivities,
  getPropertyById,
  getPropertyDocuments,
  getPropertyNotes,
} from "@/lib/properties/repository";
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

  const [activities, notes, documents] = await Promise.all([
    getPropertyActivities(id),
    getPropertyNotes(id),
    getPropertyDocuments(id),
  ]);

  return (
    <PropertyDetailView
      property={property}
      activities={activities}
      notes={notes}
      documents={documents}
    />
  );
}
