"use client";
// ============================================================================
// ZI Interactive Learning™ — the "Learn" panel inside the ZI window (Phase 25).
// Sections: Continue Learning · Recommendations · Walkthroughs · Tutorials ·
// Glossary · FAQ + a unified search. Opening a lesson renders it as steps in the
// chat (support-only — ZI teaches, never acts). Loads on open.
// ============================================================================
import { useEffect, useState } from "react";
import { Search, GraduationCap, BookOpen, PlayCircle, Lightbulb, RotateCw } from "lucide-react";
import { loadLearningAction, searchLearningAction, type LearningData } from "@/lib/zi-expert/actions";
import type { LearningKind, LearningSearchHit } from "@/lib/zi-expert/learning/types";

export function ZILearnPanel({ currentModule, onOpenLesson, onAskGlossary }: {
  currentModule: string | null;
  onOpenLesson: (kind: LearningKind, slug: string, title: string) => void;
  onAskGlossary: (term: string) => void;
}) {
  const [data, setData] = useState<LearningData | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<LearningSearchHit[] | null>(null);

  useEffect(() => { void loadLearningAction(currentModule).then((r) => { if (r.ok) setData(r.data); }); }, [currentModule]);

  const doSearch = (q: string) => {
    setQuery(q);
    if (!q.trim()) { setHits(null); return; }
    void searchLearningAction(q).then((r) => setHits(r.ok ? r.data : []));
  };

  const isDone = (kind: LearningKind, slug: string) =>
    data?.progress.some((p) => p.kind === kind && p.slug === slug && p.status === "completed") ?? false;

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3" dir="rtl">
      <div className="mb-3 flex items-center gap-1.5 text-white/80">
        <GraduationCap size={16} /> <span className="text-sm font-black">מרכז למידה</span>
      </div>

      <div className="relative mb-3">
        <Search size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/40" />
        <input
          value={query} onChange={(e) => doSearch(e.target.value)} placeholder="חיפוש מדריכים, מונחים, שאלות…"
          className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-2 pe-3 ps-9 text-sm text-white placeholder:text-white/40 outline-none focus:border-violet-400/50"
        />
      </div>

      {hits ? (
        <Section title="תוצאות חיפוש">
          {hits.length === 0 ? <Empty text="לא נמצאו תוצאות." /> : hits.map((h) => (
            <Row key={`${h.kind}:${h.slug}`} icon={iconFor(h.kind)} title={h.title} sub={h.snippet}
              onClick={() => h.kind === "glossary" ? onAskGlossary(h.title) : h.kind !== "knowledge" ? onOpenLesson(h.kind as LearningKind, h.slug, h.title) : onAskGlossary(h.title)} />
          ))}
        </Section>
      ) : !data ? (
        <p className="text-white/50 text-sm">טוען…</p>
      ) : (
        <>
          {data.progress.some((p) => p.status === "in_progress") && (
            <Section title="המשך למידה" icon={<RotateCw size={12} />}>
              {data.progress.filter((p) => p.status === "in_progress").slice(0, 4).map((p) => (
                <Row key={`c:${p.kind}:${p.slug}`} icon={iconFor(p.kind)} title={p.slug} sub="להמשיך מהמקום שעצרת"
                  onClick={() => onOpenLesson(p.kind, p.slug, p.slug)} />
              ))}
            </Section>
          )}

          {data.recommendations.length > 0 && (
            <Section title="מומלץ עבורך" icon={<Lightbulb size={12} />}>
              {data.recommendations.map((r) => (
                <Row key={`r:${r.kind}:${r.slug}`} icon={iconFor(r.kind)} title={r.title} sub={r.reason}
                  onClick={() => onOpenLesson(r.kind, r.slug, r.title)} />
              ))}
            </Section>
          )}

          <Section title="סיורים מודרכים" icon={<PlayCircle size={12} />}>
            {data.walkthroughs.map((w) => (
              <Row key={w.slug} icon={<PlayCircle size={14} />} done={isDone("walkthrough", w.slug)}
                title={w.title} sub={`⏱️ ${w.estimatedMinutes} דק׳ · ${w.goal}`}
                onClick={() => onOpenLesson("walkthrough", w.slug, w.title)} />
            ))}
          </Section>

          <Section title="מדריכים קצרים">
            {data.tutorials.map((t) => (
              <Row key={t.slug} icon={<BookOpen size={14} />} done={isDone("tutorial", t.slug)}
                title={t.title} sub={t.summary} onClick={() => onOpenLesson("tutorial", t.slug, t.title)} />
            ))}
          </Section>

          {data.faq.length > 0 && (
            <Section title="שאלות נפוצות">
              {data.faq.slice(0, 6).map((f) => (
                <Row key={f.slug} icon={<BookOpen size={14} />} title={f.question} sub={f.answer}
                  onClick={() => onAskGlossary(f.question)} />
              ))}
            </Section>
          )}

          <Section title="מילון מונחים">
            {data.glossary.slice(0, 8).map((g) => (
              <Row key={g.slug} icon={<BookOpen size={14} />} title={g.term} sub={g.definition}
                onClick={() => onAskGlossary(g.term)} />
            ))}
          </Section>
        </>
      )}

      <p className="mt-3 text-center text-[10px] text-white/30">ZI מלמד ומסביר בלבד — לא מבצע פעולות ולא משנה נתונים.</p>
    </div>
  );
}

function iconFor(kind: LearningKind | "knowledge") {
  if (kind === "walkthrough") return <PlayCircle size={14} />;
  if (kind === "glossary") return <BookOpen size={14} />;
  return <BookOpen size={14} />;
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-bold text-white/40">{icon}{title}</p>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function Row({ icon, title, sub, onClick, done }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void; done?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-2.5 text-right transition hover:bg-white/[0.07]">
      <span className="mt-0.5 shrink-0 text-violet-300">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12px] font-bold text-white">{title}{done ? " ✓" : ""}</span>
        <span className="block truncate text-[11px] text-white/50">{sub}</span>
      </span>
    </button>
  );
}

function Empty({ text }: { text: string }) { return <p className="text-white/40 text-[12px]">{text}</p>; }
