"use client";
// ============================================================================
// ZI Expert™ Knowledge admin (Phase 23). Read-mostly: lists articles by
// category/module, a live search tester, feedback, missing-answer questions,
// and a built-in sync button. Editing custom articles is a later phase (TODO).
// ============================================================================
import { useEffect, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import {
  loadKnowledgeAdminAction, syncKnowledgeAction, testKnowledgeSearchAction,
  type KnowledgeAdminData,
} from "@/lib/zi-expert/actions";

type SearchHit = { title: string; category: string; score: number; reason: string };

export function ZiKnowledgeAdminView() {
  const runner = useActionRunner();
  const [data, setData] = useState<KnowledgeAdminData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  const load = () => { void loadKnowledgeAdminAction().then((r) => (r.ok ? setData(r.data) : setErr(r.error))); };
  useEffect(() => { load(); }, []);

  const sync = () => runner.run(async () => {
    const r = await syncKnowledgeAction();
    if (r.ok) load();
    return { ok: r.ok, message: r.ok ? `סונכרן: ${r.data.inserted} חדשים · ${r.data.updated} עודכנו · ${r.data.unchanged} ללא שינוי · ${r.data.chunks} מקטעים` : r.error };
  }, { id: "kb-sync", pendingMessage: "מסנכרן מאגר ידע…", success: (r) => r.message ?? null });

  const test = () => runner.run(async () => {
    const r = await testKnowledgeSearchAction(query);
    setHits(r.ok ? r.data : null);
    return { ok: r.ok, message: r.ok ? `נמצאו ${r.data.length} מאמרים` : r.error };
  }, { id: "kb-test", pendingMessage: "מחפש…", success: (r) => r.message ?? null });

  type Art = KnowledgeAdminData["articles"][number];
  const byCategory: Record<string, Art[]> = {};
  for (const a of data?.articles ?? []) { (byCategory[a.category] ||= []).push(a); }

  return (
    <main dir="rtl" className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="zono-gradient-glow grid h-11 w-11 place-items-center rounded-2xl text-white"><Icon name="Sparkles" size={22} /></span>
          <div>
            <h1 className="text-ink text-2xl font-black">מאגר הידע של ZI</h1>
            <p className="text-muted text-sm">מאמרי מוצר, חיפוש, משוב ושאלות ללא מענה. ZI מסביר בלבד — לא מבצע פעולות.</p>
          </div>
        </div>
        <Button onClick={sync} loading={runner.busyId === "kb-sync"}><Icon name="Download" size={14} className="ms-1" /> סנכרן מאגר מובנה</Button>
      </header>

      {err && <p className="text-danger mb-4 text-sm">{err}</p>}

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "מאמרים", value: data?.articles.length ?? "—" },
          { label: "קטגוריות", value: data?.categories.length ?? "—" },
          { label: "מודולים", value: data?.modules.length ?? "—" },
          { label: "לא פורסמו", value: data?.unpublished ?? "—" },
        ].map((s) => (
          <div key={s.label} className="border-line bg-card rounded-2xl border p-3 text-center">
            <p className="text-ink text-xl font-black">{s.value}</p>
            <p className="text-muted text-[11px] font-bold">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Search tester */}
      <div className="border-line bg-card mb-6 rounded-2xl border p-4">
        <p className="text-ink mb-2 text-sm font-black">בדיקת חיפוש ידע</p>
        <div className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") test(); }}
            placeholder="הקלד שאלה לבדיקה…" className="border-line bg-surface text-ink flex-1 rounded-xl border px-3 py-2 text-sm outline-none" />
          <Button size="sm" onClick={test} loading={runner.busyId === "kb-test"}><Icon name="Search" size={14} /></Button>
        </div>
        {hits && (
          <div className="mt-3 space-y-1.5">
            {hits.length === 0 ? <p className="text-muted text-xs">לא נמצאו תוצאות.</p> : hits.map((h, i) => (
              <div key={i} className="bg-surface flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs">
                <span className="text-ink font-bold">{h.title}</span>
                <span className="text-muted">{h.category} · ציון {h.score} · {h.reason}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Articles by category */}
      <div className="mb-6">
        <p className="text-ink mb-2 text-sm font-black">מאמרים לפי קטגוריה</p>
        <div className="space-y-4">
          {Object.entries(byCategory).map(([cat, arts]) => (
            <div key={cat} className="border-line bg-card rounded-2xl border p-4">
              <p className="text-brand-strong mb-2 text-xs font-black">{cat}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {arts.map((a) => (
                  <div key={a.id} className="bg-surface rounded-xl p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-ink text-sm font-bold">{a.title}</p>
                      <span className="text-muted text-[10px]">{a.roleVisibility}{a.published ? "" : " · טיוטה"}</span>
                    </div>
                    <p className="text-muted mt-1 line-clamp-2 text-[11px]">{a.summary}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feedback + missing answers */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="border-line bg-card rounded-2xl border p-4">
          <p className="text-ink mb-2 text-sm font-black">משוב אחרון</p>
          {(data?.feedback ?? []).length === 0 ? <p className="text-muted text-xs">אין עדיין משוב.</p> : (
            <div className="space-y-1.5">
              {data!.feedback.slice(0, 12).map((f) => (
                <div key={f.id} className="bg-surface rounded-lg px-3 py-2 text-xs">
                  <span className={f.rating === "helpful" ? "text-success" : "text-danger"}>{f.rating === "helpful" ? "👍" : f.rating === "missing_info" ? "❓" : "👎"}</span>{" "}
                  <span className="text-ink">{f.question}</span>
                  {f.comment && <span className="text-muted"> — {f.comment}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-line bg-card rounded-2xl border p-4">
          <p className="text-ink mb-2 text-sm font-black">שאלות ללא מענה ודאי (פערי תיעוד)</p>
          {(data?.missingQuestions ?? []).length === 0 ? <p className="text-muted text-xs">אין כרגע פערים מזוהים.</p> : (
            <ul className="list-disc space-y-1 pr-5 text-xs text-ink/85">
              {data!.missingQuestions.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
          )}
        </div>
      </div>

      <p className="text-muted mt-6 text-[11px]">עריכה/יצירה של מאמרים מותאמים תיתווסף בשלב הבא (TODO). כרגע: סנכרון מובנה, חיפוש, צפייה ומשוב.</p>
    </main>
  );
}
