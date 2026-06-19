"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EntityTimeline } from "@/components/activity/EntityTimeline";
import { RecommendedMatches, type RecoItemView } from "@/components/activity/RecommendedMatches";
import {
  churnLevel,
  churnTone,
  scoreTone,
  type ScoreTone,
} from "@/lib/seller-intelligence/scoring";
import { TOUCHPOINT_LABELS } from "@/lib/seller-intelligence/playbook";
import {
  createSellerCommitmentAction,
  initializeSellerIntelligenceAction,
  logSellerTouchpointAction,
  recalcSellerIntelligenceAction,
  resolveSellerRiskAction,
  sellerActionToTaskAction,
  setSellerCommitmentStatusAction,
} from "@/lib/seller-intelligence/actions";
import type { SellerCommandCenter as SellerCC } from "@/lib/seller-intelligence/service";

const TONE_TEXT: Record<ScoreTone, string> = {
  good: "text-success",
  medium: "text-brand-strong",
  risk: "text-danger",
};
const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-danger-soft text-danger",
  high: "bg-danger-soft text-danger",
  medium: "bg-warning-soft text-warning",
  low: "bg-surface text-muted",
};
const field = "bg-surface border-line text-ink focus:border-brand-light h-10 rounded-xl border px-3 text-sm outline-none transition";
const fmt = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");

