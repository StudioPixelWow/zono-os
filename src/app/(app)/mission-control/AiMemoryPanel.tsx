"use client";
// ============================================================================
// 🧠 Mission Control — AI Memory & Personal Context™ panel. Phase 27.7.
// ----------------------------------------------------------------------------
// User-controlled persistent memory: create / search / pin / archive / delete /
// change visibility, with a per-memory inspector (source, confidence, last used,
// usage, visibility, created/updated). No reasoning, no execution. RTL.
// ============================================================================
import { useEffect, useMemo, useState, useTransition } from "react";
import { TerminalSection, Pill, TerminalEmpty } from "@/components/intelligence/terminal";
import {
  listMemoriesAction, createMemoryAction, pinMemoryAction, archiveMemoryAction,
  restoreMemoryAction, deleteMemoryAction, setMemoryVisibilityAction,
} from "@/lib/ai-memory/service";
import { groupForDisplay, searchMemories, MEMORY_TYPE_LABELS, VISIBILITY_LABELS } from "@/lib/ai-memory";
import type { AiMemory, MemoryType, MemoryVisibility } from "@/lib/ai-memory/types";

const TYPES: MemoryType[] = ["manual_note", "favorite_area", "working_style", "rule", "decision", "faq", "user_preference", "context"];
const VIS: MemoryVisibility[] = ["private", "office", "organization"];

