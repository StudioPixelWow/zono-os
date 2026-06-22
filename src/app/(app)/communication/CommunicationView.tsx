"use client";

import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import {
  ingestCommunicationAction, resolveObjectionAction, markCommitmentFulfilledAction, markOpportunityActionedAction, recomputeAllAction,
} from "@/lib/comm-intelligence/actions";
import { SOURCE_ICONS, SOURCE_LABELS, SENTIMENT_LABELS } from "@/lib/comm-intelligence/engine";
import type { CommunicationCommandCenter, TimelineItem, ObjectionItem, RiskItem, OppItem, CommitmentItem } from "@/lib/comm-intelligence/service";

type Tab = "timeline" | "objections" | "commitments" | "risks" | "opportunities" | "ingest";
const SENT_TONE: Record<string, string> = {
  excited: "bg-success-soft text-success", positive: "bg-success-soft text-success", neutral: "bg-surface text-muted",
  urgent: "bg-warning-soft text-warning", cold: "bg-surface text-muted", frustrated: "bg-danger-soft text-danger", negative: "bg-danger-soft text-danger",
};
const SEV_TONE: Record<string, string> = { high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };

export function CommunicationView({ cc }: { cc: CommunicationCommandCenter }) {
  const [tab, setTab] = useState<Tab>("timeline");
  const r = useActionRunner();
  const wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) =>
    r.run(async () => { const res = await fn(); if (res.error) throw new Error(res.error); return res; }, { id, pendingMessage: pending, success: (x) => x.message ?? null });

  const tabs: { id: Tab; label: string; icon: string; n?: number }[] = [
    { id: "timeline", label: "ציר זמן מאוחד", icon: "Clock", n: cc.timeline.length },
    { id: "objections", label: "התנגדויות", icon: "AlertTriangle", n: cc.objections.length },
    { id: "commitments", label: "התחייבויות שנשברו", icon: "Handshake", n: cc.brokenCommitments.length },
    { id: "risks", label: "סיכונים", icon: "Flame", n: cc.risks.length },
    { id: "opportunities", label: "הזדמנויות", icon: "TrendingUp", n: cc.opportunities.length },
    { id: "ingest", label: "קליטת תקשורת", icon: "Plus" },
  ];

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="bg-brand text-white grid h-9 w-9 place-items-center rounded-xl"><Icon name="MessageCircle" size={18} /></span>
            <h1 className="text-ink text-2xl font-black">מודיעין תקשורת</h1>
          </div>
          <p className="text-muted text-sm">כל אינטראקציה הופכת למודיעין — וואטסאפ, שיחות, הודעות קוליות, פגישות, אימיילים, פעילות פורטל ואתר. ZONO זוכר מה הלקוח רוצה, מה השתנה, אילו התנגדויות קיימות, אילו הבטחות ניתנו, ומה צריך לקרות הבא.</p>
        </div>
        <Button size="sm" variant="ghost" loading={r.busyId === "recompute"} onClick={() => wrap(() => recomputeAllAction(), "recompute", "מחשב מחדש...")}>
          <Icon name="Sparkles" size={14} />חשב סיכונים והזדמנויות
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="התנגדויות חדשות" value={cc.kpis.newObjections} tone="text-warning" />
        <Kpi label="הבטחות שנשברו" value={cc.kpis.brokenCommitments} tone="text-danger" />
        <Kpi label="סיכוני תקשורת" value={cc.kpis.communicationRisks} tone="text-danger" />
        <Kpi label="קונים מוכנים" value={cc.kpis.readyBuyers} tone="text-success" />
        <Kpi label="מוכרים מוכנים" value={cc.kpis.readySellers} tone="text-success" />
        <Kpi label="אירועים (7 ימים)" value={cc.kpis.recentEvents} tone="text-ink" />
      </div>

      <ActionFeedback runner={r} />

      <nav className="border-line flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-bold ${tab === t.id ? "text-brand-strong border-brand border-b-2" : "text-muted"}`}>
            <Icon name={t.icon} size={15} />{t.label}{t.n ? <span className="bg-surface text-muted rounded-full px-1.5 text-[10px]">{t.n}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "timeline" && (cc.timeline.length === 0 ? <Empty text="אין אירועי תקשורת עדיין — קלוט אינטראקציה ראשונה" /> : <div className="flex flex-col gap-2">{cc.timeline.map((e) => <TimelineRow key={e.id} e={e} />)}</div>)}
      {tab === "objections" && (cc.objections.length === 0 ? <Empty text="אין התנגדויות פתוחות" /> : <div className="flex flex-col gap-2">{cc.objections.map((o) => <ObjectionRow key={o.id} o={o} r={r} wrap={wrap} />)}</div>)}
      {tab === "commitments" && (cc.brokenCommitments.length === 0 ? <Empty text="אין התחייבויות שנשברו" /> : <div className="flex flex-col gap-2">{cc.brokenCommitments.map((c) => <CommitmentRow key={c.id} c={c} r={r} wrap={wrap} />)}</div>)}
      {tab === "risks" && (cc.risks.length === 0 ? <Empty text="אין סיכוני תקשורת פעילים" /> : <div className="flex flex-col gap-2">{cc.risks.map((x) => <RiskRow key={x.id} x={x} />)}</div>)}
      {tab === "opportunities" && (cc.opportunities.length === 0 ? <Empty text="אין הזדמנויות פתוחות" /> : <div className="flex flex-col gap-2">{cc.opportunities.map((o) => <OppRow key={o.id} o={o} r={r} wrap={wrap} />)}</div>)}
      {tab === "ingest" && <IngestForm r={r} wrap={wrap} />}
    </main>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="bg-card border-line flex flex-col gap-0.5 rounded-2xl border p-3 shadow-sm"><span className="text-muted text-[11px] font-bold">{label}</span><span className={`text-xl font-black ${tone}`}>{value}</span></div>;
}
type Runner = ReturnType<typeof useActionRunner>;
type Wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) => void;
function Empty({ text }: { text: string }) { return <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">{text}</div>; }

function TimelineRow({ e }: { e: TimelineItem }) {
  return (
    <div className="bg-card border-line flex items-start gap-3 rounded-2xl border p-3 shadow-sm">
      <span className="bg-surface text-muted grid h-8 w-8 shrink-0 place-items-center rounded-xl"><Icon name={SOURCE_ICONS[e.source] ?? "Sparkles"} size={15} /></span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink text-sm font-bold">{e.title ?? e.sourceLabel}</span>
          <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[10px] font-bold">{e.sourceLabel}</span>
          {e.direction && <span className="text-muted text-[10px]">{e.direction === "inbound" ? "נכנס" : "יוצא"}</span>}
          {e.intent && <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[10px] font-bold">{e.intent}</span>}
          {e.sentiment && <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${SENT_TONE[e.sentiment] ?? "bg-surface text-muted"}`}>{SENTIMENT_LABELS[e.sentiment] ?? e.sentiment}</span>}
        </div>
        {e.body && <p className="text-muted mt-0.5 text-[13px]">{e.body}</p>}
      </div>
      <span className="text-muted shrink-0 text-[11px]">{new Date(e.occurred_at).toLocaleDateString("he-IL")}</span>
    </div>
  );
}

function ObjectionRow({ o, r, wrap }: { o: ObjectionItem; r: Runner; wrap: Wrap }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-ink font-bold">{o.label}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SEV_TONE[o.severity] ?? "bg-surface text-muted"}`}>{o.severity === "high" ? "גבוה" : o.severity === "medium" ? "בינוני" : "נמוך"}</span>
          </div>
          {o.detail && <p className="text-muted mt-0.5 text-[12px]">{o.detail}</p>}
        </div>
        <Button size="sm" variant="secondary" loading={r.busyId === `ro-${o.id}`} onClick={() => wrap(() => resolveObjectionAction(o.id, "manual"), `ro-${o.id}`)}><Icon name="UserCheck" size={14} />סמן כפתורה</Button>
      </div>
    </div>
  );
}

function CommitmentRow({ c, r, wrap }: { c: CommitmentItem; r: Runner; wrap: Wrap }) {
  return (
    <div className="bg-card border-line flex items-center justify-between gap-2 rounded-2xl border p-4 shadow-sm">
      <div><p className="text-ink text-sm font-bold">{c.commitment_text}</p>{c.due_date && <p className="text-muted text-[12px]">יעד: {new Date(c.due_date).toLocaleDateString("he-IL")}</p>}</div>
      <Button size="sm" variant="secondary" loading={r.busyId === `cf-${c.id}`} onClick={() => wrap(() => markCommitmentFulfilledAction(c.id), `cf-${c.id}`)}><Icon name="UserCheck" size={14} />בוצע</Button>
    </div>
  );
}

function RiskRow({ x }: { x: RiskItem }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2"><span className="text-ink font-bold">{x.label}</span><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${SEV_TONE[x.severity] ?? "bg-surface text-muted"}`}>{x.severity === "high" ? "גבוה" : x.severity === "medium" ? "בינוני" : "נמוך"}</span></div>
        <span className="text-danger text-lg font-black">{x.score}</span>
      </div>
      {x.reason && <p className="text-muted mt-1 text-[12px]">{x.reason}</p>}
      {x.recommended_action && <p className="text-brand-strong mt-0.5 text-[12px]">← {x.recommended_action}</p>}
    </div>
  );
}

function OppRow({ o, r, wrap }: { o: OppItem; r: Runner; wrap: Wrap }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="text-ink font-bold">{o.label}</span><span className="text-success text-lg font-black">{o.score}</span></div>
          {o.reason && <p className="text-muted mt-0.5 text-[12px]">{o.reason}</p>}
          {o.recommended_action && <p className="text-brand-strong mt-0.5 text-[12px]">← {o.recommended_action}</p>}
        </div>
        <Button size="sm" variant="ghost" loading={r.busyId === `oa-${o.id}`} onClick={() => wrap(() => markOpportunityActionedAction(o.id), `oa-${o.id}`)}><Icon name="UserCheck" size={14} />טופל</Button>
      </div>
    </div>
  );
}

