"use client";
// ============================================================================
// 🧭 ZONO — Journey Center · CANONICAL-FIRST (Batch 5.4).
//
// It now renders the canonical spine (journeys + journey_events). A record marked
// `fallback` is a compatibility row for an entity that has no canonical journey
// yet — it is labelled as such and never shown alongside a canonical one for the
// same entity. Stage names and the ladder come from the CANONICAL machines, not
// from a private vocabulary. Read-only; CTAs open the real entity cockpit.
// ============================================================================
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { ladder, stageLabel as canonicalStageLabel, type JourneyType } from "@/lib/journey-canonical";
import { ENTITY_HE, type JourneyCenter, type JourneyEntityType, type JourneyFlag, type UnifiedJourney } from "@/lib/journey-center/types";

const ENTITY_ICON: Record<JourneyEntityType, string> = { buyer: "Users", seller: "Handshake", lead: "MessageCircle", property: "Building2", deal: "Briefcase" };
type FilterKey = "all" | JourneyEntityType | "at_risk" | "waiting" | "advancing" | "no_activity"
  | "canonical" | "fallback" | "stalled" | "blocked";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "הכל" }, { key: "buyer", label: "קונים" }, { key: "seller", label: "מוכרים" },
  { key: "lead", label: "לידים" }, { key: "property", label: "נכסים" }, { key: "deal", label: "עסקאות" },
  // Batch 5.4 — the operator can always see WHERE a row came from and what is stuck.
  { key: "canonical", label: "קנוני" }, { key: "fallback", label: "תאימות" },
  { key: "stalled", label: "תקוע" }, { key: "blocked", label: "חסום" },
  { key: "at_risk", label: "בסיכון" },
  { key: "waiting", label: "ממתין לפעולה" }, { key: "advancing", label: "מתקדם" }, { key: "no_activity", label: "ללא פעילות" },
];

const timeAgo = (iso: string | null) => {
  if (!iso) return null;
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return d <= 0 ? "היום" : d === 1 ? "אתמול" : `לפני ${d} ימים`;
};
const dateHe = (iso: string) => new Date(iso).toLocaleDateString("he-IL", { day: "numeric", month: "short" });

