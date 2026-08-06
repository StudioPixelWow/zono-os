/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// ZONO — Notes · Service (server-only)
// ----------------------------------------------------------------------------
// The shared notes experience (Epic 3 · Part 13) over the EXISTING public.notes
// table — NO second notes model. Entity-linked (buyer/seller/lead/property/deal),
// tags, @mentions, pin, archive, and an APPEND-ONLY edit history (note_edits).
// Org-isolated; edits/archive restricted to the author or a manager. Never
// deletes history — a correction snapshots the prior body into note_edits.
//
// The `note_edits` table and the additive `notes` columns (tags/is_archived/…)
// are newer than the checked-in generated Supabase types, so DB access in this
// module goes through a loosely-typed client (`db`). The public API stays fully
// typed (NoteDTO); only the row plumbing is loose.
// ============================================================================
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";

export type NoteEntity =
  | { type: "buyer"; id: string }
  | { type: "seller"; id: string }
  | { type: "lead"; id: string }
  | { type: "property"; id: string }
  | { type: "deal"; id: string };

const ENTITY_COLUMN: Record<NoteEntity["type"], string> = {
  buyer: "buyer_id", seller: "seller_id", lead: "lead_id", property: "property_id", deal: "deal_id",
};

export interface NoteDTO {
  id: string; body: string; author_id: string | null; author_name: string | null;
  tags: string[]; mentioned_user_ids: string[]; is_pinned: boolean; is_archived: boolean;
  edited_at: string | null; edit_count: number; created_at: string; updated_at: string;
}
export interface CreateNoteInput {
  body: string; entity?: NoteEntity | null; tags?: string[]; mentionedUserIds?: string[];
}

async function ctx() {
  const { user, profile } = await getSessionContext();
  if (!user || !profile) throw new Error("לא מחובר/ת");
  const supabase = await createClient();
  let isManager = false;
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); isManager = data === true; } catch { /* default agent */ }
  // Loosely-typed handle for new columns/tables not yet in generated types.
  const db = supabase as any;
  return { userId: user.id, orgId: profile.org_id, isManager, supabase, db };
}
type DB = any;

async function authorNames(db: DB, orgId: string, ids: string[]): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  const map = new Map<string, string>();
  if (!uniq.length) return map;
  try {
    const { data } = await db.from("users").select("id,full_name").eq("org_id", orgId).in("id", uniq);
    for (const u of (data ?? []) as { id: string; full_name?: string }[]) map.set(u.id, u.full_name ?? "");
  } catch { /* names are best-effort */ }
  return map;
}

function mapNote(d: Record<string, unknown>, names: Map<string, string>): NoteDTO {
  const authorId = (d.author_id as string) ?? null;
  return {
    id: d.id as string, body: (d.body as string) ?? "", author_id: authorId,
    author_name: authorId ? (names.get(authorId) ?? null) : null,
    tags: (d.tags as string[]) ?? [], mentioned_user_ids: (d.mentioned_user_ids as string[]) ?? [],
    is_pinned: Boolean(d.is_pinned), is_archived: Boolean(d.is_archived),
    edited_at: (d.edited_at as string) ?? null, edit_count: (d.edit_count as number) ?? 0,
    created_at: d.created_at as string, updated_at: d.updated_at as string,
  };
}

/** Notes for one entity — pinned first, newest first; archived excluded by default. */
export async function listNotesForEntity(entity: NoteEntity, opts?: { includeArchived?: boolean }): Promise<NoteDTO[]> {
  const { orgId, db } = await ctx();
  let q = db.from("notes").select("*").eq("org_id", orgId).eq(ENTITY_COLUMN[entity.type], entity.id);
  if (!opts?.includeArchived) q = q.eq("is_archived", false);
  const { data } = await q.order("is_pinned", { ascending: false }).order("created_at", { ascending: false }).limit(200);
  const rows = (data ?? []) as Record<string, unknown>[];
  const names = await authorNames(db, orgId, rows.map((r) => (r.author_id as string) ?? ""));
  return rows.map((r) => mapNote(r, names));
}

