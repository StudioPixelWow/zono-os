"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import {
  createNoteAction, editNoteAction, setNotePinnedAction, setNoteArchivedAction, setNoteTagsAction, getNoteHistoryAction,
} from "@/lib/notes/actions";
import type { NoteDTO, NoteEntity, NoteEditDTO } from "@/lib/notes/service";

const field = "bg-surface border-line text-ink focus:border-brand-light w-full rounded-xl border px-3 py-2 text-sm outline-none";

/** Shared notes experience for any entity workspace (or org-wide when entity=null). */
export function NotesPanel({ entity, notes, title = "הערות" }: { entity: NoteEntity | null; notes: NoteDTO[]; title?: string }) {
  const r = useActionRunner();
  const router = useRouter();
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");

  const parseTags = (s: string) => s.split(",").map((t) => t.trim()).filter(Boolean);
  const refresh = () => router.refresh();

  const add = () =>
    r.run(async () => {
      const res = await createNoteAction({ body, entity, tags: parseTags(tags) });
      if (res.error) throw new Error(res.error);
      setBody(""); setTags(""); refresh();
      return res;
    }, { id: "note-add", pendingMessage: "שומר הערה...", success: () => "ההערה נשמרה ✓" });

  return (
    <section dir="rtl" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-lg"><Icon name="FilePlus2" size={16} /></span>
        <h2 className="text-ink text-base font-black">{title}</h2>
        <span className="text-muted text-[12px]">{notes.length}</span>
      </div>
      <ActionFeedback runner={r} />

      <div className="bg-card border-line flex flex-col gap-2 rounded-2xl border p-3 shadow-sm">
        <textarea className={field} rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="כתוב הערה... (השתמש ב-@ לאזכור, פסיקים לתגיות בשדה למטה)" />
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${field} max-w-xs`} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="תגיות מופרדות בפסיק (אופציונלי)" />
          <Button size="sm" loading={r.busyId === "note-add"} disabled={!body.trim()} onClick={add}><Icon name="Plus" size={14} />שמור הערה</Button>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="bg-surface text-muted rounded-2xl px-4 py-6 text-center text-sm">אין הערות עדיין</div>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map((n) => <NoteCard key={n.id} n={n} entity={entity} r={r} onChanged={refresh} />)}
        </div>
      )}
    </section>
  );
}

type Runner = ReturnType<typeof useActionRunner>;

function NoteCard({ n, entity, r, onChanged }: { n: NoteDTO; entity: NoteEntity | null; r: Runner; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(n.body);
  const [tagDraft, setTagDraft] = useState(n.tags.join(", "));
  const [showTags, setShowTags] = useState(false);
  const [history, setHistory] = useState<NoteEditDTO[] | null>(null);

  const wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) =>
    r.run(async () => { const res = await fn(); if (res.error) throw new Error(res.error); onChanged(); return res; }, { id, pendingMessage: pending, success: (x) => x.message ?? null });

  const saveEdit = () => wrap(async () => { const res = await editNoteAction(n.id, draft, entity); if (!res.error) setEditing(false); return res; }, `edit-${n.id}`, "מעדכן...");
  const saveTags = () => wrap(async () => { const res = await setNoteTagsAction(n.id, tagDraft.split(",").map((t) => t.trim()).filter(Boolean), entity); if (!res.error) setShowTags(false); return res; }, `tags-${n.id}`, "מעדכן תגיות...");
  const loadHistory = async () => { const h = await getNoteHistoryAction(n.id); setHistory(h); };

  return (
    <div className="bg-card border-line rounded-2xl border p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 text-[12px]">
          {n.is_pinned && <span className="bg-warning-soft text-warning rounded-full px-2 py-0.5 font-bold">נעוץ</span>}
          <span className="text-ink font-bold">{n.author_name || "—"}</span>
          <span className="text-muted">{new Date(n.created_at).toLocaleString("he-IL")}</span>
          {n.edit_count > 0 && <button onClick={loadHistory} className="text-brand-strong font-bold">נערך ({n.edit_count})</button>}
        </div>
      </div>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea className={field} rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} />
          <div className="flex gap-2">
            <Button size="sm" loading={r.busyId === `edit-${n.id}`} onClick={saveEdit}>שמור</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft(n.body); }}>ביטול</Button>
          </div>
        </div>
      ) : (
        <p className="text-ink mt-1.5 whitespace-pre-wrap text-sm">{n.body}</p>
      )}

      {n.tags.length > 0 && !showTags && (
        <div className="mt-2 flex flex-wrap gap-1">{n.tags.map((t) => <span key={t} className="bg-surface text-muted rounded-full px-2 py-0.5 text-[11px] font-bold">#{t}</span>)}</div>
      )}
      {showTags && (
        <div className="mt-2 flex items-center gap-2">
          <input className={`${field} max-w-xs`} value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="תגיות מופרדות בפסיק" />
          <Button size="sm" loading={r.busyId === `tags-${n.id}`} onClick={saveTags}>שמור</Button>
        </div>
      )}

      {history && (
        <div className="border-line mt-2 flex flex-col gap-1 border-t pt-2">
          <p className="text-ink text-[12px] font-bold">היסטוריית עריכה</p>
          {history.length === 0 ? <p className="text-muted text-[12px]">אין גרסאות קודמות</p>
            : history.map((h, i) => <p key={i} className="text-muted text-[12px]">• {new Date(h.created_at).toLocaleString("he-IL")}: {h.previous_body.slice(0, 120)}</p>)}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {!editing && <button onClick={() => setEditing(true)} className="text-muted hover:text-ink text-[12px] font-bold">ערוך</button>}
        <button onClick={() => wrap(() => setNotePinnedAction(n.id, !n.is_pinned, entity), `pin-${n.id}`)} className="text-muted hover:text-ink text-[12px] font-bold">{n.is_pinned ? "בטל נעיצה" : "נעץ"}</button>
        <button onClick={() => setShowTags((s) => !s)} className="text-muted hover:text-ink text-[12px] font-bold">תגיות</button>
        <button onClick={() => wrap(() => setNoteArchivedAction(n.id, !n.is_archived, entity), `arch-${n.id}`)} className="text-muted hover:text-danger text-[12px] font-bold">{n.is_archived ? "שחזר" : "ארכב"}</button>
      </div>
    </div>
  );
}