export function JourneysView({ data, error }: { data: JourneyCenter | null; error: boolean }) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("all");
  const [open, setOpen] = useState<UnifiedJourney | null>(null);

  const journeys = useMemo(() => data?.journeys ?? [], [data]);
  const filtered = useMemo(() => journeys.filter((j) => {
    if (filter === "all") return true;
    if (filter === "buyer" || filter === "seller" || filter === "lead" || filter === "property") return j.entityType === filter;
    if (filter === "canonical") return j.canonical === true;
    if (filter === "fallback") return j.canonical === false;
    if (filter === "stalled") return (j.stageAgeDays ?? 0) >= 14 && !j.flags.includes("closed");
    if (filter === "blocked") return (j.blockers?.length ?? 0) > 0;
    return j.flags.includes(filter as JourneyFlag);
  }), [journeys, filter]);

  // ── Honest empty states ─────────────────────────────────────────────────────
  if (error) return <Shell><EmptyState icon="AlertTriangle" title="לא הצלחנו לטעון את המסעות כרגע." hint="ייתכן שהייתה תקלה זמנית." action={<button onClick={() => router.refresh()} className="btn-zono-primary rounded-xl px-4 py-2 text-sm font-black text-white">נסה שוב</button>} /></Shell>;
  if (journeys.length === 0 && !data?.hasEntities) return <Shell><EmptyState icon="Users" title="עדיין אין קונים, מוכרים, לידים או נכסים במערכת." hint="הוסיפו ישות ראשונה כדי לראות את המסע שלה כאן." action={<CreateButtons />} /></Shell>;
  if (journeys.length === 0) return <Shell><EmptyState icon="Route" title="יש ישויות במערכת, אך עדיין לא נוצרה פעילות שמאפשרת לבנות מסע." hint="ברגע שתתחיל פעילות (הודעה, פגישה, משימה) המסע יופיע כאן." action={<CreateButtons />} /></Shell>;

  const k = data!.kpis;
  const kpis: { label: string; value: number; icon: string; tone: string; f?: FilterKey }[] = [
    { label: "מסעות פעילים", value: k.active, icon: "Route", tone: "text-brand-strong" },
    { label: "בסיכון", value: k.atRisk, icon: "AlertTriangle", tone: "text-danger", f: "at_risk" },
    { label: "ממתין לפעולה", value: k.waiting, icon: "Clock", tone: "text-warning", f: "waiting" },
    { label: "מתקדם היום", value: k.advancing, icon: "Sparkles", tone: "text-success", f: "advancing" },
    { label: "ללא פעילות", value: k.noActivity, icon: "Clock", tone: "text-muted", f: "no_activity" },
    { label: "פגישות קרובות", value: k.upcomingMeetings, icon: "Calendar", tone: "text-brand" },
    // Batch 5.4 — canonical coverage is a first-class number, not a footnote.
    { label: "מסעות קנוניים", value: k.canonicalRecords ?? 0, icon: "ShieldCheck", tone: "text-success", f: "canonical" },
    { label: "רשומות תאימות", value: k.fallbackRecords ?? 0, icon: "History", tone: "text-warning", f: "fallback" },
  ];

  return (
    <Shell>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-black sm:text-3xl">מסעות לקוח</h1>
          <p className="text-muted text-[13px]">{data!.totals.buyers} קונים · {data!.totals.sellers} מוכרים · {data!.totals.leads} לידים · {data!.totals.properties} נכסים</p>
        </div>
        <CreateButtons />
      </div>

      {/* KPIs */}
      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {kpis.map((x) => (
          <button key={x.label} onClick={() => x.f && setFilter(x.f)} className={`bg-card border-line rounded-2xl border p-3 text-right shadow-sm transition ${x.f ? "hover:border-brand-light" : "cursor-default"}`}>
            <div className="text-muted flex items-center gap-1.5 text-[11px] font-bold"><Icon name={x.icon} size={12} /> {x.label}</div>
            <p className={`mt-0.5 text-2xl font-black tabular-nums ${x.tone}`}>{x.value}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={`rounded-full px-3 py-1.5 text-[12px] font-bold transition ${filter === f.key ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink"}`}>{f.label}</button>
        ))}
      </div>

      {/* Grid / no-filter-results */}
      {filtered.length === 0 ? (
        <EmptyState icon="Filter" title="אין מסעות שתואמים למסנן הנוכחי." hint="נסה מסנן אחר." action={<button onClick={() => setFilter("all")} className="btn-zono-secondary rounded-xl px-4 py-2 text-sm font-bold">נקה מסנן</button>} />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((j) => <JourneyCard key={j.journeyId} j={j} onOpen={() => setOpen(j)} />)}
        </div>
      )}

      {open && <JourneyDrawer j={open} onClose={() => setOpen(null)} />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div dir="rtl" className="mx-auto w-full max-w-[1400px]">{children}</div>;
}

function CreateButtons() {
  const dispatch = (ev: string) => () => { try { window.dispatchEvent(new Event(ev)); } catch { /* noop */ } };
  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/buyers/new" className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-bold"><Icon name="Plus" size={14} /> קונה</Link>
      <Link href="/sellers/new" className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-bold"><Icon name="Plus" size={14} /> מוכר</Link>
      <button onClick={dispatch("zono:new-lead")} className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-bold"><Icon name="Plus" size={14} /> ליד</button>
      <Link href="/properties/new" className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-bold"><Icon name="Plus" size={14} /> נכס</Link>
    </div>
  );
}

