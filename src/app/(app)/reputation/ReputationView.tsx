"use client";

import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { recomputeReputationAction } from "@/lib/reputation/actions";
import { LEVEL_LABELS, LEVEL_TONE, SCOPE_LABELS } from "@/lib/reputation/engine";
import type { ReputationCommandCenter, AdvocateSummary, GeoReputation, AgentRanking, RepOpportunity } from "@/lib/reputation/service";

type Tab = "overview" | "advocates" | "referrers" | "geo" | "agents" | "opportunities";
const ils = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;

export function ReputationView({ cc }: { cc: ReputationCommandCenter }) {
  const [tab, setTab] = useState<Tab>("overview");
  const r = useActionRunner();
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "overview", label: "סקירה", icon: "Flame" },
    { id: "advocates", label: "תומכים", icon: "Handshake" },
    { id: "referrers", label: "מפנים מובילים", icon: "Send" },
    { id: "geo", label: "מוניטין אזורי", icon: "Map" },
    { id: "agents", label: "דירוג סוכנים", icon: "Users" },
    { id: "opportunities", label: "הזדמנויות", icon: "Sparkles" },
  ];

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <header className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Handshake" size={18} /></span>
            <h1 className="text-ink text-2xl font-black">מוניטין, ביקורות והפניות</h1>
          </div>
          <p className="text-muted text-sm">מי ממליץ עלינו, מי מפנה למי, אילו אזורים סומכים עלינו, ואיזה לקוחות מייצרים הכי הרבה עסקים. בקשות ביקורת/הפניה — טיוטות בלבד.</p>
        </div>
        {cc.isManager && (
          <Button size="sm" variant="ghost" loading={r.busyId === "recompute"}
            onClick={() => r.run(async () => { const res = await recomputeReputationAction(); if (res.error) throw new Error(res.error); return res; }, { id: "recompute", pendingMessage: "מחשב מוניטין...", success: (x) => x.message ?? null })}>
            <Icon name="TrendingUp" size={14} />חשב מוניטין מחדש
          </Button>
        )}
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="ביקורות" value={`${cc.reviewCount}`} sub={cc.avgRating ? `דירוג ${cc.avgRating}★` : ""} icon="Sparkles" tone="text-success" />
        <Stat label="הפניות" value={`${cc.referralCount}`} sub={`${cc.convertedReferrals} הומרו`} icon="Send" tone="text-brand-strong" />
        <Stat label="שגרירים" value={`${cc.ambassadors}`} sub="לקוחות מובילים" icon="Handshake" tone="text-success" />
        <Stat label="הכנסה מהפניות" value={ils(cc.referralRevenue)} sub="" icon="TrendingUp" tone="text-brand-strong" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Mini label="הזדמנויות ביקורת" value={cc.reviewOpportunities} tone="text-warning" />
        <Mini label="הזדמנויות הפניה" value={cc.referralOpportunities} tone="text-warning" />
        <Mini label="ביקורות שפורסמו" value={cc.publishedReviews} tone="text-success" />
        <Mini label="אזורי מוניטין" value={cc.geoInfluence.length} tone="text-ink" />
      </div>

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
      {tab === "advocates" && <AdvocateList list={cc.topAdvocates} />}
      {tab === "referrers" && <AdvocateList list={cc.topReferrers} referrer />}
      {tab === "geo" && <GeoList list={cc.geoInfluence} />}
      {tab === "agents" && <AgentList list={cc.agentRankings} />}
      {tab === "opportunities" && <OppList list={cc.opportunities} />}
    </main>
  );
}

