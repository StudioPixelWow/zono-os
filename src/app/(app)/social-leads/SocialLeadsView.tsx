"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { convertSocialLeadAction, generateSocialFollowupsAction, recomputeSocialLeadsAction, reviewSocialLeadAction, setFollowupStatusAction } from "@/lib/social/actions";
import type { SocialLeadsBoard, SocialLeadRow } from "@/lib/social/service";

const INTENT: Record<string, string> = { asking_price: "שאלת מחיר", asking_location: "שאלת מיקום", asking_viewing: "בקשת ביקור", asking_details: "בקשת פרטים", seller_interest: "מעוניין למכור", buyer_interest: "מעוניין לקנות", investor_interest: "להשקיע", commercial_interest: "מסחרי", negative: "שלילי", spam: "ספאם", unknown: "לא ידוע" };
const PLATFORM: Record<string, string> = { facebook: "פייסבוק", whatsapp: "וואטסאפ", telegram: "טלגרם", instagram: "אינסטגרם", manual: "ידני" };
const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");
const fmtDue = (s: string | null) => (s ? new Date(s).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

export function SocialLeadsView({ board }: { board: SocialLeadsBoard }) {
  const router = useRouter();
  const { counts, byStatus, topOpportunities, intentBreakdown, sourceBreakdown, communityBreakdown, agentRecommendations, followups } = board;
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ error?: string; message?: string }>) => { setError(null); setMsg(null); start(async () => { const r = await fn(); if (r?.error) setError(r.error); else { if (r?.message) setMsg(r.message); router.refresh(); } }); };

  const empty = counts.new + counts.reviewed + counts.qualified + counts.converted + counts.rejected === 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Social Lead Capture OS</p>
          <h1 className="text-ink mt-1 text-2xl font-black">לידים חברתיים</h1>
          <p className="text-muted mt-1 text-sm">הפיכת אינטראקציות חברתיות להזדמנויות עסקיות מובנות. כל המרה היא פעולה אנושית מאושרת — ללא יצירת קשר/מענה אוטומטי.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => run(generateSocialFollowupsAction)} disabled={pending} leadingIcon={<Icon name="Clock" size={15} />}>צור מעקבים</Button>
          <Button onClick={() => run(recomputeSocialLeadsAction)} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>{pending ? "מנתח…" : "נתח אינטראקציות"}</Button>
        </div>
      </div>
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        <Stat label="חדשים" value={counts.new} icon="Flame" tone="text-brand-strong" />
        <Stat label="לבדיקה" value={counts.reviewed} icon="Filter" tone="text-warning" />
        <Stat label="מוכשרים" value={counts.qualified} icon="UserCheck" tone="text-success" />
        <Stat label="הומרו" value={counts.converted} icon="ArrowUpRight" tone="text-success" />
        <Stat label="נדחו" value={counts.rejected} icon="Minus" tone="text-muted" />
      </div>

      {empty ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="MessageCircle" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין לידים חברתיים</p>
          <p className="text-muted max-w-sm text-sm">לידים נוצרים מאינטראקציות חברתיות (תגובות/עניין) שנקלטו דרך שולחן ההפצה. לחץ ״נתח אינטראקציות״ כדי לזהות כוונה ולבנות לידים.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* New leads — primary work queue */}
          <div className="lg:col-span-2">
            <p className="text-ink mb-3 text-sm font-extrabold">לידים חדשים ({byStatus.new.length})</p>
            {byStatus.new.length === 0 ? <p className="text-muted bg-card border-line rounded-[20px] border p-5 text-sm">אין לידים חדשים ✓</p> : (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {byStatus.new.map((l) => <LeadCard key={l.id} l={l} pending={pending} run={run} />)}
              </div>
            )}
          </div>

          {/* Needs review (reviewed) */}
          <Panel title={`לבדיקה (${byStatus.reviewed.length})`} icon="Filter">
            {byStatus.reviewed.length === 0 ? <p className="text-muted text-sm">—</p> : (
              <ul className="flex flex-col gap-2">{byStatus.reviewed.slice(0, 8).map((l) => <ReviewRow key={l.id} l={l} pending={pending} run={run} />)}</ul>
            )}
          </Panel>

          {/* Qualified */}
          <Panel title={`מוכשרים (${byStatus.qualified.length})`} icon="UserCheck">
            {byStatus.qualified.length === 0 ? <p className="text-muted text-sm">—</p> : (
              <ul className="flex flex-col gap-2">{byStatus.qualified.slice(0, 8).map((l) => <ReviewRow key={l.id} l={l} pending={pending} run={run} />)}</ul>
            )}
          </Panel>

          {/* Intent breakdown */}
          <Panel title="פילוח כוונה" icon="BarChart3">
            {intentBreakdown.length === 0 ? <p className="text-muted text-sm">—</p> : (
              <ul className="flex flex-col gap-1.5">{intentBreakdown.map((i) => (
                <li key={i.intent} className="flex items-center justify-between gap-2 text-sm"><span className="text-ink font-semibold">{i.label}</span><span className="text-muted text-[11px]">{i.count}</span></li>
              ))}</ul>
            )}
          </Panel>

          {/* Source + community breakdown */}
          <Panel title="מקורות וקהילות" icon="Users">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-muted mb-1 text-[11px] font-bold">לפי פלטפורמה</p>
                <ul className="flex flex-col gap-1 text-sm">{sourceBreakdown.length === 0 ? <li className="text-muted">—</li> : sourceBreakdown.map((s) => <li key={s.platform} className="flex justify-between"><span className="text-ink">{PLATFORM[s.platform] ?? s.platform}</span><span className="text-muted text-[11px]">{s.count}</span></li>)}</ul>
              </div>
              <div>
                <p className="text-muted mb-1 text-[11px] font-bold">לפי קהילה</p>
                <ul className="flex flex-col gap-1 text-sm">{communityBreakdown.length === 0 ? <li className="text-muted">—</li> : communityBreakdown.map((c) => <li key={c.community} className="flex justify-between"><span className="text-ink min-w-0 flex-1 truncate">{c.community}</span><span className="text-muted text-[11px]">{c.count}</span></li>)}</ul>
              </div>
            </div>
          </Panel>

          {/* Agent recommendations */}
          <Panel title="המלצות סוכן (ניתוב)" icon="Route">
            {agentRecommendations.length === 0 ? <p className="text-muted text-sm">—</p> : (
              <ul className="flex flex-col gap-1.5">{agentRecommendations.map((a, i) => (
                <li key={a.userId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted w-4 text-center font-black">{i + 1}</span>
                  <Link href={`/team/${a.userId}`} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{a.name}</Link>
                  <span className={cn("shrink-0 text-xs font-black", tone(a.score))}>{a.score}</span>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* Top opportunities */}
          <Panel title="הזדמנויות מובילות" icon="Flame">
            {topOpportunities.length === 0 ? <p className="text-muted text-sm">—</p> : (
              <ul className="flex flex-col gap-1.5">{topOpportunities.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink min-w-0 flex-1 truncate font-semibold">{l.person_name ?? "ליד חברתי"} <span className="text-muted text-[10px]">· {INTENT[l.intent ?? "unknown"]}</span></span>
                  <span className={cn("shrink-0 text-xs font-black", tone(l.lead_quality_score))}>{l.lead_quality_score}</span>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* Follow-ups */}
          <Panel title={`מעקבים (${followups.length})`} icon="Clock">
            {followups.length === 0 ? <p className="text-muted text-sm">אין מעקבים פתוחים</p> : (
              <ul className="flex flex-col gap-1.5">{followups.slice(0, 8).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-ink min-w-0 flex-1 truncate font-semibold">{f.title}</span>
                  <span className="text-muted text-[11px]">{fmtDue(f.due_at)}</span>
                  <button className="text-success text-[11px] font-bold" disabled={pending} onClick={() => run(() => setFollowupStatusAction(f.id, "done"))}>בוצע</button>
                </li>
              ))}</ul>
            )}
          </Panel>

          {/* Converted + Rejected */}
          <Panel title={`הומרו (${byStatus.converted.length})`} icon="ArrowUpRight">
            {byStatus.converted.length === 0 ? <p className="text-muted text-sm">—</p> : (
              <ul className="flex flex-col gap-1.5">{byStatus.converted.slice(0, 8).map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
                  {l.converted_buyer_id ? <Link href={`/buyers/${l.converted_buyer_id}`} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{l.person_name ?? "קונה"}</Link> : <span className="text-ink min-w-0 flex-1 truncate font-semibold">{l.person_name}</span>}
                  <span className="text-success text-[11px] font-bold">הומר ✓</span>
                </li>
              ))}</ul>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function LeadCard({ l, pending, run }: { l: SocialLeadRow; pending: boolean; run: (fn: () => Promise<{ error?: string; message?: string }>) => void }) {
  return (
    <div className="bg-card border-line flex flex-col gap-2 rounded-[18px] border p-3 shadow-[var(--shadow-soft)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-ink truncate text-sm font-extrabold">{l.person_name ?? "ליד חברתי"}</p>
          <p className="text-muted text-[11px]">{INTENT[l.intent ?? "unknown"]} · {PLATFORM[l.platform ?? ""] ?? l.platform ?? "—"}{l.communityName ? ` · ${l.communityName}` : ""}</p>
        </div>
        <span className={cn("shrink-0 text-lg font-black", tone(l.lead_quality_score))}>{l.lead_quality_score}</span>
      </div>
      {l.recommended_next_action && <p className="text-brand-strong text-[11px] font-bold">→ {l.recommended_next_action}</p>}
      <div className="text-muted flex gap-3 text-[10px]">
        <span>ביטחון {l.intent_confidence}%</span><span>דחיפות {l.urgency_score}</span>
        {l.source_url && <a href={l.source_url} target="_blank" rel="noopener noreferrer" className="text-brand-strong font-bold">פוסט מקור ↗</a>}
      </div>
      <div className="mt-1 flex flex-wrap gap-2">
        <button className="text-success text-[11px] font-bold" disabled={pending} onClick={() => run(() => convertSocialLeadAction(l.id))}>המר לליד</button>
        <button className="text-brand-strong text-[11px] font-bold" disabled={pending} onClick={() => run(() => reviewSocialLeadAction(l.id, "qualified"))}>הכשר</button>
        <button className="text-muted text-[11px] font-bold" disabled={pending} onClick={() => run(() => reviewSocialLeadAction(l.id, "reviewed"))}>סמן נבדק</button>
        <button className="text-danger text-[11px] font-bold" disabled={pending} onClick={() => run(() => reviewSocialLeadAction(l.id, "rejected", null, "נדחה ידנית"))}>דחה</button>
      </div>
    </div>
  );
}

function ReviewRow({ l, pending, run }: { l: SocialLeadRow; pending: boolean; run: (fn: () => Promise<{ error?: string; message?: string }>) => void }) {
  return (
    <li className="border-line flex flex-wrap items-center gap-2 rounded-xl border p-2 text-sm">
      <span className="text-ink min-w-0 flex-1 font-semibold">{l.person_name ?? "ליד חברתי"} <span className="text-muted text-[10px]">· {INTENT[l.intent ?? "unknown"]} · {l.lead_quality_score}</span></span>
      <button className="text-success text-[11px] font-bold" disabled={pending} onClick={() => run(() => convertSocialLeadAction(l.id))}>המר</button>
      <button className="text-danger text-[11px] font-bold" disabled={pending} onClick={() => run(() => reviewSocialLeadAction(l.id, "rejected", null, "נדחה"))}>דחה</button>
    </li>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <div className="mb-2 flex items-center gap-2">{icon && <span className="bg-brand-soft text-brand grid h-7 w-7 place-items-center rounded-lg"><Icon name={icon} size={14} /></span>}<p className="text-ink text-sm font-extrabold">{title}</p></div>
      {children}
    </div>
  );
}

function Stat({ label, value, icon, tone = "text-brand-strong" }: { label: string; value: number; icon: string; tone?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={cn("mb-1 inline-flex", tone)}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-lg font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
