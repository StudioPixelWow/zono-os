"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  DEAL_KIND_LABELS,
  PROPERTY_TYPE_LABELS,
  SOURCE_LABELS,
  TEMPERATURE_LABELS,
  TEMPERATURE_TONES,
  buyerBudgetLine,
  buyerPreferences,
  buyerRoomsLine,
  type BuyerRow,
} from "@/lib/buyers/labels";
import { STAGE_LABELS, type BuyerStage } from "@/lib/buyer-intelligence/playbook";
import { BuyerTasksPanel } from "./BuyerTasksPanel";
import { BuyerNoteComposer } from "./BuyerNoteComposer";
import type { Database } from "@/lib/supabase/types";
import { BuyerCommandCenter } from "./BuyerCommandCenter";
import type { BuyerCommandCenter as BuyerCCData } from "@/lib/buyer-intelligence/service";
import { RecommendedMatches, type RecoItemView } from "@/components/activity/RecommendedMatches";
import type { BuyerPropertyMatch } from "@/lib/matching-intelligence/service";
import { recalcMatchesAction } from "@/lib/matching-intelligence/actions";

type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
type MeetingRow = Database["public"]["Tables"]["meetings"]["Row"];

type Tab = "command" | "matching" | "communication" | "memory" | "calendar" | "documents" | "timeline" | "graph";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "command", label: "מרכז ניהול", icon: "Sparkles" },
  { id: "matching", label: "התאמות", icon: "Building2" },
  { id: "communication", label: "תקשורת", icon: "MessageCircle" },
  { id: "memory", label: "זיכרון קונה", icon: "Database" },
  { id: "calendar", label: "יומן ופגישות", icon: "Calendar" },
  { id: "documents", label: "מסמכים", icon: "FileText" },
  { id: "timeline", label: "ציר זמן", icon: "Activity" },
  { id: "graph", label: "גרף קשרים", icon: "Layers" },
];

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");
const scoreText = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-danger");
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("");
const waLink = (phone: string | null) => {
  const d = (phone ?? "").replace(/\D/g, "");
  return d ? `https://wa.me/${d}` : null;
};

function EmptyState({ icon, text, action }: { icon: string; text: string; action?: ReactNode }) {
  return (
    <div className="text-muted flex flex-col items-center gap-3 py-12 text-center text-sm">
      <span className="bg-surface text-muted grid h-14 w-14 place-items-center rounded-2xl"><Icon name={icon} size={24} /></span>
      <p className="max-w-xs leading-relaxed">{text}</p>
      {action}
    </div>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="border-line flex items-center justify-between border-b py-2.5 last:border-0">
      <span className="text-muted text-sm">{k}</span>
      <span className="text-ink text-sm font-semibold">{v}</span>
    </div>
  );
}

