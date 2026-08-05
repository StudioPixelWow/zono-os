import { notFound } from "next/navigation";
import { resolvePersonByEntity, type PersonRole } from "@/lib/people/service";
import { listNotesForEntity, type NoteDTO } from "@/lib/notes/service";
import { PersonWorkspace } from "./PersonWorkspace";

export const dynamic = "force-dynamic";

const VALID: PersonRole[] = ["buyer", "seller", "lead"];

export default async function PersonPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;
  if (!VALID.includes(type as PersonRole)) notFound();
  const person = await resolvePersonByEntity(type as PersonRole, id);
  if (!person) notFound();
  let notes: NoteDTO[] = [];
  try { notes = await listNotesForEntity({ type: person.primary.type, id: person.primary.id }); } catch { /* best-effort */ }
  return <PersonWorkspace person={person} notes={notes} />;
}
