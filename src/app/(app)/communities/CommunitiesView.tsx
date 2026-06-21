"use client";

import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { recordCommentAction, markCommentConvertedAction, connectSocialAccountAction } from "@/lib/community/actions";
import { INTENT_LABELS, INTENT_TONE, isHotIntent, CATEGORY_LABELS, classifyCommunity } from "@/lib/community/engine";
import type { CommunityCommandCenter, CommunitySummary, CommentSummary } from "@/lib/community/service";

type Tab = "overview" | "communities" | "performance" | "attribution" | "comments" | "messenger";

export function CommunitiesView({ cc }: { cc: CommunityCommandCenter }) {
  const [tab, setTab] = useState<Tab>("overview");
  const r = useActionRunner();
  const fbAccount = cc.socialAccounts.find((a) => a.provider === "facebook") ?? null;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "overview", label: "סקירה", icon: "Flame" },
    { id: "communities", label: "קהילות מאושרות", icon: "Users" },
    { id: "performance", label: "ביצועים", icon: "TrendingUp" },
    { id: "attribution", label: "ייחוס", icon: "Route" },
    { id: "comments", label: "תגובות", icon: "MessageCircle" },
    { id: "messenger", label: "מסנג׳ר", icon: "Send" },
  ];
  const wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) =>
    r.run(async () => { const res = await fn(); if (res.error) throw new Error(res.error); return res; }, { id, pendingMessage: pending, success: (x) => x.message ?? null });

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Users" size={18} /></span>
            <h1 className="text-ink text-2xl font-black">קהילות פייסבוק</h1>
          </div>
          <p className="text-muted text-sm">גילוי, אישור, פרסום, ניטור ותגמול קהילות — בתאימות מלאה: ללא סקרייפינג, ללא שמירת סיסמאות, רק חיבור רשמי או הזנה ידנית.</p>
        </div>
        <Button size="sm" variant={fbAccount ? "ghost" : "primary"} loading={r.busyId === "connect"}
          onClick={() => wrap(() => connectSocialAccountAction("facebook"), "connect", "מחבר...")}>
          <Icon name="Send" size={14} />{fbAccount ? `פייסבוק: ${fbAccount.connection_status}` : "חבר פייסבוק"}
        </Button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="קהילות" value={cc.totalCommunities} icon="Users" tone="text-ink" />
        <Stat label="לידים מיוחסים" value={cc.leadsAttributed} icon="Send" tone="text-success" />
        <Stat label="עסקאות מיוחסות" value={cc.dealsAttributed} icon="Handshake" tone="text-brand-strong" />
        <Stat label="תגובות חמות" value={cc.hotComments} icon="Flame" tone="text-warning" />
      </div>
      {!fbAccount && (
        <div className="bg-warning-soft text-warning flex items-start gap-2 rounded-xl px-3 py-2 text-[12px] font-semibold">
          <Icon name="Shield" size={15} /><span>אין חיבור Meta API פעיל — המערכת פועלת במצב ידני (graceful degrade). חבר חשבון רשמי או הזן תגובות/שיחות ידנית. לעולם לא נשמרים אסימונים או סיסמאות.</span>
        </div>
      )}

      <ActionFeedback runner={r} />

      <nav className="border-line flex gap-1 overflow-x-auto border-b">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-bold ${tab === t.id ? "text-brand-strong border-brand border-b-2" : "text-muted"}`}>
            <Icon name={t.icon} size={15} />{t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <Overview cc={cc} />}
      {(tab === "communities" || tab === "performance" || tab === "attribution") && <CommunityList list={cc.communities} mode={tab} />}
      {tab === "comments" && <Comments cc={cc} r={r} wrap={wrap} />}
      {tab === "messenger" && <MessengerList cc={cc} />}
    </main>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon: string; tone: string }) {
  return (
    <div className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-4 shadow-sm">
      <span className={`flex items-center gap-1.5 text-[12px] font-bold ${tone}`}><Icon name={icon} size={14} />{label}</span>
      <span className="text-ink text-2xl font-black">{value}</span>
    </div>
  );
}
type Runner = ReturnType<typeof useActionRunner>;
type Wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) => void;

function Overview({ cc }: { cc: CommunityCommandCenter }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {cc.topRoi && <Card title="קהילה מובילה (ROI)" c={cc.topRoi} tone="text-success" />}
        {cc.lowRoi && cc.lowRoi.id !== cc.topRoi?.id && <Card title="קהילה חלשה (לבחינה)" c={cc.lowRoi} tone="text-danger" />}
      </div>
      {cc.communities.length === 0 && <Empty text="עדיין אין קהילות — גלה וחבר קהילות מהמודול הקיים, או הזן ידנית" />}
    </div>
  );
}
function Card({ title, c, tone }: { title: string; c: CommunitySummary; tone: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
      <p className="text-muted text-[12px] font-bold">{title}</p>
      <p className="text-ink mt-0.5 font-black">{c.name}</p>
      <p className="text-muted text-[12px]">{c.city ?? ""} · {CATEGORY_LABELS[classifyCommunity(c.name)]} · {c.members.toLocaleString("he-IL")} חברים</p>
      <p className={`mt-1 text-sm font-black ${tone}`}>ROI {c.roi_score} · לידים {c.leads_attributed} · עסקאות {c.deals_attributed}</p>
    </div>
  );
}

function CommunityList({ list, mode }: { list: CommunitySummary[]; mode: "communities" | "performance" | "attribution" }) {
  if (list.length === 0) return <Empty text="אין קהילות להצגה" />;
  return (
    <div className="flex flex-col gap-2">
      {list.map((c) => (
        <div key={c.id} className="bg-card border-line flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-ink font-black">{c.name}</p>
              <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[11px] font-bold">{CATEGORY_LABELS[classifyCommunity(c.name)]}</span>
              {c.platform && <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[11px] font-bold">{c.platform}</span>}
            </div>
            <p className="text-muted mt-0.5 text-[12px]">
              {mode === "attribution" ? `לידים ${c.leads_attributed} · עסקאות ${c.deals_attributed}`
                : mode === "performance" ? `ROI ${c.roi_score} · ליד ${c.lead_score} · עסקה ${c.deal_score} · אמון ${c.trust_score}`
                : `${c.city ?? ""} · ${c.members.toLocaleString("he-IL")} חברים · ${c.status}`}
            </p>
          </div>
          <span className="text-brand-strong text-lg font-black">{mode === "attribution" ? c.leads_attributed : c.roi_score}</span>
        </div>
      ))}
    </div>
  );
}

function Comments({ cc, r, wrap }: { cc: CommunityCommandCenter; r: Runner; wrap: Wrap }) {
  const [text, setText] = useState(""); const [author, setAuthor] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-card border-line flex flex-col gap-2 rounded-2xl border p-4 shadow-sm">
        <p className="text-ink font-bold">הזנת תגובה ידנית (זיהוי כוונה אוטומטי)</p>
        <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="שם המגיב (אופציונלי)" className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm" />
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="תוכן התגובה..." rows={2} className="border-line bg-surface text-ink rounded-lg border px-3 py-2 text-sm" />
        <Button size="sm" className="w-fit" loading={r.busyId === "rc"} disabled={!text.trim()}
          onClick={() => { wrap(() => recordCommentAction({ text, author: author || undefined }), "rc", "מזהה כוונה..."); setText(""); setAuthor(""); }}>
          <Icon name="Plus" size={14} />רשום ונתח
        </Button>
      </div>
      {cc.comments.length === 0 ? <Empty text="אין תגובות עדיין" /> : cc.comments.map((c) => <CommentCard key={c.id} c={c} r={r} wrap={wrap} />)}
    </div>
  );
}
function CommentCard({ c, r, wrap }: { c: CommentSummary; r: Runner; wrap: Wrap }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink text-sm font-bold">{c.author ?? "מגיב"}</p>
          {c.text && <p className="text-muted mt-0.5 text-[13px]">{c.text}</p>}
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${INTENT_TONE[c.intent] ?? "bg-surface text-muted"}`}>{INTENT_LABELS[c.intent] ?? c.intent}</span>
      </div>
      {isHotIntent(c.intent) && !c.lead_created && (
        <Button size="sm" variant="secondary" className="mt-2" loading={r.busyId === `cv-${c.id}`}
          onClick={() => wrap(() => markCommentConvertedAction(c.id), `cv-${c.id}`)}>
          <Icon name="Check" size={14} />סמן כליד
        </Button>
      )}
      {c.lead_created && <span className="bg-success-soft text-success mt-2 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold">הומר לליד</span>}
    </div>
  );
}

function MessengerList({ cc }: { cc: CommunityCommandCenter }) {
  if (cc.messenger.length === 0) return <Empty text="אין שיחות מסנג׳ר — ארכיטקטורה מוכנה לאינטגרציית Meta API עתידית" />;
  return (
    <div className="flex flex-col gap-2">
      {cc.messenger.map((m) => (
        <div key={m.id} className="bg-card border-line rounded-2xl border p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div><p className="text-ink text-sm font-bold">{m.contact ?? "איש קשר"}</p>{m.last_message && <p className="text-muted mt-0.5 text-[13px]">{m.last_message}</p>}</div>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${INTENT_TONE[m.intent] ?? "bg-surface text-muted"}`}>{INTENT_LABELS[m.intent] ?? m.intent}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
function Empty({ text }: { text: string }) { return <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">{text}</div>; }