function Stat({ label, value, sub, icon, tone }: { label: string; value: string; sub: string; icon: string; tone: string }) {
  return (
    <div className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-4 shadow-sm">
      <span className={`flex items-center gap-1.5 text-[12px] font-bold ${tone}`}><Icon name={icon} size={14} />{label}</span>
      <span className="text-ink text-2xl font-black">{value}</span>
      {sub && <span className="text-muted text-[11px]">{sub}</span>}
    </div>
  );
}
function Mini({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="bg-card border-line flex flex-col gap-0.5 rounded-xl border p-3 shadow-sm"><span className="text-muted text-[11px] font-bold">{label}</span><span className={`text-xl font-black ${tone}`}>{value}</span></div>;
}

function Overview({ cc }: { cc: ReputationCommandCenter }) {
  return (
    <div className="flex flex-col gap-4">
      <Section title="תומכים לפי רמה" icon="Handshake">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {cc.advocateCounts.map((a) => (
            <div key={a.level} className="bg-card border-line flex flex-col gap-0.5 rounded-xl border p-3 text-center shadow-sm">
              <span className={`mx-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${LEVEL_TONE[a.level] ?? "bg-surface text-muted"}`}>{LEVEL_LABELS[a.level] ?? a.level}</span>
              <span className="text-ink text-xl font-black">{a.count}</span>
            </div>
          ))}
        </div>
      </Section>
      {cc.topAdvocates.length > 0 && <Section title="תומכים מובילים" icon="Handshake"><AdvocateList list={cc.topAdvocates.slice(0, 5)} /></Section>}
      {cc.opportunities.length > 0 && <Section title="הזדמנויות מובילות" icon="Sparkles"><OppList list={cc.opportunities.slice(0, 5)} /></Section>}
    </div>
  );
}

function AdvocateList({ list, referrer }: { list: AdvocateSummary[]; referrer?: boolean }) {
  if (list.length === 0) return <Empty text="אין נתונים — הרץ ׳חשב מוניטין מחדש׳" />;
  return (
    <div className="flex flex-col gap-2">
      {list.map((a) => (
        <div key={a.client_id} className="bg-card border-line flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-ink font-black">{a.name}</p>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${LEVEL_TONE[a.level] ?? "bg-surface text-muted"}`}>{LEVEL_LABELS[a.level] ?? a.level}</span>
            </div>
            <p className="text-muted mt-0.5 text-[12px]">עסקאות {a.deals} · ביקורות {a.reviews} · הפניות {a.referrals}{a.referral_revenue ? ` · ${ils(a.referral_revenue)} מהפניות` : ""}</p>
          </div>
          <span className="text-brand-strong text-lg font-black">{referrer ? a.referrals : a.score}</span>
        </div>
      ))}
    </div>
  );
}

function GeoList({ list }: { list: GeoReputation[] }) {
  if (list.length === 0) return <Empty text="אין מוניטין אזורי עדיין" />;
  return (
    <div className="flex flex-col gap-2">
      {list.map((g, i) => (
        <div key={i} className="bg-card border-line flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm">
          <div>
            <p className="text-ink font-black">{g.label ?? g.scope_key} <span className="text-muted text-[11px] font-bold">· {SCOPE_LABELS[g.scope] ?? g.scope}</span></p>
            <p className="text-muted mt-0.5 text-[12px]">ביקורות {g.reviews} · הפניות {g.referrals} · השפעה {g.influence}</p>
          </div>
          <div className="text-center"><span className="text-success text-lg font-black">{g.trust}</span><span className="text-muted block text-[10px]">אמון</span></div>
        </div>
      ))}
    </div>
  );
}

function AgentList({ list }: { list: AgentRanking[] }) {
  if (list.length === 0) return <Empty text="אין דירוג סוכנים עדיין" />;
  return (
    <div className="flex flex-col gap-2">
      {list.map((a, i) => (
        <div key={a.agent_id} className="bg-card border-line flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="bg-brand-soft text-brand-strong grid h-7 w-7 place-items-center rounded-full text-[12px] font-black">{i + 1}</span>
            <div><p className="text-ink font-black">{a.name}</p><p className="text-muted text-[12px]">ביקורות {a.reviews} · הפניות {a.referrals}{a.referral_revenue ? ` · ${ils(a.referral_revenue)}` : ""}</p></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function OppList({ list }: { list: RepOpportunity[] }) {
  if (list.length === 0) return <Empty text="אין הזדמנויות פתוחות" />;
  return (
    <div className="flex flex-col gap-2">
      {list.map((o) => (
        <div key={o.id} className="bg-card border-line rounded-2xl border p-4 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <p className="text-ink font-bold">{o.title}</p>
            <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">{o.score}</span>
          </div>
          {o.reason && <p className="text-muted mt-0.5 text-[12px]">{o.reason}</p>}
          {o.recommended_action && <p className="text-brand-strong mt-1 text-[12px]">← {o.recommended_action}</p>}
        </div>
      ))}
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return <section className="flex flex-col gap-2"><h2 className="text-ink flex items-center gap-2 text-lg font-black"><Icon name={icon} size={17} />{title}</h2>{children}</section>;
}
function Empty({ text }: { text: string }) { return <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">{text}</div>; }
