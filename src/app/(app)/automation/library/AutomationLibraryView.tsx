"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import {
  enableTemplateAction, disableTemplateAction, runTemplateTestAction, duplicateTemplateAction,
} from "@/lib/automation/actions";
import { actionLabel, triggerLabel } from "@/lib/automation/engine";
import { libraryCategoryLabel, LIBRARY_CATEGORIES, RISK_LABELS, type LibraryTemplate, type LibrarySummary, type LibraryRecommendation } from "@/lib/automation/library";

type Tab = "all" | "category" | "recommended" | "enabled" | "disabled" | "risk" | "impact" | "recent" | "errors";

const RISK_TONE: Record<string, string> = {
  safe: "bg-success-soft text-success", review_required: "bg-warning-soft text-warning",
  manager_approval_required: "bg-danger-soft text-danger", disabled_by_default: "bg-surface text-muted",
};

export function AutomationLibraryView({ templates, summary, recommendations }: { templates: LibraryTemplate[]; summary: LibrarySummary; recommendations: LibraryRecommendation[] }) {
  const [tab, setTab] = useState<Tab>("all");
  const [cat, setCat] = useState<string>("");
  const [risk, setRisk] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const r = useActionRunner();
  const recKeys = useMemo(() => new Set(recommendations.map((x) => x.template_key)), [recommendations]);

  const filtered = useMemo(() => {
    let list = templates;
    if (tab === "recommended") list = list.filter((t) => recKeys.has(t.template_key));
    if (tab === "enabled") list = list.filter((t) => t.enabled);
    if (tab === "disabled") list = list.filter((t) => !t.enabled);
    if (tab === "recent") list = list.filter((t) => t.runs > 0).sort((a, b) => (b.lastRunAt ?? "").localeCompare(a.lastRunAt ?? ""));
    if (tab === "errors") list = list.filter((t) => t.failed > 0);
    if (tab === "impact") list = [...list].sort((a, b) => rank(b.expected_impact) - rank(a.expected_impact));
    if (cat) list = list.filter((t) => t.category === cat);
    if (risk) list = list.filter((t) => t.risk_level === risk);
    if (search.trim()) { const s = search.trim(); list = list.filter((t) => t.title.includes(s) || (t.subcategory ?? "").toLowerCase().includes(s.toLowerCase())); }
    return list;
  }, [templates, tab, cat, risk, search, recKeys]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "all", label: "כל התבניות" }, { id: "category", label: "לפי קטגוריה" }, { id: "recommended", label: "מומלצות" },
    { id: "enabled", label: "מופעלות" }, { id: "disabled", label: "כבויות" }, { id: "risk", label: "רמת סיכון" },
    { id: "impact", label: "השפעה" }, { id: "recent", label: "הופעלו לאחרונה" }, { id: "errors", label: "שגיאות" },
  ];

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Presentation" size={18} /></span>
            <h1 className="text-ink text-2xl font-black">ספריית האוטומציות</h1>
          </div>
          <p className="text-muted text-sm">{summary.total} תבניות חכמות מוכנות לכל המערכת — בטוחות כברירת מחדל, מפוקחות אנושית, ניתנות לביטול.</p>
        </div>
        <Link href="/automation" className="text-brand-strong mt-1 whitespace-nowrap text-sm font-bold hover:underline">למרכז האוטומציה ←</Link>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="סה״כ תבניות" value={summary.total} tone="text-ink" />
        <Stat label="מופעלות" value={summary.enabled} tone="text-success" />
        <Stat label="בטוחות" value={summary.safe} tone="text-success" />
        <Stat label="דורשות אישור מנהל" value={summary.managerApproval} tone="text-danger" />
      </div>

      <ActionFeedback runner={r} />

      <div className="flex flex-col gap-2">
        <nav className="border-line flex gap-1 overflow-x-auto border-b">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`whitespace-nowrap px-3 py-2 text-sm font-bold ${tab === t.id ? "text-brand-strong border-brand border-b-2" : "text-muted"}`}>{t.label}</button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש תבנית..." className="border-line bg-card text-ink h-9 w-48 rounded-lg border px-3 text-sm" />
          <select value={cat} onChange={(e) => setCat(e.target.value)} className="border-line bg-card text-ink h-9 rounded-lg border px-2 text-sm">
            <option value="">כל הקטגוריות</option>
            {LIBRARY_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select value={risk} onChange={(e) => setRisk(e.target.value)} className="border-line bg-card text-ink h-9 rounded-lg border px-2 text-sm">
            <option value="">כל רמות הסיכון</option>
            {Object.entries(RISK_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span className="text-muted text-[12px]">{filtered.length} תוצאות</span>
        </div>
      </div>

      {tab === "category" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.byCategory.map((c) => (
            <button key={c.category} onClick={() => { setTab("all"); setCat(c.category); }}
              className="bg-card border-line flex items-center justify-between rounded-2xl border p-4 text-right shadow-sm hover:border-[#7C3AED]">
              <div>
                <p className="text-ink font-black">{c.label}</p>
                <p className="text-muted text-[12px]">{c.enabled} מופעלות מתוך {c.total}</p>
              </div>
              <Icon name="ArrowLeft" size={16} />
            </button>
          ))}
        </div>
      ) : tab === "recommended" && recommendations.length > 0 ? (
        <div className="flex flex-col gap-2">
          {recommendations.map((rec) => {
            const t = templates.find((x) => x.template_key === rec.template_key);
            return t ? <TemplateCard key={rec.template_key} t={t} r={r} isManager={summary.isManager} recommended reason={rec.reason} /> : null;
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.length === 0 ? <Empty text="אין תבניות תואמות" /> : filtered.slice(0, 200).map((t) => (
            <TemplateCard key={t.template_key} t={t} r={r} isManager={summary.isManager} recommended={recKeys.has(t.template_key)} />
          ))}
          {filtered.length > 200 && <p className="text-muted text-center text-[12px]">מוצגות 200 מתוך {filtered.length} — צמצם עם חיפוש או סינון</p>}
        </div>
      )}
    </main>
  );
}

function rank(impact: string | null) { return impact === "high" ? 3 : impact === "medium" ? 2 : 1; }
type Runner = ReturnType<typeof useActionRunner>;

function TemplateCard({ t, r, isManager, recommended, reason }: { t: LibraryTemplate; r: Runner; isManager: boolean; recommended?: boolean; reason?: string }) {
  const [open, setOpen] = useState(false);
  const wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) =>
    r.run(async () => { const res = await fn(); if (res.error) throw new Error(res.error); return res; }, { id, pendingMessage: pending, success: (x) => x.message ?? null });

  return (
    <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-ink font-black">{t.title}</p>
            <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[11px] font-bold">{libraryCategoryLabel(t.category)}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${RISK_TONE[t.risk_level] ?? "bg-surface text-muted"}`}>{RISK_LABELS[t.risk_level] ?? t.risk_level}</span>
            {t.enabled && <span className="bg-success-soft text-success rounded-full px-2 py-0.5 text-[11px] font-bold">פעיל</span>}
            {recommended && <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">מומלץ</span>}
            {t.failed > 0 && <span className="bg-danger-soft text-danger rounded-full px-2 py-0.5 text-[11px] font-bold">{t.failed} כשלים</span>}
          </div>
          <p className="text-muted mt-1 text-[12px]">טריגר: {triggerLabel(t.trigger_type)} · השפעה: {t.expected_impact ?? "—"} · חיסכון ~{t.expected_time_saved_minutes} דק׳ · תפקיד: {t.required_role === "manager" ? "מנהל" : "סוכן"}</p>
          {reason && <p className="text-brand-strong mt-0.5 text-[12px]">✓ {reason}</p>}
        </div>
        <button onClick={() => setOpen(!open)} className="text-brand-strong whitespace-nowrap text-[12px] font-bold">{open ? "סגור" : "תצוגה"}</button>
      </div>

      {open && (
        <div className="border-line mt-3 flex flex-col gap-2 border-t pt-3">
          {t.business_goal && <p className="text-ink text-[13px]">🎯 {t.business_goal}</p>}
          {t.description && <p className="text-muted text-[12px]">{t.description}</p>}
          <div className="flex flex-wrap gap-1">
            {t.actions.map((a, i) => <span key={i} className="bg-surface text-ink rounded-full px-2 py-0.5 text-[11px] font-semibold">{i + 1}. {actionLabel(a)}</span>)}
          </div>
          {t.related_modules.length > 0 && <p className="text-muted text-[11px]">מודולים: {t.related_modules.join(", ")}</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {isManager ? (
          t.enabled ? (
            <Button size="sm" variant="ghost" loading={r.busyId === `dis-${t.template_key}`}
              onClick={() => wrap(() => disableTemplateAction(t.template_key), `dis-${t.template_key}`)}>
              <Icon name="Minus" size={14} />השבת
            </Button>
          ) : (
            <Button size="sm" loading={r.busyId === `en-${t.template_key}`}
              onClick={() => wrap(() => enableTemplateAction(t.template_key), `en-${t.template_key}`, "מפעיל...")}>
              <Icon name="Flame" size={14} />הפעל
            </Button>
          )
        ) : <span className="text-muted text-[11px]">רק מנהל מפעיל תבניות</span>}
        <Button size="sm" variant="ghost" loading={r.busyId === `test-${t.template_key}`}
          onClick={() => wrap(() => runTemplateTestAction(t.template_key), `test-${t.template_key}`, "מריץ בדיקה...")}>
          <Icon name="Send" size={14} />הרץ בדיקה
        </Button>
        {isManager && (
          <Button size="sm" variant="ghost" loading={r.busyId === `dup-${t.template_key}`}
            onClick={() => wrap(() => duplicateTemplateAction(t.template_key), `dup-${t.template_key}`)}>
            <Icon name="Plus" size={14} />שכפל
          </Button>
        )}
        {t.runs > 0 && <Link href="/automation" className="text-brand-strong inline-flex items-center gap-1 px-2 text-[12px] font-bold"><Icon name="BarChart3" size={13} />יומנים</Link>}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-4 shadow-sm">
      <span className="text-muted text-[12px] font-bold">{label}</span>
      <span className={`text-2xl font-black ${tone}`}>{value}</span>
    </div>
  );
}
function Empty({ text }: { text: string }) { return <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">{text}</div>; }
