"use client";

import { useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  LISTING_KIND_LABELS,
  PROPERTY_STATUS_LABELS,
  PROPERTY_STATUS_OPTIONS,
  PROPERTY_STATUS_TONES,
  PROPERTY_TYPE_LABELS,
  propertyAddressLine,
  type PropertyRow,
} from "@/lib/properties/labels";
import {
  archivePropertyAction,
  setPropertyStatusAction,
} from "@/lib/properties/actions";
import type { Database, JourneyStage, PropertyStatus } from "@/lib/supabase/types";
import type { JourneyContext } from "@/lib/journey/stages";
import { scoreTone, type ScoreTone } from "@/lib/intelligence/scoring";
import { JourneyPanel } from "./JourneyPanel";
import { TasksPanel } from "./TasksPanel";
import { CommandCenter } from "./CommandCenter";
import type { CommandCenter as CommandCenterData } from "@/lib/intelligence/service";
import { EntityTimeline } from "@/components/activity/EntityTimeline";
import { ActivitySummaryCard } from "@/components/activity/ActivitySummaryCard";
import { RelationshipGraphMini } from "@/components/activity/RelationshipGraphMini";
import { RecommendedMatches } from "@/components/activity/RecommendedMatches";
import type {
  ActivityEventRow,
  ActivitySummary,
  RelationshipRow,
} from "@/lib/activity/types";
import { PropertySellersPanel } from "./PropertySellersPanel";
import { TransactionResearchPanel } from "@/components/transactions/TransactionResearchPanel";
import type { PropertySellerView } from "@/lib/sellers/service360";
import type { SellerReadiness } from "@/lib/sellers/propertySellers";

type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
type MediaRow = Database["public"]["Tables"]["property_media"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];

interface JourneyData {
  stage: JourneyStage;
  lastActivityAt: string | null;
  stageEnteredAt: string | null;
  context: JourneyContext;
}

type Tab = "command" | "buyers" | "sellers" | "marketing" | "calendar" | "documents" | "timeline" | "details";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "command", label: "מרכז ניהול", icon: "Sparkles" },
  { id: "buyers", label: "קונים תואמים", icon: "Users" },
  { id: "sellers", label: "מוכר / בעלים", icon: "UserCheck" },
  { id: "marketing", label: "שיווק", icon: "Megaphone" },
  { id: "calendar", label: "יומן וצפיות", icon: "Calendar" },
  { id: "documents", label: "מסמכים", icon: "FileText" },
  { id: "timeline", label: "ציר זמן", icon: "Activity" },
  { id: "details", label: "פרטים ונתונים", icon: "ListChecks" },
];

const SCORE_TEXT: Record<ScoreTone, string> = { good: "text-success", medium: "text-brand-strong", risk: "text-danger" };
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");