function SectionCard({ title, icon, action, children }: { title: string; icon: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl">
            <Icon name={icon} size={16} />
          </span>
          <h3 className="text-ink text-sm font-extrabold">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ScoreTile({ label, value, tone }: { label: string; value: number; tone: ScoreTone }) {
  return (
    <div className="bg-surface flex flex-col gap-1 rounded-2xl p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-muted text-[11px] font-bold">{label}</span>
        <span className={cn("text-2xl font-black", TONE_TEXT[tone])}>{value}</span>
      </div>
      <span className="text-muted text-[10px]">מגמה: —</span>
    </div>
  );
}

const TP_TYPES = Object.keys(TOUCHPOINT_LABELS);

export function SellerCommandCenter({ sellerId, sellerName, data, interestedBuyers = [] }: { sellerId: string; sellerName: string; data: SellerCC | null; interestedBuyers?: RecoItemView[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [tpType, setTpType] = useState("phone_call");
  const [tpSentiment, setTpSentiment] = useState("");
  const [tpNote, setTpNote] = useState("");
  const [commitTitle, setCommitTitle] = useState("");
  const [commitDue, setCommitDue] = useState("");

  const run = (fn: () => Promise<{ error?: string }>, reset?: () => void) => {
    setError(null);
    start(async () => {
      const r = await fn();
      if (r?.error) setError(r.error);
      else reset?.();
    });
  };

  if (!data) {
    return (
      <div className="flex flex-col items-center gap-4 py-14 text-center">
        <span className="bg-brand-soft text-brand grid h-16 w-16 place-items-center rounded-3xl">
          <Icon name="UserCheck" size={30} />
        </span>
        <div>
          <h3 className="text-ink text-xl font-black">מרכז ניהול מוכר</h3>
          <p className="text-muted mx-auto mt-1 max-w-md text-sm">
            הפעל את ZONO Seller Intelligence כדי לבנות תאום דיגיטלי למוכר: ציוני אמון,
            מעורבות, סיכון נטישה, התחייבויות ופעולות מומלצות.
          </p>
        </div>
        <Button onClick={() => run(() => initializeSellerIntelligenceAction(sellerId))} disabled={pending} leadingIcon={<Icon name="Sparkles" size={18} />}>
          {pending ? "מפעיל…" : "הפעל מודיעין מוכר"}
        </Button>
        {error && <p className="text-danger text-sm font-semibold">{error}</p>}
      </div>
    );
  }

  const p = data.profile;
  const openRisks = data.risks.filter((r) => r.status === "open");

  const tiles: { label: string; value: number; tone: ScoreTone }[] = [
    { label: "בריאות מוכר", value: p.seller_health_score, tone: scoreTone(p.seller_health_score) },
    { label: "אמון מוכר", value: p.seller_trust_score, tone: scoreTone(p.seller_trust_score) },
    { label: "מעורבות מוכר", value: p.seller_engagement_score, tone: scoreTone(p.seller_engagement_score) },
    { label: "ביטחון מוכר", value: p.seller_confidence_score, tone: scoreTone(p.seller_confidence_score) },
    { label: "שביעות רצון", value: p.seller_satisfaction_score, tone: scoreTone(p.seller_satisfaction_score) },
    { label: "תגובתיות", value: p.seller_response_score, tone: scoreTone(p.seller_response_score) },
    { label: "מערכת יחסים", value: p.seller_relationship_score, tone: scoreTone(p.seller_relationship_score) },
    { label: "סיכון נטישה", value: p.seller_churn_risk_score, tone: churnTone(p.seller_churn_risk_score) },
  ];

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

      {/* 1) Mission header */}
      <div className="bg-brand-soft rounded-[22px] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-brand text-xs font-bold">{sellerName}</p>
            <h2 className="text-ink mt-1 text-xl font-black">מרכז ניהול מוכר</h2>
            <p className="text-muted mt-1 text-sm">{p.intelligence_summary ?? ""}</p>
            <p className="text-brand-strong mt-2 flex items-center gap-1.5 text-sm font-bold">
              <Icon name="ArrowUpRight" size={16} />
              פעולה מומלצת: {p.next_best_action ?? "—"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className={cn("text-3xl font-black", TONE_TEXT[churnTone(p.seller_churn_risk_score)])}>{p.seller_churn_risk_score}</p>
              <p className="text-muted text-[11px] font-semibold">סיכון נטישה · {churnLevel(p.seller_churn_risk_score)}</p>
            </div>
            <div className="text-center">
              <p className={cn("text-3xl font-black", TONE_TEXT[scoreTone(p.seller_trust_score)])}>{p.seller_trust_score}</p>
              <p className="text-muted text-[11px] font-semibold">אמון מוכר</p>
            </div>
            <Button variant="secondary" onClick={() => run(() => recalcSellerIntelligenceAction(sellerId))} disabled={pending} leadingIcon={<Icon name="TrendingUp" size={16} />}>
              חשב מחדש
            </Button>
          </div>
        </div>
      </div>

      {/* 2) Score grid */}
      <SectionCard title="ציוני מוכר" icon="BarChart3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map((t) => <ScoreTile key={t.label} {...t} />)}
        </div>
      </SectionCard>

      {/* Interested buyers (from Matching Intelligence) */}
      <RecommendedMatches title="קונים מתעניינים בנכסי המוכר" emptyText="אין התאמות עדיין — חשב התאמות במסך 'התאמות'." items={interestedBuyers} />


      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 11) Recommended actions */}
        <SectionCard title="פעולות מומלצות" icon="TrendingUp">
          <div className="flex flex-col gap-3">
            {data.actions.slice(0, 5).map((a) => (
              <div key={a.actionType} className="border-line rounded-2xl border p-3">
                <p className="text-ink text-sm font-bold">{a.title}</p>
                <div className="text-muted mt-1 flex flex-wrap gap-x-3 text-[11px]">
                  <span>אמון +{a.trustImpact}</span>
                  <span>מעורבות +{a.engagementImpact}</span>
                  <span>דחיפות {a.urgency}</span>
                  <span>ביטחון {a.confidence}</span>
                  <span>מאמץ {a.effort}</span>
                </div>
                <Button size="sm" className="mt-2" onClick={() => run(() => sellerActionToTaskAction(sellerId, a.title))} disabled={pending}>
                  צור משימה
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 10) Risks */}
        <SectionCard title="סיכונים פעילים" icon="AlertTriangle">
          <div className="flex flex-col gap-3">
            {openRisks.length === 0 && <p className="text-muted text-sm">אין סיכונים פעילים ✓</p>}
            {openRisks.map((r) => (
              <div key={r.id} className="border-line rounded-2xl border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-ink text-sm font-bold">{r.title}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", SEVERITY_TONE[r.severity] ?? SEVERITY_TONE.low)}>{r.severity}</span>
                </div>
                {r.recommended_action && <p className="text-brand-strong mt-1 text-xs font-semibold">המלצה: {r.recommended_action}</p>}
                <Button size="sm" variant="secondary" className="mt-2" onClick={() => run(() => resolveSellerRiskAction(sellerId, r.id))} disabled={pending}>טפל עכשיו</Button>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* 8) Touchpoints + logger */}
        <SectionCard title="נקודות מגע" icon="MessageCircle">
          <div className="bg-surface mb-3 flex flex-col gap-2 rounded-2xl p-3">
            <div className="flex flex-wrap gap-2">
              <select className={field} value={tpType} onChange={(e) => setTpType(e.target.value)}>
                {TP_TYPES.map((t) => <option key={t} value={t}>{TOUCHPOINT_LABELS[t]}</option>)}
              </select>
              <select className={field} value={tpSentiment} onChange={(e) => setTpSentiment(e.target.value)}>
                <option value="">סנטימנט</option>
                <option value="positive">חיובי</option>
                <option value="neutral">ניטרלי</option>
                <option value="negative">שלילי</option>
              </select>
              <Button size="sm" onClick={() => run(() => logSellerTouchpointAction(sellerId, tpType, tpSentiment || null, tpNote || null), () => { setTpNote(""); setTpSentiment(""); })} disabled={pending} leadingIcon={<Icon name="Plus" size={15} />}>
                תעד
              </Button>
            </div>
            <input className={cn(field, "w-full")} placeholder="הערה (אופציונלי)" value={tpNote} onChange={(e) => setTpNote(e.target.value)} />
          </div>
          {data.touchpoints.length === 0 ? (
            <p className="text-muted text-sm">אין נקודות מגע עדיין.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.touchpoints.slice(0, 6).map((t) => (
                <li key={t.id} className="border-line flex items-center justify-between border-b py-1.5 last:border-0 text-sm">
                  <span className="text-ink font-semibold">{t.title ?? t.touchpoint_type}</span>
                  <span className="text-muted text-[11px]">{fmt(t.occurred_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 9) Commitments */}
        <SectionCard title="התחייבויות" icon="Shield">
          <div className="bg-surface mb-3 flex flex-wrap gap-2 rounded-2xl p-3">
            <input className={cn(field, "min-w-[140px] flex-1")} placeholder="התחייבות (למשל: לשלוח דוח)" value={commitTitle} onChange={(e) => setCommitTitle(e.target.value)} />
            <input type="date" dir="ltr" className={field} value={commitDue} onChange={(e) => setCommitDue(e.target.value)} />
            <Button size="sm" disabled={pending || !commitTitle.trim()} onClick={() => run(() => createSellerCommitmentAction(sellerId, commitTitle, commitDue || null), () => { setCommitTitle(""); setCommitDue(""); })}>הוסף</Button>
          </div>
          {data.commitments.length === 0 ? (
            <p className="text-muted text-sm">אין התחייבויות.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.commitments.slice(0, 6).map((c) => (
                <li key={c.id} className="border-line flex items-center justify-between gap-2 border-b py-2 last:border-0">
                  <div className="min-w-0">
                    <p className={cn("text-sm font-semibold", c.status === "fulfilled" ? "text-muted line-through" : c.status === "broken" ? "text-danger" : "text-ink")}>{c.title}</p>
                    <p className="text-muted text-[11px]">{fmt(c.due_date)}</p>
                  </div>
                  {c.status === "open" && (
                    <span className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" onClick={() => run(() => setSellerCommitmentStatusAction(sellerId, c.id, "fulfilled"))} disabled={pending}>בוצע</Button>
                      <Button size="sm" variant="ghost" onClick={() => run(() => setSellerCommitmentStatusAction(sellerId, c.id, "broken"))} disabled={pending}>לא קוים</Button>
                    </span>
                  )}
                  {c.status !== "open" && <Badge tone={c.status === "fulfilled" ? "success" : "danger"} size="sm">{c.status === "fulfilled" ? "מולא" : "הופר"}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* 5) Missions */}
        <SectionCard title="משימות מומלצות" icon="Route">
          <div className="flex flex-col gap-3">
            {data.missions.length === 0 && <p className="text-muted text-sm">אין משימות.</p>}
            {data.missions.map((m) => {
              const target = Number(m.target_value ?? 0);
              const pct = target > 0 ? Math.min(100, Math.round((Number(m.current_value) / target) * 100)) : 0;
              return (
                <div key={m.id}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-ink font-semibold">{m.title}</span>
                    <span className="text-muted text-xs">{fmt(m.due_date)}</span>
                  </div>
                  <div className="bg-surface mt-1 h-2 w-full overflow-hidden rounded-full">
                    <div className="bg-brand h-full rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* 12) Active properties */}
        <SectionCard title="נכסים פעילים" icon="Building2">
          {data.properties.length === 0 ? (
            <p className="text-muted text-sm">אין נכסים מקושרים.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {data.properties.map((pr) => (
                <li key={pr.id} className="border-line flex items-center justify-between border-b py-1.5 last:border-0 text-sm">
                  <a href={`/properties/${pr.id}`} className="text-ink hover:text-brand font-semibold">{pr.title}</a>
                  <span className="text-muted text-[11px]">{pr.status}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* 7) Timeline */}
      <SectionCard title="ציר זמן מוכר" icon="Clock">
        <EntityTimeline items={data.timeline} title="" emptyStateText="אין פעילות מתועדת עדיין." />
      </SectionCard>

      {/* 14) AI insights placeholder */}
      <SectionCard title="תובנות ZONO" icon="Sparkles">
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-ink"><span className="text-muted">סיכום: </span>{p.ai_summary ?? "—"}</p>
          <p className="text-ink"><span className="text-muted">סיכונים: </span>{p.ai_risk_summary ?? "—"}</p>
          <p className="text-ink"><span className="text-muted">הזדמנות: </span>{p.ai_opportunity_summary ?? "—"}</p>
          <p className="text-muted text-[11px]">ניתוח עומק מבוסס-AI יתווסף בשלב הבא.</p>
        </div>
      </SectionCard>
    </div>
  );
}