function IngestForm({ r, wrap }: { r: Runner; wrap: Wrap }) {
  const [entityType, setEntityType] = useState("buyer");
  const [entityId, setEntityId] = useState("");
  const [source, setSource] = useState("whatsapp");
  const [direction, setDirection] = useState("inbound");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const valid = entityId.trim() && body.trim();
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
      <p className="text-ink font-bold">קליטת אינטראקציה — ZONO ינתח כוונה, סנטימנט, התנגדויות, ישויות וזיכרון</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">סוג ישות</span>
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="border-line bg-surface text-ink h-9 rounded-lg border px-2 text-sm">
            <option value="buyer">קונה</option><option value="seller">מוכר</option><option value="lead">ליד</option>
          </select></label>
        <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">מקור</span>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="border-line bg-surface text-ink h-9 rounded-lg border px-2 text-sm">
            {Object.entries(SOURCE_LABELS).filter(([k]) => !["system"].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></label>
        <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">כיוון</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value)} className="border-line bg-surface text-ink h-9 rounded-lg border px-2 text-sm">
            <option value="inbound">נכנס</option><option value="outbound">יוצא</option>
          </select></label>
        <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">מזהה ישות (UUID)</span>
          <input value={entityId} onChange={(e) => setEntityId(e.target.value)} placeholder="entity id" className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm" /></label>
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת (אופציונלי)" className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="תוכן ההודעה / תמלול..." rows={3} className="border-line bg-surface text-ink rounded-lg border px-3 py-2 text-sm" />
      <Button size="sm" className="w-fit" loading={r.busyId === "ingest"} disabled={!valid}
        onClick={() => { wrap(() => ingestCommunicationAction({ entityType, entityId, source, direction, title: title || undefined, body, isVoiceNote: source === "voice_note" }), "ingest", "מנתח..."); setTitle(""); setBody(""); }}>
        <Icon name="Plus" size={14} />קלוט ונתח
      </Button>
      <p className="text-muted text-[11px]">ניתוח דטרמיניסטי בלבד — ללא שליחה אוטומטית וללא שמירת אסימונים. מקורות אמיתיים (WhatsApp/אימייל/טלפוניה) מחוברים דרך ה-API הרשמי כאשר מוגדר.</p>
    </div>
  );
}
