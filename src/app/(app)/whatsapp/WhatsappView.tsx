"use client";

import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import {
  connectWhatsappAction, recordInboundAction, createDraftAction, approveDraftAction, rejectDraftAction,
  markDraftSentAction, recordMissedCallAction, createCampaignAction, createSmartLinkAction, computeDailyMissionsAction,
} from "@/lib/whatsapp/actions";
import { STATE_LABELS, STATE_TONE, INTENT_LABELS, INTENT_TONE, CAMPAIGN_GOALS } from "@/lib/whatsapp/engine";
import { WhatsappIntelligencePanel } from "./WhatsappIntelligencePanel";
import type { WhatsappCommandCenter, ConversationSummary, DraftSummary } from "@/lib/whatsapp/service";

type Tab = "inbox" | "approvals" | "missed" | "followups" | "campaigns" | "smartlinks" | "segments" | "missions" | "settings";
const CONN_LABEL: Record<string, string> = { not_configured: "לא מוגדר", sandbox: "ארגז חול", connected: "מחובר", expired: "פג תוקף", missing_permissions: "חסרות הרשאות" };

export function WhatsappView({ cc }: { cc: WhatsappCommandCenter }) {
  const [tab, setTab] = useState<Tab>("inbox");
  const r = useActionRunner();
  const wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) =>
    r.run(async () => { const res = await fn(); if (res.error) throw new Error(res.error); return res; }, { id, pendingMessage: pending, success: (x) => x.message ?? null });

  const tabs: { id: Tab; label: string; icon: string; n?: number }[] = [
    { id: "inbox", label: "תיבת דואר", icon: "MessageCircle", n: cc.kpis.openConversations },
    { id: "approvals", label: "אישורים", icon: "Shield", n: cc.kpis.pendingApprovals },
    { id: "missed", label: "שיחות שלא נענו", icon: "Bell", n: cc.kpis.missedCalls },
    { id: "followups", label: "מעקבים", icon: "Clock", n: cc.kpis.followupsDue },
    { id: "campaigns", label: "קמפיינים", icon: "Megaphone" },
    { id: "smartlinks", label: "קישורים חכמים", icon: "Route" },
    { id: "segments", label: "סגמנטים", icon: "Users" },
    { id: "missions", label: "משימות יומיות", icon: "Flame" },
    { id: "settings", label: "הגדרות", icon: "Settings" },
  ];

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="bg-brand text-white grid h-9 w-9 place-items-center rounded-xl"><Icon name="MessageCircle" size={18} /></span>
            <h1 className="text-ink text-2xl font-black">WhatsApp OS</h1>
            <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[11px] font-bold">{CONN_LABEL[cc.connectionStatus] ?? cc.connectionStatus}</span>
          </div>
          <p className="text-muted text-sm">מערכת WhatsApp AI לסוכני נדל״ן — תיבה מאוחדת, הסמכה, שחזור שיחות, מעקבים, קמפיינים ואישורים. ללא שליחה אוטומטית, ללא שמירת אסימונים. כל הודעה: טיוטה ← אישור ← שליחה ידנית.</p>
        </div>
        <Button size="sm" variant="ghost" loading={r.busyId === "missions"} onClick={() => wrap(() => computeDailyMissionsAction(), "missions", "מחשב משימות...")}>
          <Icon name="Flame" size={14} />רענן משימות
        </Button>
      </header>

      <WhatsappIntelligencePanel />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="דורש מענה" value={cc.kpis.needsReply} tone="text-warning" />
        <Kpi label="לידים חמים" value={cc.kpis.hotLeads} tone="text-success" />
        <Kpi label="שיחות שלא נענו" value={cc.kpis.missedCalls} tone="text-danger" />
        <Kpi label="ממתין לאישור" value={cc.kpis.pendingApprovals} tone="text-danger" />
        <Kpi label="מעקבים להיום" value={cc.kpis.followupsDue} tone="text-warning" />
        <Kpi label="שיחות פתוחות" value={cc.kpis.openConversations} tone="text-ink" />
      </div>

      {cc.connectionStatus === "not_configured" && (
        <div className="bg-warning-soft text-warning flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold">
          <span className="flex items-center gap-1.5"><Icon name="Shield" size={15} />WhatsApp לא מוגדר — מצב ידני בלבד. ללא שמירת סיסמה/אסימון.</span>
          <Button size="sm" loading={r.busyId === "connect"} onClick={() => wrap(() => connectWhatsappAction(), "connect", "מחבר...")}>חבר (ארגז חול)</Button>
        </div>
      )}

      <ActionFeedback runner={r} />

      <nav className="border-line flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-bold ${tab === t.id ? "text-brand-strong border-brand border-b-2" : "text-muted"}`}>
            <Icon name={t.icon} size={15} />{t.label}{t.n ? <span className="bg-surface text-muted rounded-full px-1.5 text-[10px]">{t.n}</span> : null}
          </button>
        ))}
      </nav>

      {tab === "inbox" && <Inbox cc={cc} r={r} wrap={wrap} />}
      {tab === "approvals" && <Approvals list={cc.pendingApprovals} r={r} wrap={wrap} />}
      {tab === "missed" && <Missed cc={cc} r={r} wrap={wrap} />}
      {tab === "followups" && (cc.followupsDue.length === 0 ? <Empty text="אין מעקבים להיום" /> : <div className="flex flex-col gap-2">{cc.followupsDue.map((f) => <Row key={f.id} title={f.body ?? "מעקב"} sub={f.due_at ? new Date(f.due_at).toLocaleDateString("he-IL") : ""} badge={f.status} />)}</div>)}
      {tab === "campaigns" && <Campaigns cc={cc} r={r} wrap={wrap} />}
      {tab === "smartlinks" && <SmartLinks cc={cc} r={r} wrap={wrap} />}
      {tab === "segments" && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{cc.segments.map((s) => <div key={s.key} className="bg-card border-line rounded-xl border p-3 text-sm font-bold shadow-sm">{s.label}</div>)}</div>}
      {tab === "missions" && (cc.missions.length === 0 ? <Empty text="אין משימות — לחץ ׳רענן משימות׳" /> : <div className="flex flex-col gap-2">{cc.missions.map((m) => <div key={m.id} className="bg-card border-line rounded-2xl border p-4 shadow-sm"><p className="text-ink font-bold">{m.title}</p>{m.reason && <p className="text-muted text-[12px]">{m.reason}</p>}{m.recommended_action && <p className="text-brand-strong text-[12px]">← {m.recommended_action}</p>}</div>)}</div>)}
      {tab === "settings" && <Settings cc={cc} />}
    </main>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="bg-card border-line flex flex-col gap-0.5 rounded-2xl border p-3 shadow-sm"><span className="text-muted text-[11px] font-bold">{label}</span><span className={`text-xl font-black ${tone}`}>{value}</span></div>;
}
type Runner = ReturnType<typeof useActionRunner>;
type Wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) => void;
function Empty({ text }: { text: string }) { return <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">{text}</div>; }
function Row({ title, sub, badge }: { title: string; sub?: string; badge?: string }) {
  return <div className="bg-card border-line flex items-center justify-between gap-2 rounded-2xl border p-4 shadow-sm"><div><p className="text-ink text-sm font-bold">{title}</p>{sub && <p className="text-muted text-[12px]">{sub}</p>}</div>{badge && <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[11px] font-bold">{badge}</span>}</div>;
}

function Inbox({ cc, r, wrap }: { cc: WhatsappCommandCenter; r: Runner; wrap: Wrap }) {
  const [text, setText] = useState(""); const [name, setName] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card border-line flex flex-col gap-2 rounded-2xl border p-4 shadow-sm">
        <p className="text-ink font-bold">הזנת הודעה נכנסת (זיהוי כוונה + הסמכה אוטומטית)</p>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הלקוח (אופציונלי)" className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm" />
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="תוכן ההודעה..." rows={2} className="border-line bg-surface text-ink rounded-lg border px-3 py-2 text-sm" />
        <Button size="sm" className="w-fit" loading={r.busyId === "rin"} disabled={!text.trim()} onClick={() => { wrap(() => recordInboundAction({ text, contactName: name || undefined }), "rin", "מנתח..."); setText(""); setName(""); }}>
          <Icon name="Plus" size={14} />רשום ונתח
        </Button>
      </div>
      {cc.conversations.length === 0 ? <Empty text="אין שיחות פתוחות" /> : cc.conversations.map((c) => <ConvCard key={c.id} c={c} r={r} wrap={wrap} />)}
    </div>
  );
}
function ConvCard({ c, r, wrap }: { c: ConversationSummary; r: Runner; wrap: Wrap }) {
  const [reply, setReply] = useState(""); const [open, setOpen] = useState(false);
  return (
    <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-ink font-black">{c.name ?? "לקוח"}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATE_TONE[c.state] ?? "bg-surface text-muted"}`}>{STATE_LABELS[c.state] ?? c.state}</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${INTENT_TONE[c.intent] ?? "bg-surface text-muted"}`}>{INTENT_LABELS[c.intent] ?? c.intent}</span>
          </div>
          {c.last_message && <p className="text-muted mt-0.5 text-[13px]">{c.last_message}</p>}
          {c.next_best_action && <p className="text-brand-strong mt-0.5 text-[12px]">← {c.next_best_action}</p>}
        </div>
        <div className="text-center"><span className="text-brand-strong text-lg font-black">{c.lead_score}</span><span className="text-muted block text-[10px]">ליד</span></div>
      </div>
      <button onClick={() => setOpen(!open)} className="text-brand-strong mt-2 text-[12px] font-bold">{open ? "סגור" : "טיוטת תשובה"}</button>
      {open && (
        <div className="mt-2 flex gap-2">
          <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder="תוכן התשובה (תוכן רגיש → אישור)" className="border-line bg-surface text-ink h-9 flex-1 rounded-lg border px-3 text-sm" />
          <Button size="sm" loading={r.busyId === `d-${c.id}`} disabled={!reply.trim()} onClick={() => { wrap(() => createDraftAction({ conversationId: c.id, body: reply }), `d-${c.id}`, "מסווג סיכון..."); setReply(""); }}>
            <Icon name="Send" size={14} />צור טיוטה
          </Button>
        </div>
      )}
    </div>
  );
}

function Approvals({ list, r, wrap }: { list: DraftSummary[]; r: Runner; wrap: Wrap }) {
  if (list.length === 0) return <Empty text="אין הודעות הממתינות לאישור" />;
  return (
    <div className="flex flex-col gap-2">
      {list.map((d) => (
        <div key={d.id} className="bg-card border-line rounded-2xl border p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-ink text-[13px]">{d.body}</p>
            <span className="bg-danger-soft text-danger shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold">{d.risk_level === "sensitive" ? "רגיש" : d.risk_level}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" loading={r.busyId === `ap-${d.id}`} onClick={() => wrap(() => approveDraftAction(d.id), `ap-${d.id}`)}><Icon name="UserCheck" size={14} />אשר</Button>
            <Button size="sm" variant="secondary" loading={r.busyId === `ms-${d.id}`} onClick={() => wrap(() => markDraftSentAction(d.id), `ms-${d.id}`)}><Icon name="Send" size={14} />סמן כנשלח</Button>
            <Button size="sm" variant="ghost" loading={r.busyId === `rj-${d.id}`} onClick={() => wrap(() => rejectDraftAction(d.id), `rj-${d.id}`)}><Icon name="Minus" size={14} />דחה</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Missed({ cc, r, wrap }: { cc: WhatsappCommandCenter; r: Runner; wrap: Wrap }) {
  const [name, setName] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card border-line flex items-end gap-2 rounded-2xl border p-4 shadow-sm">
        <label className="flex flex-1 flex-col gap-1"><span className="text-muted text-[11px] font-bold">רישום שיחה שלא נענתה (יוצר טיוטת שחזור)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הלקוח" className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm" /></label>
        <Button size="sm" loading={r.busyId === "mc"} onClick={() => { wrap(() => recordMissedCallAction(name || undefined), "mc", "רושם..."); setName(""); }}><Icon name="Plus" size={14} />רשום</Button>
      </div>
      {cc.missedCalls.length === 0 ? <Empty text="אין שיחות שלא נענו" /> : cc.missedCalls.map((m) => <Row key={m.id} title={m.name ?? "לקוח"} sub={new Date(m.occurred_at).toLocaleString("he-IL")} badge={m.recovery_status} />)}
    </div>
  );
}

function Campaigns({ cc, r, wrap }: { cc: WhatsappCommandCenter; r: Runner; wrap: Wrap }) {
  const [name, setName] = useState(""); const [goal, setGoal] = useState("sell_property");
  return (
    <div className="flex flex-col gap-3">
      {cc.isManager && (
        <div className="bg-card border-line flex flex-wrap items-end gap-2 rounded-2xl border p-4 shadow-sm">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם קמפיין" className="border-line bg-surface text-ink h-9 flex-1 rounded-lg border px-3 text-sm" />
          <select value={goal} onChange={(e) => setGoal(e.target.value)} className="border-line bg-surface text-ink h-9 rounded-lg border px-2 text-sm">{CAMPAIGN_GOALS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}</select>
          <Button size="sm" loading={r.busyId === "cc"} disabled={!name.trim()} onClick={() => { wrap(() => createCampaignAction({ name, goal }), "cc", "יוצר..."); setName(""); }}><Icon name="Plus" size={14} />צור קמפיין</Button>
        </div>
      )}
      <div className="bg-brand-soft/30 text-brand-strong rounded-xl px-3 py-2 text-[12px] font-semibold">שליחה מבוקרת בלבד — ללא שליחה המונית לא בטוחה. שימוש בתבניות WhatsApp רשמיות כשה-API מוגדר, אחרת תור שליחה ידני.</div>
      {cc.campaigns.length === 0 ? <Empty text="אין קמפיינים" /> : cc.campaigns.map((c) => <Row key={c.id} title={c.name} sub={`${CAMPAIGN_GOALS.find((g) => g.key === c.goal)?.label ?? c.goal} · קהל ${c.audience_size} · נשלחו ${c.sent_count} · תגובות ${c.replied_count}`} badge={c.status} />)}
    </div>
  );
}

function SmartLinks({ cc, r, wrap }: { cc: WhatsappCommandCenter; r: Runner; wrap: Wrap }) {
  const [type, setType] = useState("property"); const [title, setTitle] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card border-line flex flex-wrap items-end gap-2 rounded-2xl border p-4 shadow-sm">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת הקישור" className="border-line bg-surface text-ink h-9 flex-1 rounded-lg border px-3 text-sm" />
        <select value={type} onChange={(e) => setType(e.target.value)} className="border-line bg-surface text-ink h-9 rounded-lg border px-2 text-sm">
          {["property", "project", "campaign", "buyer", "seller", "valuation", "portal", "recommendation"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <Button size="sm" loading={r.busyId === "sl"} onClick={() => { wrap(() => createSmartLinkAction({ linkType: type, title: title || undefined }), "sl", "יוצר..."); setTitle(""); }}><Icon name="Plus" size={14} />צור קישור</Button>
      </div>
      {cc.smartLinks.length === 0 ? <Empty text="אין קישורים חכמים" /> : cc.smartLinks.map((l) => <Row key={l.id} title={`/w/${l.slug}`} sub={`${l.link_type} · ${l.click_count} קליקים · ${l.conversion_count} המרות`} />)}
    </div>
  );
}

function Settings({ cc }: { cc: WhatsappCommandCenter }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
        <p className="text-ink font-black">מצב חיבור וספק</p>
        <p className="text-muted mt-1 text-[13px]">סטטוס: <b>{CONN_LABEL[cc.connectionStatus] ?? cc.connectionStatus}</b> · אישור נדרש: {cc.approvalRequired ? "כן" : "לא"} · מענה אוטומטי: {cc.autoReplyAllowed ? "מותר" : "חסום"}</p>
      </div>
      <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
        <p className="text-ink font-black">כללי בטיחות ותאימות</p>
        <ul className="text-muted mt-1 flex flex-col gap-1 text-[13px]">
          <li>• ללא שמירת סיסמאות/אסימונים · רק WhatsApp Business / Meta API רשמי</li>
          <li>• כל הודעה יוצאת: טיוטה ← אישור ← שליחה ידנית (שליחה אוטומטית רק כש-API מוגדר ומורשה)</li>
          <li>• תוכן רגיש (מחיר/משפטי/מו״מ/עמלה/מימון/זמינות/חוזה) דורש אישור מנהל</li>
          <li>• מצב לא מוגדר → ידני בלבד (graceful degrade) · תמיכה ב-opt-out ותקרות תדירות</li>
        </ul>
      </div>
    </div>
  );
}