/** Recent notes across the org (for the /notes overview). */
export async function listRecentNotes(limit = 60): Promise<NoteDTO[]> {
  const { orgId, db } = await ctx();
  const { data } = await db.from("notes").select("*").eq("org_id", orgId).eq("is_archived", false)
    .order("created_at", { ascending: false }).limit(Math.min(limit, 200));
  const rows = (data ?? []) as Record<string, unknown>[];
  const names = await authorNames(db, orgId, rows.map((r) => (r.author_id as string) ?? ""));
  return rows.map((r) => mapNote(r, names));
}

export async function createNote(input: CreateNoteInput): Promise<{ id: string }> {
  const { orgId, userId, db } = await ctx();
  const body = input.body?.trim();
  if (!body) throw new Error("נא להזין תוכן להערה");
  const row: Record<string, unknown> = {
    org_id: orgId, author_id: userId, body,
    tags: input.tags ?? [], mentioned_user_ids: input.mentionedUserIds ?? [],
  };
  if (input.entity) row[ENTITY_COLUMN[input.entity.type]] = input.entity.id;
  const { data, error } = await db.from("notes").insert(row).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "שמירת ההערה נכשלה");
  return { id: (data as { id: string }).id };
}

async function loadOwned(db: DB, orgId: string, userId: string, isManager: boolean, noteId: string) {
  const { data } = await db.from("notes").select("author_id,body").eq("org_id", orgId).eq("id", noteId).maybeSingle();
  const note = data as { author_id: string | null; body: string } | null;
  if (!note) throw new Error("ההערה לא נמצאה");
  if (!isManager && note.author_id !== userId) throw new Error("רק כותב ההערה או מנהל יכולים לערוך");
  return note;
}

/** Edit a note — snapshots the prior body to note_edits (append-only history). */
export async function editNote(noteId: string, newBody: string): Promise<void> {
  const { orgId, userId, isManager, db } = await ctx();
  const body = newBody?.trim();
  if (!body) throw new Error("נא להזין תוכן להערה");
  const note = await loadOwned(db, orgId, userId, isManager, noteId);
  if (note.body === body) return;
  await db.from("note_edits").insert({ org_id: orgId, note_id: noteId, editor_id: userId, previous_body: note.body });
  const { data: cur } = await db.from("notes").select("edit_count").eq("org_id", orgId).eq("id", noteId).maybeSingle();
  const next = (((cur as { edit_count?: number } | null)?.edit_count) ?? 0) + 1;
  const { error } = await db.from("notes").update({ body, edited_at: new Date().toISOString(), edit_count: next }).eq("org_id", orgId).eq("id", noteId);
  if (error) throw new Error(error.message);
}

export async function setNotePinned(noteId: string, pinned: boolean): Promise<void> {
  const { orgId, userId, isManager, db } = await ctx();
  await loadOwned(db, orgId, userId, isManager, noteId);
  const { error } = await db.from("notes").update({ is_pinned: pinned }).eq("org_id", orgId).eq("id", noteId);
  if (error) throw new Error(error.message);
}

export async function setNoteArchived(noteId: string, archived: boolean): Promise<void> {
  const { orgId, userId, isManager, db } = await ctx();
  await loadOwned(db, orgId, userId, isManager, noteId);
  const { error } = await db.from("notes").update({ is_archived: archived }).eq("org_id", orgId).eq("id", noteId);
  if (error) throw new Error(error.message);
}

export async function setNoteTags(noteId: string, tags: string[]): Promise<void> {
  const { orgId, userId, isManager, db } = await ctx();
  await loadOwned(db, orgId, userId, isManager, noteId);
  const clean = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean))).slice(0, 20);
  const { error } = await db.from("notes").update({ tags: clean }).eq("org_id", orgId).eq("id", noteId);
  if (error) throw new Error(error.message);
}

export interface NoteEditDTO { previous_body: string; editor_id: string | null; created_at: string }
export async function getNoteHistory(noteId: string): Promise<NoteEditDTO[]> {
  const { orgId, db } = await ctx();
  const { data } = await db.from("note_edits").select("previous_body,editor_id,created_at").eq("org_id", orgId).eq("note_id", noteId).order("created_at", { ascending: false }).limit(50);
  return ((data ?? []) as Record<string, unknown>[]).map((e) => ({ previous_body: e.previous_body as string, editor_id: (e.editor_id as string) ?? null, created_at: e.created_at as string }));
}
