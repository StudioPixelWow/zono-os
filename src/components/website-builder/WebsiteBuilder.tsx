"use client";
// ============================================================================
// 🌐 ZONO Website Builder OS™ — builder UI (mobile-first RTL). 38.0.
// Manages section order + visibility, templates, AI recommendations, SEO and
// analytics over the EXISTING website config. Publish REUSES the existing
// approval-gated publish. No auto-publish; nothing new is rendered publicly.
// ============================================================================
import { useState, useTransition } from "react";
import type { BuilderView, BuilderTarget, BuilderSection } from "@/lib/website-builder/types";
import { moveSection } from "@/lib/website-builder/assemble";
import { saveWebsiteLayoutAction, applyWebsiteTemplateAction, publishWebsiteAction, askWebsiteAction, getWebsiteBuilderAction } from "@/lib/website-builder/actions";

type Tab = "sections" | "templates" | "recs" | "seo" | "analytics" | "ask";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "sections", label: "סקשנים", icon: "🧩" }, { id: "templates", label: "תבניות", icon: "🎨" },
  { id: "recs", label: "המלצות", icon: "✨" }, { id: "seo", label: "SEO", icon: "🔎" },
  { id: "analytics", label: "נתונים", icon: "📊" }, { id: "ask", label: "שאל", icon: "🔮" },
];
const impCls: Record<string, string> = { high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };
const bandCls: Record<string, string> = { strong: "bg-success-soft text-success", fair: "bg-warning-soft text-warning", weak: "bg-danger-soft text-danger" };

