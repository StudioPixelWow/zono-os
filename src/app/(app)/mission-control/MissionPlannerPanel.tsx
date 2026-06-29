"use client";
// ============================================================================
// 🎯 Mission Control — AI Mission Planner panel. Phase 27.4.
// ----------------------------------------------------------------------------
// Lists evidence-backed mission DRAFTS, grouped by review status, with
// Approve / Reject / "not now". NO execution buttons — approval only flips
// status. Drafts are generated from a question via the AI Reasoning Gateway.
// ============================================================================
import { useEffect, useState, useTransition } from "react";
import {
  listMissionDraftsAction, createMissionDraftFromReasoningAction,
  approveMissionDraftAction, rejectMissionDraftAction,
} from "@/lib/ai-mission-planner/service";
import type { MissionDraft, MissionPriority, MissionStatus } from "@/lib/ai-mission-planner/types";

const PRIORITY_CLASS: Record<MissionPriority, string> = {
  urgent: "bg-rose-100 text-rose-700", high: "bg-amber-100 text-amber-700",
  medium: "bg-sky-100 text-sky-700", low: "bg-slate-100 text-slate-600",
};
const STATUS_LABEL: Record<MissionStatus, string> = {
  draft: "טיוטה", ready_for_review: "לבדיקה", approved: "אושר", rejected: "נדחה", converted: "הומר", expired: "פג",
};
const GROUPS: { key: MissionStatus; label: string }[] = [
  { key: "ready_for_review", label: "לבדיקה" },
  { key: "draft", label: "טיוטות" },
  { key: "approved", label: "אושרו" },
  { key: "rejected", label: "נדחו" },
];

export function MissionPlannerPanel() {
  const [drafts, setDrafts] = useState<MissionDraft[]>([]);
  const [question, setQuestion] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const reload = () => start(async () => { setDrafts(await listMissionDraftsAction()); });
  useEffect(() => { reload(); }, []);

  const generate = () => {
    const q = question.trim();
    if (!q || pending) return;
    setNote(null);
    start(async () => {
      const res = await createMissionDraftFromReasoningAction({ question: q, contextType: "mission-control" });
      setQuestion("");
      if (res.drafts.length === 0) setNote(res.skipped[0]?.detail ? `לא נוצרה טיוטה: ${res.skipped[0].reason}` : "לא נוצרה טיוטה (אין מספיק ראיות).");
      setDrafts(await listMissionDraftsAction());
    });
  };

  const act = (id: string, action: "approve" | "reject") => start(async () => {
    const res = action === "approve" ? await approveMissionDraftAction(id) : await rejectMissionDraftAction(id);
    if (!res.ok) setNote(res.reason ?? "הפעולה נכשלה."); else setNote(null);
    setDrafts(await listMissionDraftsAction());
  });

  return (
    <div dir="rtl" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") generate(); }}
          placeholder="צור טיוטת משימה משאלה… (מבוסס ראיות בלבד)"
          className="border-line bg-surface text-ink focus:border-brand-light flex-1 rounded-xl border p-2.5 text-sm outline-none" />
        <button type="button" onClick={generate} disabled={pending || !question.trim()}
          className="bg-brand hover:bg-brand-strong shrink-0 rounded-xl px-4 py-2 text-sm font-bold text-white transition disabled:opacity-50">
          {pending ? "…" : "צור טיוטה"}
        </button>
      </div>
      {note && <p className="text-muted text-[11px]">{note}</p>}

      {drafts.length === 0 ? (
        <p className="text-muted text-sm">אין טיוטות משימה עדיין. צור טיוטה משאלה, או שטיוטות ייווצרו מאותות קיימים.</p>
      ) : (
        GROUPS.map((g) => {
          const items = drafts.filter((d) => d.status === g.key);
          if (!items.length) return null;
          return (
            <div key={g.key} className="flex flex-col gap-2">
              <p className="text-ink text-xs font-black">{g.label} <span className="text-muted">({items.length})</span></p>
              {items.map((d) => (
                <div key={d.id} className="border-line bg-card rounded-xl border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-ink truncate text-sm font-bold">{d.title}</p>
                      {d.summary && <p className="text-muted mt-0.5 line-clamp-2 text-xs">{d.summary}</p>}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${PRIORITY_CLASS[d.priority]}`}>{d.priority}</span>
                  </div>
                  <div className="text-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <span>קטגוריה: <span className="text-ink font-bold">{d.category}</span></span>
                    <span>ביטחון: <span className="text-ink font-bold">{Math.round(d.confidence)}%</span></span>
                    <span>מקור: <span className="text-ink font-bold">{d.sourceType}</span></span>
                    <span>ראיות: <span className="text-ink font-bold">{d.evidence.length}</span></span>
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-slate-600">{STATUS_LABEL[d.status]}</span>
                  </div>
                  {d.evidence.length > 0 && (
                    <ul className="border-line/60 mt-2 flex flex-col gap-0.5 border-t pt-2">
                      {d.evidence.slice(0, 3).map((e, i) => (
                        <li key={i} className="text-muted text-[11px]"><span className="text-ink font-bold">{e.label}</span>{e.value ? ` · ${e.value}` : ""} <span className="text-brand-strong">· {e.source}</span></li>
                      ))}
                    </ul>
                  )}
                  {(d.status === "ready_for_review" || d.status === "draft") && (
                    <div className="mt-3 flex items-center gap-2">
                      <button type="button" onClick={() => act(d.id, "approve")} disabled={pending}
                        className="bg-brand hover:bg-brand-strong rounded-lg px-3 py-1.5 text-xs font-bold text-white transition disabled:opacity-50">אשר</button>
                      <button type="button" onClick={() => act(d.id, "reject")} disabled={pending}
                        className="border-line bg-surface text-ink hover:border-rose-300 rounded-lg border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50">דחה</button>
                      <span className="text-muted text-[11px]">לא עכשיו — נשאר כטיוטה</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })
      )}
      <p className="text-muted text-[10px]">טיוטות בלבד · אישור אינו מבצע פעולה ואינו יוצר משימה אמיתית · ללא שליחת הודעות.</p>
    </div>
  );
}