export function BuyerDetailView({
  buyer: b,
  activities,
  tasks,
  notes,
  meetings,
  commandCenter,
  recommendations,
  buyerMatches,
  communicationSlot,
  calendarSlot,
  documentsSlot,
  approvalSlot,
  recommendationsSlot,
  graphSlot,
}: {
  buyer: BuyerRow;
  activities: ActivityRow[];
  tasks: TaskRow[];
  notes: NoteRow[];
  meetings: MeetingRow[];
  commandCenter: BuyerCCData | null;
  recommendations: RecoItemView[];
  buyerMatches: BuyerPropertyMatch[];
  communicationSlot?: ReactNode;
  calendarSlot?: ReactNode;
  documentsSlot?: ReactNode;
  approvalSlot?: ReactNode;
  recommendationsSlot?: ReactNode;
  graphSlot?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("command");
  const prefs = buyerPreferences(b);
  const yes = "כן";
  const no = "—";

  const typesText = b.preferred_types.length ? b.preferred_types.map((t) => PROPERTY_TYPE_LABELS[t]).join(", ") : no;
  const areas = b.preferred_areas;

  // ── Intelligence highlights lifted into the hero (evidence-only; may be null) ──
  const prof = commandCenter?.profile ?? null;
  const aiScore = prof?.buyer_conversion_probability ?? null;
  const readiness = prof?.buyer_readiness_score ?? null;
  const nextAction = prof?.next_best_action ?? null;
  const summary = prof?.intelligence_summary ?? prof?.ai_summary ?? null;
  const stageLabel = prof ? STAGE_LABELS[prof.current_stage as BuyerStage] ?? null : null;
  const openRisks = commandCenter?.risks.filter((r) => r.status === "open").length ?? 0;
  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled").length;
  const matchCount = buyerMatches.length || recommendations.length;
  const wa = waLink(b.phone);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/buyers" className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold">
        <Icon name="ChevronRight" size={16} /> חזרה לקונים
      </Link>

      {/* ── Buyer command-center hero ───────────────────────────────────────── */}
      <div className="bg-card border-line overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)]">
        {/* Top band */}
        <div className="bg-brand-soft flex flex-wrap items-start gap-4 p-5">
          <div className="bg-brand grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-black text-white shadow-[var(--shadow-soft)]">{initials(b.full_name) || "?"}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-ink text-2xl font-black leading-tight">{b.full_name}</h1>
              {b.temperature && <Badge tone={TEMPERATURE_TONES[b.temperature]}>{TEMPERATURE_LABELS[b.temperature]}</Badge>}
              {stageLabel && <span className="bg-card text-brand rounded-full px-2.5 py-1 text-[11px] font-bold">{stageLabel}</span>}
            </div>
            <p className="text-muted mt-1 text-sm">{b.phone ?? "—"}{b.email ? ` · ${b.email}` : ""}</p>
            {summary && <p className="text-ink mt-2 line-clamp-2 max-w-2xl text-[13px] leading-relaxed">{summary}</p>}
          </div>
          {/* AI ring */}
          <div className="bg-card flex shrink-0 items-center gap-4 rounded-2xl px-4 py-3">
            <div className="text-center"><p className={cn("text-3xl font-black leading-none", aiScore != null ? scoreText(aiScore) : "text-muted")}>{aiScore != null ? `${aiScore}%` : "—"}</p><p className="text-muted mt-1 text-[10px] font-bold">הסתברות סגירה</p></div>
            <div className="text-center"><p className={cn("text-3xl font-black leading-none", readiness != null ? scoreText(readiness) : "text-muted")}>{readiness ?? "—"}</p><p className="text-muted mt-1 text-[10px] font-bold">מוכנות</p></div>
          </div>
        </div>

        {/* Body: budget/areas + next action + chips + toolbar */}
        <div className="flex flex-col gap-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="bg-surface rounded-2xl p-3.5">
              <p className="text-muted text-[11px] font-bold">תקציב · חדרים</p>
              <p className="text-ink mt-0.5 text-lg font-black">{buyerBudgetLine(b)}</p>
              <p className="text-muted text-[12px] font-semibold">{buyerRoomsLine(b)}</p>
            </div>
            <div className="bg-surface rounded-2xl p-3.5">
              <p className="text-muted text-[11px] font-bold">אזורים מועדפים</p>
              {areas.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {areas.slice(0, 5).map((a) => <span key={a} className="bg-card text-ink inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"><Icon name="MapPin" size={11} />{a}</span>)}
                  {areas.length > 5 && <span className="text-muted px-1 text-[11px] font-semibold">+{areas.length - 5}</span>}
                </div>
              ) : <p className="text-muted mt-1 text-sm">לא הוגדרו אזורים</p>}
            </div>
          </div>

          {/* Next best action */}
          <button type="button" onClick={() => setTab("command")} className="bg-brand-soft flex items-start gap-3 rounded-2xl p-3.5 text-right transition hover:brightness-[0.98]">
            <span className="bg-brand mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white"><Icon name="ArrowUpRight" size={16} /></span>
            <span className="min-w-0">
              <span className="text-brand block text-[11px] font-bold">הפעולה הבאה שלך</span>
              <span className="text-ink block text-[14px] font-black leading-snug">{nextAction ?? "הפעל את מודיעין הקונה כדי לקבל המלצת פעולה"}</span>
            </span>
          </button>

          {/* Signal chips */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <button type="button" onClick={() => setTab("matching")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
              <div className="text-ink text-lg font-black">{matchCount}</div><div className="text-muted text-[10px] font-bold">נכסים תואמים</div>
            </button>
            <button type="button" onClick={() => setTab("memory")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
              <div className={cn("text-lg font-black", b.has_preapproval ? "text-success" : "text-warning")}>{b.has_preapproval ? "מאושר" : "חסר"}</div><div className="text-muted text-[10px] font-bold">אישור מימון</div>
            </button>
            <button type="button" onClick={() => setTab("command")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
              <div className={cn("text-lg font-black", openRisks > 0 ? "text-danger" : "text-success")}>{openRisks}</div><div className="text-muted text-[10px] font-bold">סיכונים פעילים</div>
            </button>
            <button type="button" onClick={() => setTab("command")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
              <div className="text-ink text-lg font-black">{openTasks}</div><div className="text-muted text-[10px] font-bold">משימות פתוחות</div>
            </button>
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {wa && <a href={wa} target="_blank" rel="noopener noreferrer"><Button leadingIcon={<Icon name="MessageCircle" size={16} />}>וואטסאפ</Button></a>}
            {b.phone && <a href={`tel:${b.phone}`}><Button variant="secondary" leadingIcon={<Icon name="MessageCircle" size={16} />}>התקשר</Button></a>}
            <Button variant="secondary" leadingIcon={<Icon name="Briefcase" size={16} />}
              onClick={() => window.dispatchEvent(new CustomEvent("zono:new-deal", { detail: { prefill: { kind: "buyer", id: b.id, label: b.full_name } } }))}>
              צור עסקה
            </Button>
            <Link href={`/buyers/${b.id}/edit`}><Button variant="ghost" leadingIcon={<Icon name="Settings" size={16} />}>עריכה</Button></Link>
          </div>
        </div>
      </div>

      {/* ── Cockpit tabs ────────────────────────────────────────────────────── */}
      <div className="border-line flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            className={cn("relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-sm font-bold transition", tab === t.id ? "text-brand-strong" : "text-muted hover:text-ink")}>
            <Icon name={t.icon} size={15} />{t.label}
            {tab === t.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
          </button>
        ))}
      </div>

      {/* ── Panels ──────────────────────────────────────────────────────────── */}
      <div>
        {tab === "command" && (
          <div className="flex flex-col gap-5">
            <BuyerCommandCenter buyerId={b.id} buyerName={b.full_name} data={commandCenter} recommendations={recommendations} />
            {approvalSlot}
          </div>
        )}

        {tab === "matching" && (
          <div className="flex flex-col gap-5">
            <div className="bg-card border-line rounded-[20px] border p-5">
              <RecommendedMatches title="נכסים מומלצים לקונה" emptyText="אין התאמות עדיין — חשב התאמות במסך 'התאמות'." items={recommendations} />
            </div>
            <div className="bg-card border-line rounded-[20px] border p-5">
              <BuyerMatchesTab matches={buyerMatches} />
            </div>
            {recommendationsSlot}
          </div>
        )}

        {tab === "communication" && (communicationSlot ?? <EmptyState icon="MessageCircle" text="אין תקשורת מתועדת עדיין." />)}

        {tab === "memory" && (
          <div className="bg-card border-line rounded-[20px] border p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="Database" size={16} /></span>
              <h3 className="text-ink text-sm font-extrabold">זיכרון הקונה — מה אנחנו יודעים</h3>
            </div>
            <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
              <div>
                <Row k="תקציב" v={buyerBudgetLine(b)} />
                <Row k="חדרים" v={buyerRoomsLine(b)} />
                <Row k="אזורים מועדפים" v={areas.length ? areas.join(", ") : no} />
                <Row k="סוגי נכס" v={typesText} />
                <Row k="סוג עסקה" v={prefs.deal_kind ? DEAL_KIND_LABELS[prefs.deal_kind] : no} />
              </div>
              <div>
                <Row k="אישור מימון עקרוני" v={b.has_preapproval ? yes : no} />
                {prof && <Row k="ציון מימון" v={<span className={scoreText(prof.buyer_financing_score)}>{prof.buyer_financing_score}</span>} />}
                <Row k="מעלית (חובה)" v={b.must_have_elevator ? yes : no} />
                <Row k="חניה (חובה)" v={b.must_have_parking ? yes : no} />
                <Row k="ממ״ד (חובה)" v={b.must_have_safe_room ? yes : no} />
                <Row k="דחיפות" v={b.temperature ? TEMPERATURE_LABELS[b.temperature] : no} />
                <Row k="מקור" v={prefs.source ? SOURCE_LABELS[prefs.source] : no} />
                <Row k="קשר אחרון" v={fmtDate(b.last_contacted_at)} />
              </div>
              {b.notes && <p className="text-muted mt-4 text-sm leading-relaxed sm:col-span-2">{b.notes}</p>}
            </div>
            {prof && (prof.ai_risk_summary || prof.ai_recommendation_summary) && (
              <div className="border-line mt-4 flex flex-col gap-1.5 rounded-2xl border p-4 text-sm">
                {prof.ai_risk_summary && <p className="text-ink"><span className="text-muted">סיכונים: </span>{prof.ai_risk_summary}</p>}
                {prof.ai_recommendation_summary && <p className="text-ink"><span className="text-muted">המלצה: </span>{prof.ai_recommendation_summary}</p>}
              </div>
            )}
          </div>
        )}

        {tab === "calendar" && (
          <div className="flex flex-col gap-5">
            {calendarSlot}
            <div className="bg-card border-line rounded-[20px] border p-5">
              <p className="text-ink mb-3 text-sm font-extrabold">היסטוריית פגישות וצפיות</p>
              {meetings.length === 0 ? (
                <EmptyState icon="Calendar" text="אין פגישות מתוזמנות לקונה זה." />
              ) : (
                <ul className="flex flex-col gap-2">
                  {meetings.map((m) => (
                    <li key={m.id} className="border-line flex items-center justify-between border-b py-2.5 last:border-0">
                      <div><p className="text-ink text-sm font-semibold">{m.title}</p><p className="text-muted text-xs">{fmtDate(m.start_at)}</p></div>
                      <Badge tone="neutral" size="sm">{m.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {tab === "documents" && (
          <div className="flex flex-col gap-5">{documentsSlot ?? <EmptyState icon="FileText" text="אין מסמכים לקונה זה." />}</div>
        )}

        {tab === "timeline" && (
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr]">
            <div className="bg-card border-line rounded-[20px] border p-5">
              <p className="text-ink mb-3 text-sm font-extrabold">פעילות הקונה</p>
              {activities.length === 0 ? (
                <EmptyState icon="Activity" text="אין פעילות מתועדת לקונה זה." />
              ) : (
                <ul className="flex flex-col gap-3">
                  {activities.map((a) => (
                    <li key={a.id} className="flex items-start gap-3">
                      <span className="bg-brand-soft text-brand mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl"><Icon name="Activity" size={15} /></span>
                      <div><p className="text-ink text-sm font-semibold">{a.subject ?? a.type}</p>{a.body && <p className="text-muted text-xs">{a.body}</p>}<p className="text-muted text-[11px]">{fmtDate(a.occurred_at)}</p></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="bg-card border-line rounded-[20px] border p-5">
              <p className="text-ink mb-3 text-sm font-extrabold">הערות</p>
              <BuyerNoteComposer buyerId={b.id} />
              {notes.length === 0 ? (
                <p className="text-muted text-sm">אין הערות לקונה זה.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {notes.map((n) => (
                    <li key={n.id} className="bg-surface rounded-xl p-3"><p className="text-ink text-sm">{n.body}</p><p className="text-muted mt-1 text-[11px]">{fmtDate(n.created_at)}</p></li>
                  ))}
                </ul>
              )}
              <div className="mt-4">
                <BuyerTasksPanel buyerId={b.id} tasks={tasks} />
              </div>
            </div>
          </div>
        )}

        {tab === "graph" && (graphSlot ?? <EmptyState icon="Layers" text="אין קשרים מתועדים עדיין." />)}
      </div>
    </div>
  );
}

const fmtShekels = (n: number | null) => (n && n > 0 ? `₪${Math.round(n).toLocaleString("he-IL")}` : null);
const scoreTone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-danger");

/**
 * Buyer detail "התאמות" tab — real matched properties from the matching engine
 * (match_intelligence_profiles). No mock properties or hardcoded cards: when the
 * engine has produced nothing for this buyer, an honest empty state is shown.
 */
function BuyerMatchesTab({ matches }: { matches: BuyerPropertyMatch[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setError(null);
    startTransition(async () => {
      const res = await recalcMatchesAction();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted text-sm">
          {matches.length > 0
            ? `${matches.length} נכסים תואמים לקונה לפי מנוע ההתאמות`
            : "מנוע ההתאמות מצליב את העדפות הקונה מול מלאי הנכסים"}
        </p>
        <Button variant="secondary" size="sm" loading={pending} leadingIcon={<Icon name="Sparkles" size={15} />} onClick={refresh}>
          רענן התאמות
        </Button>
      </div>

      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

      {matches.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="bg-surface text-muted grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Sparkles" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין התאמות לקונה הזה</p>
          <p className="text-muted max-w-sm text-sm">הוסף נכסים או הרץ מנוע התאמות כדי ליצור התאמות אמיתיות.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {matches.map((m) => (
            <li key={m.matchId} className="border-line rounded-[16px] border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-extrabold">{m.title}</p>
                  <p className="text-muted truncate text-xs">{m.locality ?? m.address ?? "—"}{fmtShekels(m.price) ? ` · ${fmtShekels(m.price)}` : ""}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-[11px] font-bold">
                  <span className={cn(scoreTone(m.compatibility))}>התאמה {m.compatibility}</span>
                  <span className={cn(scoreTone(m.closing))}>סגירה {m.closing}%</span>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral" size="sm">{m.stageLabel}</Badge>
                {m.openRisks > 0 && <Badge tone="danger" size="sm">{m.openRisks} סיכונים</Badge>}
                {m.openObjections > 0 && <Badge tone="warning" size="sm">{m.openObjections} התנגדויות</Badge>}
              </div>
              {m.reason && <p className="text-muted mt-2 text-xs"><span className="text-ink font-semibold">סיבת ההתאמה: </span>{m.reason}</p>}
              {m.blocker && <p className="text-danger mt-1 text-xs"><span className="font-semibold">חסם עיקרי: </span>{m.blocker}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link href={`/matches/${m.matchId}`}><Button variant="secondary" size="sm" leadingIcon={<Icon name="Sparkles" size={14} />}>פתח התאמה מלאה</Button></Link>
                <Link href={`/properties/${m.propertyId}`}><Button variant="ghost" size="sm" leadingIcon={<Icon name="Building2" size={14} />}>פתח נכס</Button></Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