function MemoryRow({ m, onAct, pending }: { m: AiMemory; onAct: (fn: () => Promise<unknown>) => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-line bg-card rounded-xl border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink truncate text-sm font-bold">{m.pinned ? "📌 " : ""}{m.title}</p>
          {m.summary && <p className="text-muted mt-0.5 line-clamp-2 text-xs">{m.summary}</p>}
        </div>
        <Pill tone="neutral">{MEMORY_TYPE_LABELS[m.memoryType] ?? m.memoryType}</Pill>
      </div>
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-brand mt-2 text-[11px] font-bold">{open ? "הסתר פרטים" : "פרטים"}</button>
      {open && (
        <dl className="text-muted mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px]">
          <div>מקור: <span className="text-ink font-bold">{m.sourceType}</span></div>
          <div>ביטחון: <span className="text-ink font-bold">{Math.round(m.confidence)}%</span></div>
          <div>נראות: <span className="text-ink font-bold">{VISIBILITY_LABELS[m.visibility] ?? m.visibility}</span></div>
          <div>שימושים: <span className="text-ink font-bold">{m.usageCount}</span></div>
          <div>נוצר: <span className="text-ink font-bold">{m.createdAt.slice(0, 10) || "—"}</span></div>
          <div>עודכן: <span className="text-ink font-bold">{m.updatedAt.slice(0, 10) || "—"}</span></div>
          <div>שימוש אחרון: <span className="text-ink font-bold">{m.lastUsedAt?.slice(0, 10) ?? "—"}</span></div>
          <div>פג בתאריך: <span className="text-ink font-bold">{m.expiresAt?.slice(0, 10) ?? "—"}</span></div>
        </dl>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <button type="button" disabled={pending} onClick={() => onAct(() => pinMemoryAction(m.id, !m.pinned))} className="text-muted hover:text-ink font-bold">{m.pinned ? "בטל הצמדה" : "הצמד"}</button>
        {m.status === "archived"
          ? <button type="button" disabled={pending} onClick={() => onAct(() => restoreMemoryAction(m.id))} className="text-muted hover:text-ink font-bold">שחזר</button>
          : <button type="button" disabled={pending} onClick={() => onAct(() => archiveMemoryAction(m.id))} className="text-muted hover:text-ink font-bold">העבר לארכיון</button>}
        <button type="button" disabled={pending} onClick={() => onAct(() => deleteMemoryAction(m.id))} className="text-muted hover:text-rose-600 font-bold">מחק</button>
        <select disabled={pending} value={m.visibility} onChange={(e) => onAct(() => setMemoryVisibilityAction(m.id, e.target.value as MemoryVisibility))}
          className="border-line bg-surface text-ink rounded-md border px-1.5 py-0.5">
          {VIS.map((v) => <option key={v} value={v}>{VISIBILITY_LABELS[v]}</option>)}
        </select>
      </div>
    </div>
  );
}

export function AiMemoryPanel() {
  const [memories, setMemories] = useState<AiMemory[]>([]);
  const [q, setQ] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState<MemoryType>("manual_note");
  const [visibility, setVisibility] = useState<MemoryVisibility>("private");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reload = () => start(async () => { setMemories(await listMemoriesAction()); });
  useEffect(() => { reload(); }, []);

  const onAct = (fn: () => Promise<unknown>) => start(async () => { await fn(); setMemories(await listMemoriesAction()); });

  const create = () => {
    const t = title.trim();
    if (!t || pending) return;
    setNote(null);
    start(async () => {
      const res = await createMemoryAction({ memoryType: type, title: t, visibility, sourceType: "manual", confidence: 100 });
      if (!res.ok) setNote(res.reason ?? "השמירה נכשלה.");
      setTitle("");
      setMemories(await listMemoriesAction());
    });
  };

  const filtered = useMemo(() => searchMemories(memories, q), [memories, q]);
  const groups = useMemo(() => groupForDisplay(filtered), [filtered]);

  const section = (label: string, items: AiMemory[]) => items.length ? (
    <div className="flex flex-col gap-2">
      <p className="text-ink text-xs font-black">{label} <span className="text-muted">({items.length})</span></p>
      {items.map((m) => <MemoryRow key={m.id} m={m} onAct={onAct} pending={pending} />)}
    </div>
  ) : null;

  return (
    <TerminalSection title="זיכרון AI" subtitle="ידע מובנה, מוסבר ובשליטתך — ללא סודות, ללא ביצוע">
      <div dir="rtl" className="flex flex-col gap-3">
        {/* Create */}
        <div className="flex flex-wrap items-center gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }}
            placeholder="הוסף זיכרון (כותרת)…" className="border-line bg-surface text-ink focus:border-brand-light min-w-[180px] flex-1 rounded-xl border p-2 text-sm outline-none" />
          <select value={type} onChange={(e) => setType(e.target.value as MemoryType)} className="border-line bg-surface text-ink rounded-xl border p-2 text-xs">
            {TYPES.map((t) => <option key={t} value={t}>{MEMORY_TYPE_LABELS[t]}</option>)}
          </select>
          <select value={visibility} onChange={(e) => setVisibility(e.target.value as MemoryVisibility)} className="border-line bg-surface text-ink rounded-xl border p-2 text-xs">
            {VIS.map((v) => <option key={v} value={v}>{VISIBILITY_LABELS[v]}</option>)}
          </select>
          <button type="button" onClick={create} disabled={pending || !title.trim()} className="bg-brand hover:bg-brand-strong rounded-xl px-4 py-2 text-sm font-bold text-white transition disabled:opacity-50">שמור</button>
        </div>
        {note && <p className="text-muted text-[11px]">{note}</p>}

        {/* Search */}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש בזיכרון (כותרת, סיכום, סוג, תגיות)…"
          className="border-line bg-surface text-ink focus:border-brand-light w-full rounded-xl border p-2 text-sm outline-none" />

        {memories.length === 0 ? (
          <TerminalEmpty text="אין זיכרונות עדיין. הוסף זיכרון כדי ש-ZONO יזכור את ההעדפות והכללים שלך." />
        ) : (
          <div className="flex flex-col gap-3">
            {section("מוצמדים", groups.pinned)}
            {section("בשימוש תכוף", groups.frequent)}
            {section("אחרונים", groups.recent)}
            {section("פגי תוקף", groups.expired)}
            {section("ארכיון", groups.archived)}
          </div>
        )}
        <p className="text-muted text-[10px]">כל זיכרון בשליטתך · ניתן לעריכה/ארכיון/מחיקה/הצמדה · לעולם לא נשמרים סודות.</p>
      </div>
    </TerminalSection>
  );
}