function progressTone(j: UnifiedJourney) {
  if (j.flags.includes("closed")) return "bg-line";
  if (j.flags.includes("at_risk")) return "bg-danger";
  if (j.flags.includes("advancing")) return "bg-success";
  return "bg-brand";
}
function FlagBadge({ f }: { f: JourneyFlag }) {
  const map: Record<JourneyFlag, { label: string; cls: string } | null> = {
    at_risk: { label: "בסיכון", cls: "bg-danger-soft text-danger" },
    waiting: { label: "ממתין", cls: "bg-warning-soft text-warning" },
    advancing: { label: "מתקדם", cls: "bg-success-soft text-success" },
    no_activity: { label: "ללא פעילות", cls: "bg-surface text-muted" },
    closed: { label: "הושלם", cls: "bg-line/70 text-muted" },
    active: null,
  };
  const m = map[f]; if (!m) return null;
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${m.cls}`}>{m.label}</span>;
}

function JourneyCard({ j, onOpen }: { j: UnifiedJourney; onOpen: () => void }) {
  return (
    <div className="bg-card border-line hover:border-brand-light flex flex-col gap-2.5 rounded-2xl border p-4 shadow-sm transition">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="bg-brand-soft text-brand-strong grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name={ENTITY_ICON[j.entityType]} size={17} /></span>
          <div className="min-w-0">
            <p className="text-ink truncate text-sm font-black">{j.entityName}</p>
            <p className="text-muted text-[11px] font-bold">{ENTITY_HE[j.entityType]} · {j.stageLabel}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">{j.flags.map((f) => <FlagBadge key={f} f={f} />)}</div>
      </div>

      {/* progress */}
      <div>
        <div className="bg-surface h-1.5 w-full overflow-hidden rounded-full"><div className={`h-full rounded-full ${progressTone(j)}`} style={{ width: `${j.progress}%` }} /></div>
        <div className="text-muted mt-1 flex items-center justify-between text-[10.5px] font-bold"><span>{j.progress}%</span>{j.lastActivityAt && <span>פעילות אחרונה: {timeAgo(j.lastActivityAt)}</span>}</div>
      </div>

      {j.nextAction && (
        <div className="bg-surface flex items-start gap-2 rounded-xl p-2.5">
          <span className="text-brand mt-0.5 shrink-0"><Icon name="Sparkles" size={14} /></span>
          <p className="text-ink line-clamp-2 text-[12px] font-semibold leading-relaxed">{j.nextAction}</p>
        </div>
      )}

      <div className="text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-bold">
        {j.openTasks > 0 && <span className="inline-flex items-center gap-1"><Icon name="ListChecks" size={12} /> {j.openTasks} משימות</span>}
        {j.upcomingMeetingAt && <span className="inline-flex items-center gap-1"><Icon name="Calendar" size={12} /> {dateHe(j.upcomingMeetingAt)}</span>}
        {j.risk >= 60 && <span className="text-danger inline-flex items-center gap-1"><Icon name="AlertTriangle" size={12} /> סיכון {j.risk}</span>}
      </div>

      <div className="border-line mt-1 flex items-center justify-between gap-2 border-t pt-2.5">
        <button onClick={onOpen} className="text-brand text-[12px] font-black">פרטי המסע</button>
        <Link href={j.href} className="btn-zono-primary zono-focus-ring inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-black text-white">פתח כרטיס {ENTITY_HE[j.entityType]} <Icon name="ChevronLeft" size={13} /></Link>
      </div>
    </div>
  );
}

function JourneyDrawer({ j, onClose }: { j: UnifiedJourney; onClose: () => void }) {
  // The ladder is the CANONICAL machine's, never a private list.
  const jt = (j.journeyType ?? j.entityType) as JourneyType;
  const order = ladder(jt).map((s) => s.key);
  return (
    <div className="fixed inset-0 z-[60] flex justify-start bg-black/40" onClick={onClose}>
      <div dir="rtl" onClick={(e) => e.stopPropagation()} className="bg-card border-line ms-auto flex h-full w-full max-w-md flex-col overflow-y-auto border-s p-5 shadow-[var(--shadow-lift)]">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="bg-brand-soft text-brand-strong grid h-10 w-10 place-items-center rounded-xl"><Icon name={ENTITY_ICON[j.entityType]} size={19} /></span>
            <div><p className="text-ink text-base font-black">{j.entityName}</p><p className="text-muted text-[11px] font-bold">{ENTITY_HE[j.entityType]} · {j.stageLabel}</p></div>
          </div>
          <button onClick={onClose} aria-label="סגור" className="text-muted hover:text-ink"><Icon name="X" size={18} /></button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {j.flags.map((f) => <FlagBadge key={f} f={f} />)}
          <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black ${j.canonical ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
            {j.canonical ? "מסע קנוני" : "רשומת תאימות"}
          </span>
          {typeof j.stageAgeDays === "number" && (
            <span className="bg-surface text-muted rounded-lg px-2 py-0.5 text-[10px] font-black">{j.stageAgeDays} ימים בשלב</span>
          )}
        </div>

        {/* real, observed blockers — never invented */}
        {(j.blockers?.length ?? 0) > 0 && (
          <div className="border-danger/30 bg-danger-soft/40 mt-3 rounded-xl border p-3">
            <p className="text-danger mb-1 text-[12px] font-black">חסמים</p>
            <ul className="text-ink flex flex-col gap-1 text-[12px]">
              {j.blockers!.map((b, i) => <li key={i}>· {b}</li>)}
            </ul>
          </div>
        )}

        {/* stage timeline */}
        <div className="mt-4">
          <p className="text-muted mb-2 text-[12px] font-black">שלבי המסע</p>
          <ol className="flex flex-col gap-1.5">
            {order.map((s, i) => {
              const done = i < j.stageIndex, current = i === j.stageIndex;
              return (
                <li key={s} className="flex items-center gap-2.5">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-black ${current ? "bg-brand text-white" : done ? "bg-success-soft text-success" : "bg-surface text-muted"}`}>{done ? "✓" : i + 1}</span>
                  <span className={`text-[13px] ${current ? "text-ink font-black" : done ? "text-muted" : "text-muted/70"}`}>{canonicalStageLabel(jt, s)}</span>
                </li>
              );
            })}
          </ol>
        </div>

        {/* health + risk */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="bg-surface rounded-xl p-3 text-center"><p className="text-ink text-xl font-black">{j.healthScore}</p><p className="text-muted text-[11px] font-bold">בריאות{j.healthLabel ? ` · ${j.healthLabel}` : ""}</p></div>
          <div className="bg-surface rounded-xl p-3 text-center"><p className={`text-xl font-black ${j.risk >= 60 ? "text-danger" : "text-ink"}`}>{j.risk}</p><p className="text-muted text-[11px] font-bold">סיכון</p></div>
        </div>

        {j.nextAction && (
          <div className="bg-brand-soft/50 border-brand/20 mt-4 rounded-2xl border p-3.5">
            <p className="text-brand-strong text-[12px] font-black">הצעד הבא</p>
            <p className="text-ink mt-1 text-[13px] font-semibold leading-relaxed">{j.nextAction}</p>
            {j.nextActionReason && <p className="text-muted mt-1 text-[12px] leading-relaxed">{j.nextActionReason}</p>}
          </div>
        )}

        {(j.openTasks > 0 || j.upcomingMeetingAt || j.lastActivityAt) && (
          <div className="text-muted mt-4 flex flex-col gap-1.5 text-[12px] font-bold">
            {j.lastActivityAt && <span className="inline-flex items-center gap-1.5"><Icon name="Activity" size={13} /> פעילות אחרונה: {timeAgo(j.lastActivityAt)}</span>}
            {j.openTasks > 0 && <span className="inline-flex items-center gap-1.5"><Icon name="ListChecks" size={13} /> {j.openTasks} משימות פתוחות</span>}
            {j.upcomingMeetingAt && <span className="inline-flex items-center gap-1.5"><Icon name="Calendar" size={13} /> פגישה קרובה: {dateHe(j.upcomingMeetingAt)}</span>}
          </div>
        )}

        {j.evidence.length > 0 && (
          <div className="mt-4">
            <p className="text-muted mb-1.5 text-[12px] font-black">ראיות / למה</p>
            <ul className="text-ink flex list-inside list-disc flex-col gap-0.5 text-[12px]">{j.evidence.map((e, i) => <li key={i}>{e}</li>)}</ul>
          </div>
        )}

        <Link href={j.href} className="btn-zono-primary zono-focus-ring mt-5 inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-3 text-sm font-black text-white">פתח כרטיס {ENTITY_HE[j.entityType]}</Link>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, hint, action }: { icon: string; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="bg-card border-line flex flex-col items-center gap-3 rounded-3xl border px-6 py-16 text-center shadow-sm">
      <span className="bg-brand-soft text-brand-strong grid h-16 w-16 place-items-center rounded-2xl"><Icon name={icon} size={30} /></span>
      <h2 className="text-ink text-xl font-black">{title}</h2>
      {hint && <p className="text-muted max-w-md text-sm">{hint}</p>}
      {action && <div className="mt-2 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}