export function WebsiteBuilder({ initial, initialTarget }: { initial: BuilderView | { missing: true; target: BuilderTarget }; initialTarget: BuilderTarget }) {
  const [target, setTarget] = useState<BuilderTarget>(initialTarget);
  const [view, setView] = useState<BuilderView | { missing: true; target: BuilderTarget }>(initial);
  const [tab, setTab] = useState<Tab>("sections");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const reload = (t: BuilderTarget) => start(async () => { const r = await getWebsiteBuilderAction(t); if (r.ok && r.result) setView(r.result); });
  const switchTarget = (t: BuilderTarget) => { setTarget(t); reload(t); };

  if ("missing" in view) {
    return (
      <div dir="rtl" className="mx-auto max-w-xl px-4 pt-8 text-center">
        <TargetSwitch target={target} onSwitch={switchTarget} />
        <div className="bg-card border-line mt-6 rounded-[22px] border p-8">
          <p className="text-ink text-lg font-black">עדיין אין {target === "agent" ? "אתר אישי" : "אתר משרד"}</p>
          <p className="text-muted mt-1 text-sm">צור אתר במסך {target === "agent" ? "האתר האישי" : "אתר המשרד"} ואז נהל אותו כאן.</p>
          <a href={target === "agent" ? "/agent-website" : "/office-website"} className="bg-brand mt-4 inline-block rounded-xl px-4 py-2 text-sm font-bold text-white">צור אתר</a>
        </div>
      </div>
    );
  }
  const v = view;

  return (
    <div dir="rtl" className="mx-auto max-w-xl px-4 pb-24 pt-5">
      <div className="bg-brand-soft rounded-[22px] p-4">
        <div className="flex items-center justify-between">
          <div><p className="text-brand text-xs font-bold">ZONO Website Builder</p><h1 className="text-ink text-2xl font-black">🌐 בונה האתרים</h1></div>
          <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${bandCls[v.health.band]}`}>בריאות {v.health.score}</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <TargetSwitch target={target} onSwitch={switchTarget} />
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${v.site.published ? "bg-success-soft text-success" : "bg-surface text-muted"}`}>{v.site.published ? "מפורסם" : "טיוטה"}</span>
        </div>
      </div>

      {msg && <div className="text-success mt-3 text-center text-[12px] font-bold">{msg}</div>}

      <div className="mt-4">
        {tab === "sections" && <SectionsTab v={v} target={target} pending={pending} onSaved={(m) => { setMsg(m); reload(target); }} start={start} />}
        {tab === "templates" && <TemplatesTab v={v} target={target} pending={pending} onApplied={(m) => { setMsg(m); reload(target); }} start={start} />}
        {tab === "recs" && <RecsTab v={v} />}
        {tab === "seo" && <SeoTab v={v} />}
        {tab === "analytics" && <AnalyticsTab v={v} />}
        {tab === "ask" && <AskTab />}
      </div>

      <div className="mt-6">
        <button disabled={pending || v.site.published} onClick={() => start(async () => { const r = await publishWebsiteAction(target); setMsg(r.ok ? "פורסם ✓" : r.error ?? "שגיאה"); reload(target); })} className="bg-brand w-full rounded-xl py-3 text-[14px] font-bold text-white disabled:opacity-50">{v.site.published ? "האתר מפורסם" : "פרסם אתר (דורש אישור)"}</button>
        <div className="text-muted mt-1 text-center text-[10px]">אין פרסום אוטומטי — הפרסום ידני בלבד.</div>
      </div>

      <nav className="bg-card/95 border-line fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-xl justify-between border-t px-1 py-1.5 backdrop-blur">
        {TABS.map((t) => <button key={t.id} onClick={() => setTab(t.id)} className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10px] font-bold transition ${tab === t.id ? "text-brand bg-brand-soft" : "text-muted"}`}><span className="text-sm leading-none">{t.icon}</span>{t.label}</button>)}
      </nav>
    </div>
  );
}

function TargetSwitch({ target, onSwitch }: { target: BuilderTarget; onSwitch: (t: BuilderTarget) => void }) {
  return (
    <div className="bg-card inline-flex rounded-xl p-1">
      {(["agent", "office"] as BuilderTarget[]).map((t) => <button key={t} onClick={() => onSwitch(t)} className={`rounded-lg px-3 py-1 text-[12px] font-bold ${target === t ? "bg-brand text-white" : "text-muted"}`}>{t === "agent" ? "אישי" : "משרד"}</button>)}
    </div>
  );
}

function SectionsTab({ v, target, pending, onSaved, start }: { v: BuilderView; target: BuilderTarget; pending: boolean; onSaved: (m: string) => void; start: (fn: () => Promise<void>) => void }) {
  const [sections, setSections] = useState<BuilderSection[]>(v.sections);
  const order = sections.map((s) => s.key);
  const move = (key: string, dir: "up" | "down") => { const newOrder = moveSection(order, key, dir); setSections(newOrder.map((k, i) => ({ ...sections.find((s) => s.key === k)!, order: i }))); };
  const toggle = (key: string) => setSections(sections.map((s) => s.key === key ? { ...s, enabled: !s.enabled } : s));
  const save = () => start(async () => { const map: Record<string, boolean> = {}; for (const s of sections) map[s.key] = s.enabled; const r = await saveWebsiteLayoutAction(target, sections.map((s) => s.key), map); onSaved(r.ok ? "נשמר ✓" : r.error ?? "שגיאה"); });
  return (
    <div className="space-y-2">
      <p className="text-muted text-[12px]">גרור בעזרת החיצים לסידור, והפעל/כבה סקשנים.</p>
      {sections.map((s, i) => (
        <div key={s.key} className="bg-surface flex items-center gap-2 rounded-2xl p-2.5">
          <div className="flex flex-col">
            <button disabled={i === 0} onClick={() => move(s.key, "up")} className="text-muted disabled:opacity-30">▲</button>
            <button disabled={i === sections.length - 1} onClick={() => move(s.key, "down")} className="text-muted disabled:opacity-30">▼</button>
          </div>
          <span className="text-lg">{s.icon}</span>
          <div className="min-w-0 flex-1"><div className="text-ink text-[13px] font-bold">{s.label}{s.essential && <span className="text-brand"> *</span>}</div></div>
          <button onClick={() => toggle(s.key)} className={`rounded-full px-3 py-1 text-[11px] font-bold ${s.enabled ? "bg-success-soft text-success" : "bg-card text-muted"}`}>{s.enabled ? "פעיל" : "כבוי"}</button>
        </div>
      ))}
      <button disabled={pending} onClick={save} className="bg-brand mt-2 w-full rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-50">שמור סידור</button>
    </div>
  );
}

function TemplatesTab({ v, target, pending, onApplied, start }: { v: BuilderView; target: BuilderTarget; pending: boolean; onApplied: (m: string) => void; start: (fn: () => Promise<void>) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-muted text-[12px]">בחר תבנית — היא תסדר ותפעיל את הסקשנים המתאימים.</p>
      {v.templates.map((t) => (
        <div key={t.key} className="bg-card border-line rounded-2xl border p-3">
          <div className="text-ink text-[14px] font-black">{t.name}</div>
          <div className="text-muted mt-0.5 text-[12px]">{t.description}</div>
          <div className="text-muted mt-1 text-[11px]">{t.sections.length} סקשנים</div>
          <button disabled={pending} onClick={() => start(async () => { const r = await applyWebsiteTemplateAction(target, t.key); onApplied(r.ok ? `הוחלה תבנית "${t.name}" ✓` : r.error ?? "שגיאה"); })} className="bg-brand-soft text-brand mt-2 rounded-lg px-3 py-1.5 text-[12px] font-bold">החל תבנית</button>
        </div>
      ))}
    </div>
  );
}

function RecsTab({ v }: { v: BuilderView }) {
  return v.recommendations.length === 0 ? <div className="bg-card border-line text-muted rounded-2xl border p-6 text-center text-[13px]">האתר במצב טוב — אין המלצות דחופות.</div> : (
    <div className="space-y-2">{v.recommendations.map((r, i) => (
      <div key={i} className="bg-card border-line rounded-2xl border p-3">
        <div className="flex items-start justify-between gap-2"><span className="text-ink text-[13px] font-black">{r.title}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${impCls[r.impact]}`}>{r.impact === "high" ? "גבוה" : r.impact === "medium" ? "בינוני" : "נמוך"}</span></div>
        <div className="text-muted mt-1 text-[12px]">{r.why}</div>
        {r.evidence.length > 0 && <div className="text-muted mt-1 text-[11px]">📌 {r.evidence.join(" · ")}</div>}
      </div>
    ))}</div>
  );
}

