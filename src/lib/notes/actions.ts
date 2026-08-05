"use server";
import { revalidatePath } from "next/cache";
import {
  createNote, editNote, setNotePinned, setNoteArchived, setNoteTags, getNoteHistory,
  type CreateNoteInput, type NoteEntity, type NoteEditDTO,
} from "./service";

export interface NoteActionState { ok?: boolean; error?: string; message?: string; id?: string }

function revalidateFor(entity?: NoteEntity | null) {
  try {
    revalidatePath("/notes");
    if (entity) revalidatePath(`/${entity.type === "property" ? "properties" : entity.type + "s"}/${entity.id}`);
  } catch { /* noop */ }
}

export async function createNoteAction(input: CreateNoteInput): Promise<NoteActionState> {
  try { const r = await createNote(input); revalidateFor(input.entity ?? null); return { ok: true, id: r.id, message: "ההערה נשמרה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "שמירת ההערה נכשלה" }; }
}
export async function editNoteAction(noteId: string, body: string, entity?: NoteEntity | null): Promise<NoteActionState> {
  try { await editNote(noteId, body); revalidateFor(entity ?? null); return { ok: true, message: "ההערה עודכנה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "עדכון ההערה נכשל" }; }
}
export async function setNotePinnedAction(noteId: string, pinned: boolean, entity?: NoteEntity | null): Promise<NoteActionState> {
  try { await setNotePinned(noteId, pinned); revalidateFor(entity ?? null); return { ok: true, message: pinned ? "ההערה נעוצה" : "הנעיצה בוטלה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
export async function setNoteArchivedAction(noteId: string, archived: boolean, entity?: NoteEntity | null): Promise<NoteActionState> {
  try { await setNoteArchived(noteId, archived); revalidateFor(entity ?? null); return { ok: true, message: archived ? "ההערה הועברה לארכיון" : "ההערה שוחזרה" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
export async function setNoteTagsAction(noteId: string, tags: string[], entity?: NoteEntity | null): Promise<NoteActionState> {
  try { await setNoteTags(noteId, tags); revalidateFor(entity ?? null); return { ok: true, message: "התגיות עודכנו" }; }
  catch (e) { return { error: e instanceof Error ? e.message : "העדכון נכשל" }; }
}
export async function getNoteHistoryAction(noteId: string): Promise<NoteEditDTO[]> {
  try { return await getNoteHistory(noteId); } catch { return []; }
}