function EmptyState({ icon, text, action }: { icon: string; text: string; action?: ReactNode }) {
  return (
    <div className="text-muted flex flex-col items-center gap-3 py-12 text-center text-sm">
      <span className="bg-surface text-muted grid h-14 w-14 place-items-center rounded-2xl">
        <Icon name={icon} size={24} />
      </span>
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

export function PropertyDetailView({
  property: p,
  activities,
  notes,
  documents,
  media,
  tasks,
  journey,
  commandCenter,
  timeline,
  relationships,
  activitySummary,
  recommendedBuyers,
  propertySellers,
  sellerReadiness,
  marketingSlot,
  calendarSlot,
  documentsSlot,
  approvalSlot,
  recommendationsSlot,
  contextSlot,
}: {
  property: PropertyRow;
  activities: ActivityRow[];
  notes: NoteRow[];
  documents: DocumentRow[];
  media: MediaRow[];
  tasks: TaskRow[];
  journey: JourneyData;
  commandCenter: CommandCenterData | null;
  timeline: ActivityEventRow[];
  relationships: RelationshipRow[];
  activitySummary: ActivitySummary;
  recommendedBuyers: import("@/components/activity/RecommendedMatches").RecoItemView[];
  propertySellers: PropertySellerView[];
  sellerReadiness: SellerReadiness;
  marketingSlot?: ReactNode;
  calendarSlot?: ReactNode;
  documentsSlot?: ReactNode;
  approvalSlot?: ReactNode;
  recommendationsSlot?: ReactNode;
  contextSlot?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("command");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const yes = "כן";
  const no = "—";

  const changeStatus = (status: PropertyStatus) => {
    setError(null);
    start(async () => {
      const r = await setPropertyStatusAction(p.id, status);
      if (r?.error) setError(r.error);
    });
  };
  const archive = () => {
    setError(null);
    start(async () => {
      const r = await archivePropertyAction(p.id);
      if (r?.error) setError(r.error);
    });
  };

  // ── Intelligence highlights lifted into the hero (evidence-only; may be null) ──
  const prof = commandCenter?.profile ?? null;
  const aiScore = prof?.success_score ?? null;
  const aiTone = aiScore != null ? scoreTone(aiScore) : "medium";
  const nextAction = prof?.next_best_action ?? null;
  const aiSummary = prof?.intelligence_summary ?? null;
  const primaryImg = media.find((m) => m.is_primary)?.url ?? media[0]?.url ?? null;
  const owner = propertySellers.find((s) => s.isPrimary) ?? propertySellers[0] ?? null;
  const openRisks = commandCenter?.risks.filter((r) => r.status === "open").length ?? 0;
  const openTasks = tasks.filter((t) => t.status !== "done" && t.status !== "cancelled").length;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/properties" className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold">
        <Icon name="ChevronRight" size={16} /> חזרה לנכסים
      </Link>

      {/* ── Cinematic asset cockpit hero ────────────────────────────────────── */}
      <div className="bg-card border-line overflow-hidden rounded-[24px] border shadow-[var(--shadow-card)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.35fr)]">
          {/* Image */}
          <div className="relative min-h-[240px] overflow-hidden lg:min-h-[340px]">
            {primaryImg ? (
              <Image src={primaryImg} alt={p.title} fill sizes="(max-width:1024px) 100vw, 45vw" className="object-cover" />
            ) : (
              <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#6d28d9,#8b5cf6)" }}>
                <div className="absolute inset-0 grid place-items-center text-white/70"><Icon name="Building2" size={54} /></div>
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/20" />
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
              <Badge tone={PROPERTY_STATUS_TONES[p.status]}>{PROPERTY_STATUS_LABELS[p.status]}</Badge>
              {media.length > 0 && (
                <span className="rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                  <Icon name="Building2" size={12} /> {media.length}
                </span>
              )}
            </div>
            <div className="absolute inset-x-0 bottom-0 p-4 text-white">
              <p className="text-[13px] font-semibold text-white/85">{PROPERTY_TYPE_LABELS[p.type]} · {propertyAddressLine(p)}</p>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-3xl font-black drop-shadow-sm">{formatShekels(p.price)}</span>
                <span className="text-[13px] font-semibold text-white/80">{LISTING_KIND_LABELS[p.listing_kind]}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] font-medium text-white/85">
                {p.rooms != null && <span>{p.rooms} חד׳</span>}
                {p.size_sqm != null && <span>{p.size_sqm} מ״ר</span>}
                {p.floor != null && <span>קומה {p.floor}</span>}
              </div>
            </div>
          </div>

          {/* Intelligence + actions */}
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-ink text-xl font-black leading-tight sm:text-2xl">{p.title}</h1>
                {aiSummary && <p className="text-muted mt-1 line-clamp-2 text-[13px] leading-relaxed">{aiSummary}</p>}
              </div>
              {/* AI score ring */}
              <div className="bg-surface flex shrink-0 flex-col items-center rounded-2xl px-3.5 py-2.5">
                <span className={cn("text-3xl font-black leading-none", SCORE_TEXT[aiTone])}>{aiScore ?? "—"}</span>
                <span className="text-muted mt-1 text-[10px] font-bold">ציון AI</span>
              </div>
            </div>

            {/* Next best action */}
            <button
              type="button"
              onClick={() => setTab("command")}
              className="bg-brand-soft group flex items-start gap-3 rounded-2xl p-3.5 text-right transition hover:brightness-[0.98]"
            >
              <span className="bg-brand mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl text-white"><Icon name="ArrowUpRight" size={16} /></span>
              <span className="min-w-0">
                <span className="text-brand block text-[11px] font-bold">הפעולה הבאה שלך</span>
                <span className="text-ink block text-[14px] font-black leading-snug">{nextAction ?? "הפעל את ZONO Intelligence כדי לקבל המלצת פעולה"}</span>
              </span>
            </button>

            {/* Signal chips */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <button type="button" onClick={() => setTab("buyers")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
                <div className="text-ink text-lg font-black">{recommendedBuyers.length}</div>
                <div className="text-muted text-[10px] font-bold">קונים תואמים</div>
              </button>
              <button type="button" onClick={() => setTab("sellers")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
                <div className={cn("text-lg font-black", sellerReadiness.ready ? "text-success" : "text-warning")}>{sellerReadiness.ready ? "מוכן" : "חלקי"}</div>
                <div className="text-muted text-[10px] font-bold">מוכן לפרסום</div>
              </button>
              <button type="button" onClick={() => setTab("command")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
                <div className={cn("text-lg font-black", openRisks > 0 ? "text-danger" : "text-success")}>{openRisks}</div>
                <div className="text-muted text-[10px] font-bold">סיכונים פעילים</div>
              </button>
              <button type="button" onClick={() => setTab("command")} className="bg-surface hover:bg-brand-soft rounded-2xl p-2.5 text-center transition">
                <div className="text-ink text-lg font-black">{openTasks}</div>
                <div className="text-muted text-[10px] font-bold">משימות פתוחות</div>
              </button>
            </div>

            {/* Owner context */}
            <button type="button" onClick={() => setTab("sellers")} className="border-line hover:border-brand/40 flex items-center gap-3 rounded-2xl border p-3 text-right transition">
              <span className="bg-brand-soft text-brand grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name="UserCheck" size={16} /></span>
              <span className="min-w-0 flex-1">
                {owner ? (
                  <>
                    <span className="text-ink block text-[13px] font-bold">{owner.name}{owner.isPrimary && <span className="text-muted font-normal"> · בעלים ראשי</span>}</span>
                    <span className="text-muted block text-[11px]">{owner.canSign ? "מורשה חתימה" : "ללא הרשאת חתימה"}{owner.trustScore != null ? ` · אמון ${owner.trustScore}` : ""}</span>
                  </>
                ) : (
                  <>
                    <span className="text-ink block text-[13px] font-bold">לא שויך מוכר / בעלים</span>
                    <span className="text-muted block text-[11px]">שייכו מוכר כדי לאפשר פרסום ודיווח</span>
                  </>
                )}
              </span>
              <Icon name="ChevronLeft" size={16} />
            </button>

            {/* Action toolbar */}
            <div className="mt-auto flex flex-wrap items-center gap-2">
              <select
                value={p.status === "archived" ? "" : p.status}
                onChange={(e) => changeStatus(e.target.value as PropertyStatus)}
                disabled={pending}
                className="bg-card border-line text-ink h-10 rounded-xl border px-3 text-sm font-semibold outline-none"
              >
                {p.status === "archived" && <option value="">בארכיון</option>}
                {PROPERTY_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <Link href={`/creative/new?type=property_sale_post&propertyId=${p.id}`}>
                <Button leadingIcon={<Icon name="Sparkles" size={16} />}>צור פוסט פרסום</Button>
              </Link>
              <Link href={`/properties/${p.id}/edit`}>
                <Button variant="secondary" leadingIcon={<Icon name="Settings" size={16} />}>עריכה</Button>
              </Link>
              <Button variant="ghost" onClick={archive} disabled={pending}>ארכיון</Button>
            </div>
          </div>
        </div>
        {error && <p className="bg-danger-soft text-danger mx-5 mb-4 rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      </div>

      {/* ── Cockpit tabs ────────────────────────────────────────────────────── */}
      <div className="border-line flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "relative flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3.5 py-2.5 text-sm font-bold transition",
              tab === t.id ? "text-brand-strong" : "text-muted hover:text-ink",
            )}
          >
            <Icon name={t.icon} size={15} />{t.label}
            {tab === t.id && <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded-full" />}
          </button>
        ))}
      </div>

      {/* ── Panels ──────────────────────────────────────────────────────────── */}
      <div>
        {tab === "command" && (
          <div className="flex flex-col gap-5">
            <CommandCenter
              propertyId={p.id}
              propertyTitle={p.title}
              addressLine={propertyAddressLine(p)}
              data={commandCenter}
              tasks={tasks}
              recommendedBuyers={recommendedBuyers}
            />
            {approvalSlot}
          </div>
        )}

        {tab === "buyers" && (
          <div className="flex flex-col gap-5">
            <div className="bg-card border-line rounded-[20px] border p-5">
              <RecommendedMatches title="קונים מומלצים לנכס" emptyText="אין התאמות עדיין — חשב התאמות במסך 'התאמות'." items={recommendedBuyers} />
            </div>
            {recommendationsSlot}
          </div>
        )}

        {tab === "sellers" && (
          <div className="bg-card border-line rounded-[20px] border p-5">
            <PropertySellersPanel propertyId={p.id} sellers={propertySellers} readiness={sellerReadiness} />
          </div>
        )}

        {tab === "marketing" && (
          marketingSlot ?? <EmptyState icon="Megaphone" text="אין נתוני שיווק עדיין." />
        )}

        {tab === "calendar" && (
          calendarSlot ?? <EmptyState icon="Calendar" text="אין אירועים מתוזמנים לנכס זה." />
        )}

        {tab === "documents" && (
          <div className="flex flex-col gap-5">
            <div className="bg-card border-line rounded-[20px] border p-5">
              {documents.length === 0 ? (
                <EmptyState icon="FileText" text="אין מסמכים מקושרים לנכס זה. צרו מסמך משפטי או פורטל למטה." />
              ) : (
                <ul className="flex flex-col gap-2">
                  {documents.map((d) => (
                    <li key={d.id} className="border-line flex items-center justify-between border-b py-2.5 last:border-0">
                      <span className="text-ink text-sm font-semibold">{d.title}</span>
                      <span className="text-muted text-xs">{fmtDate(d.created_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {documentsSlot}
          </div>
        )}

        {tab === "timeline" && (
          <div className="flex flex-col gap-5">
            <ActivitySummaryCard summary={activitySummary} extra={{ openTasks, openRisks }} />
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.6fr_1fr]">
              <div className="bg-card border-line rounded-[20px] border p-5">
                <EntityTimeline items={timeline} title="ציר זמן הנכס" emptyStateText="אין פעילות מתועדת עדיין — פעולות יירשמו כאן אוטומטית." />
              </div>
              <div className="flex flex-col gap-5">
                <div className="bg-card border-line rounded-[20px] border p-5">
                  <p className="text-ink mb-3 text-sm font-extrabold">קשרים</p>
                  <RelationshipGraphMini relationships={relationships} selfType="property" />
                </div>
                <div className="bg-card border-line rounded-[20px] border p-5">
                  <p className="text-ink mb-3 text-sm font-extrabold">הערות</p>
                  {notes.length === 0 ? (
                    <p className="text-muted text-sm">אין הערות לנכס זה.</p>
                  ) : (
                    <ul className="flex flex-col gap-2.5">
                      {notes.slice(0, 6).map((n) => (
                        <li key={n.id} className="bg-surface rounded-xl p-3">
                          <p className="text-ink text-sm">{n.body}</p>
                          <p className="text-muted mt-1 text-[11px]">{fmtDate(n.created_at)}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "details" && (
          <div className="flex flex-col gap-5">
            <div className="bg-card border-line rounded-[20px] border p-5">
              <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                <div>
                  <Row k="סוג נכס" v={PROPERTY_TYPE_LABELS[p.type]} />
                  <Row k="סוג עסקה" v={LISTING_KIND_LABELS[p.listing_kind]} />
                  <Row k="מחיר" v={formatShekels(p.price)} />
                  {p.monthly_rent != null && <Row k="שכ״ד חודשי" v={formatShekels(p.monthly_rent)} />}
                  <Row k="חדרים" v={p.rooms ?? no} />
                  <Row k="שטח" v={p.size_sqm ? `${p.size_sqm} מ״ר` : no} />
                  <Row k="קומה" v={p.floor ?? no} />
                  <Row k="עיר" v={p.city ?? no} />
                </div>
                <div>
                  <Row k="בלעדיות" v={p.has_exclusivity ? yes : no} />
                  {p.has_exclusivity && <Row k="בלעדיות עד" v={fmtDate(p.exclusivity_ends_at)} />}
                  <Row k="חניה" v={p.has_parking ? yes : no} />
                  <Row k="מעלית" v={p.has_elevator ? yes : no} />
                  <Row k="מרפסת" v={p.has_balcony ? yes : no} />
                  <Row k='ממ"ד' v={p.has_safe_room ? yes : no} />
                  <Row k="מחסן" v={p.has_storage ? yes : no} />
                  <Row k="נוצר" v={fmtDate(p.created_at)} />
                </div>
                {p.description && <p className="text-muted mt-4 text-sm leading-relaxed sm:col-span-2">{p.description}</p>}
              </div>
            </div>

            {/* Photos */}
            <div className="bg-card border-line rounded-[20px] border p-5">
              <p className="text-ink mb-3 text-sm font-extrabold">תמונות הנכס</p>
              {media.length === 0 ? (
                <EmptyState icon="Building2" text="אין תמונות עדיין. ניתן להוסיף תמונות דרך עריכת הנכס." action={<Link href={`/properties/${p.id}/edit`}><Button variant="secondary" size="sm">הוסף תמונות</Button></Link>} />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {media.map((m) => (
                    <div key={m.id} className="border-line bg-surface relative aspect-[4/3] overflow-hidden rounded-2xl border">
                      <Image src={m.url} alt={m.alt_text ?? p.title} fill sizes="(max-width: 640px) 50vw, 33vw" className="object-cover" />
                      {m.is_primary && <span className="bg-brand absolute end-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white">ראשית</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Comparable / market research */}
            <div className="bg-card border-line rounded-[20px] border p-5">
              <TransactionResearchPanel
                propertyListingId={p.id}
                cityName={p.city}
                address={propertyAddressLine(p)}
                rooms={p.rooms}
                area={p.size_sqm}
                askingPrice={p.price}
              />
            </div>

            {contextSlot}

            {/* Journey */}
            <div className="bg-card border-line rounded-[20px] border p-5">
              <JourneyPanel
                propertyId={p.id}
                stage={journey.stage}
                lastActivityAt={journey.lastActivityAt}
                stageEnteredAt={journey.stageEnteredAt}
                context={journey.context}
                activities={activities}
              />
            </div>

            {/* Tasks (full) */}
            <div className="bg-card border-line rounded-[20px] border p-5">
              <TasksPanel propertyId={p.id} tasks={tasks} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