function SeoTab({ v }: { v: BuilderView }) {
  return (
    <div className="space-y-3">
      <div className={`rounded-2xl p-3 text-center text-[13px] font-bold ${v.seo.ready ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{v.seo.ready ? "✓ ה-SEO תקין" : `⚠️ ${v.seo.issues.length} בעיות SEO`}</div>
      <div className="bg-card border-line rounded-2xl border p-3"><div className="text-muted text-[11px] font-bold">כותרת</div><div className="text-ink text-[13px]">{v.seo.title ?? "—"}</div></div>
      <div className="bg-card border-line rounded-2xl border p-3"><div className="text-muted text-[11px] font-bold">תיאור</div><div className="text-ink text-[13px]">{v.seo.description ?? "—"}</div></div>
      {v.seo.issues.map((i, k) => <div key={k} className="bg-surface rounded-xl p-2.5 text-[12px]"><span className="text-danger font-bold">{i.field}:</span> <span className="text-muted">{i.issue}</span></div>)}
    </div>
  );
}

function AnalyticsTab({ v }: { v: BuilderView }) {
  const a = v.analytics;
  const tiles: [string, number | string][] = [["מבקרים", a.visitors], ["לידים", a.leads], ["צפיות נכס", a.propertyViews], ["וואטסאפ", a.whatsappClicks], ["שיחות", a.calls], ["המרה", `${a.conversionRate}%`]];
  return <div className="grid grid-cols-2 gap-2">{tiles.map(([l, val]) => <div key={l} className="bg-card border-line rounded-2xl border px-3 py-3 text-center"><div className="text-brand text-2xl font-black">{val}</div><div className="text-muted text-[11px] font-bold">{l}</div></div>)}</div>;
}

function AskTab() {
  const [res, setRes] = useState<{ answer: string; items: { title: string; detail: string }[] } | null>(null);
  const [pending, start] = useTransition();
  const suggestions = ["איך לשפר את האתר?", "איזה דף חסר?", "איזה אזור חסר SEO?", "איזה נכסים כדאי להבליט?"];
  const ask = (q: string) => { if (!q.trim()) return; start(async () => { const r = await askWebsiteAction(q); setRes(r.ok && r.result ? { answer: r.result.answer, items: r.result.items } : { answer: "לא ניתן לענות כרגע.", items: [] }); }); };
  return (
    <div className="space-y-3">
      <div className="bg-brand-soft rounded-2xl p-3"><div className="text-brand text-[13px] font-black">🔮 שאל את ZONO על האתר</div></div>
      <div className="flex flex-wrap gap-1.5">{suggestions.map((s) => <button key={s} onClick={() => ask(s)} className="bg-surface text-ink rounded-full px-3 py-1.5 text-[11px] font-bold">{s}</button>)}</div>
      {pending && <div className="text-muted text-[12px]">חושב…</div>}
      {res && <div className="bg-card border-line rounded-2xl border p-3"><div className="text-ink text-[13px] font-bold">{res.answer}</div><div className="mt-2 space-y-1">{res.items.map((it, i) => <div key={i} className="bg-surface rounded-lg px-2.5 py-1.5"><span className="text-ink text-[12px] font-bold">{it.title}</span> <span className="text-muted text-[11px]">— {it.detail}</span></div>)}</div></div>}
    </div>
  );
}
