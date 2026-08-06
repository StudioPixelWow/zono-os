import { notFound } from "next/navigation";
import { getDealDetail } from "@/lib/deals/detail";
import { listNotesForEntity, type NoteDTO } from "@/lib/notes/service";
import { DealDetailView } from "./DealDetailView";

export const dynamic = "force-dynamic";

export default async function DealPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const deal = await getDealDetail(id);
  if (!deal) notFound();
  let notes: NoteDTO[] = [];
  try { notes = await listNotesForEntity({ type: "deal", id }); } catch { /* best-effort */ }
  return <DealDetailView deal={deal} notes={notes} />;
}
