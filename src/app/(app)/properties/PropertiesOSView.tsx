"use client";

// ============================================================================
// ZONO — Properties Operating System (נכסים)
// ----------------------------------------------------------------------------
// A premium, AI-first, vertically-scrolling Hebrew RTL command center for the
// agent's inventory. Real data flows in from `properties`; sections without a
// live data source yet use clearly-scoped mock content. The existing list +
// filters + inventory tabs are preserved by rendering them as `children` inside
// the "כל הנכסים" section, so no functionality is lost.
// ============================================================================

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Reveal, RevealGroup, RevealItem } from "@/components/dashboard/motion";
import {
  PROPERTY_STATUS_LABELS,
  PROPERTY_STATUS_TONES,
  propertyAddressLine,
  type PropertyRow,
} from "@/lib/properties/labels";
import { cn } from "@/lib/utils";

/* ── helpers ─────────────────────────────────────────────────────────────── */

const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;
function ilsCompact(n: number): string {
  if (n >= 1_000_000) return `₪${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₪${Math.round(n / 1000)}K`;
  return ils(n);
}
const TERMINAL = new Set(["sold", "rented", "withdrawn", "archived", "draft"]);
/** Resolved cover: media cover → denormalized primary_image_url → none. */
function coverFor(p: PropertyRow, covers: Record<string, string>): string | null {
  return covers[p.id] ?? p.primary_image_url ?? null;
}
function scoreOf(p: PropertyRow): number {
  return p.zono_score ?? p.quality_score ?? 70;
}
function daysSince(iso: string | null): number {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}
function scoreTone(score: number): { ring: string; text: string } {
  if (score >= 85) return { ring: "ring-success", text: "text-success" };
  if (score >= 70) return { ring: "ring-brand", text: "text-brand-strong" };
  return { ring: "ring-warning", text: "text-warning" };
}

/* ── section shell ───────────────────────────────────────────────────────── */

function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-ink text-lg font-black sm:text-xl">{title}</h2>
      {action}
    </div>
  );
}
function ViewAll({ href = "#" }: { href?: string }) {
  return (
    <Link href={href} className="text-brand-strong inline-flex items-center gap-1 text-sm font-bold">
      הצג הכל <Icon name="ChevronLeft" size={15} />
    </Link>
  );
}

/* ── 1. Hero ─────────────────────────────────────────────────────────────── */

function PropertiesHero({ agentName }: { agentName: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-ink text-2xl font-black sm:text-3xl">בוקר טוב, {agentName} 👋</h1>
      <p className="text-muted text-sm sm:text-base">מרכז השליטה של הנכסים שלך</p>
    </div>
  );
}

/* ── 2. KPI cards ────────────────────────────────────────────────────────── */

interface Kpi { label: string; value: string; icon: string; tone: string; delta?: string; deltaUp?: boolean; highlight?: boolean }

function PropertyKpiCards({ kpis }: { kpis: Kpi[] }) {
  return (
    <RevealGroup className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((k) => (
        <RevealItem key={k.label}>
          <div className={cn(
            "flex h-full flex-col gap-2 rounded-[22px] border p-4 shadow-[var(--shadow-card)]",
            k.highlight ? "bg-gradient-to-br from-brand to-brand-strong border-transparent text-white" : "bg-card border-line",
          )}>
            <div className="flex items-center justify-between">
              <span className={cn("text-xs font-bold", k.highlight ? "text-white/80" : "text-muted")}>{k.label}</span>
              <span className={cn("grid h-8 w-8 place-items-center rounded-xl", k.highlight ? "bg-white/15 text-white" : k.tone)}>
                <Icon name={k.icon} size={16} />
              </span>
            </div>
            <span className={cn("text-2xl font-black sm:text-[28px]", k.highlight ? "text-white" : "text-ink")}>{k.value}</span>
            {k.delta && (
              <span className={cn("inline-flex items-center gap-1 text-xs font-bold", k.highlight ? "text-white/85" : k.deltaUp ? "text-success" : "text-danger")}>
                <Icon name={k.deltaUp ? "TrendingUp" : "TrendingDown"} size={13} />{k.delta}
              </span>
            )}
          </div>
        </RevealItem>
      ))}
    </RevealGroup>
  );
}

/* ── 3. AI actions bar ───────────────────────────────────────────────────── */

const AI_ACTIONS = [
  { label: "מצא נכסים חמים", href: "#hot-properties" },
  { label: "נכסים ללא לידים", href: "#attention" },
  { label: "צור פוסטים לנכסים חדשים", href: "/creative" },
  { label: "מצא קונים מתאימים", href: "/buyers" },
  { label: "דוח שוק", href: "/market" },
];

function AIActionsBar() {
  return (
    <div className="bg-card border-line rounded-[22px] border p-4 shadow-[var(--shadow-card)] sm:p-5">
      <p className="text-ink mb-3 text-sm font-extrabold">מה תרצה לעשות היום?</p>
      <div className="flex flex-wrap items-center gap-2">
        {AI_ACTIONS.map((a) => (
          <Link key={a.label} href={a.href} scroll className="bg-brand-soft text-brand-strong hover:bg-brand-soft/70 rounded-full px-3.5 py-2 text-[13px] font-bold transition-colors">
            {a.label}
          </Link>
        ))}
        <span className="bg-brand text-white ms-auto grid h-9 w-9 place-items-center rounded-full">
          <Icon name="Sparkles" size={16} />
        </span>
      </div>
    </div>
  );
}

/* ── 4. Attention center (derived from real rows) ────────────────────────── */

interface AttentionItem { tone: BadgeTone; status: string; title: string; text: string; cta: string; href: string }

function buildAttention(properties: PropertyRow[], covers: Record<string, string>): AttentionItem[] {
  const out: AttentionItem[] = [];
  for (const p of properties) {
    if (TERMINAL.has(p.status)) continue;
    const addr = propertyAddressLine(p);
    const stale = daysSince(p.updated_at);
    if (!coverFor(p, covers)) {
      out.push({ tone: "warning", status: "שיווק", title: addr, text: "אין תמונות מקצועיות", cta: "הזמן צילום", href: `/properties/${p.id}` });
    } else if (stale >= 14) {
      out.push({ tone: "danger", status: "בסיכון", title: addr, text: `לא עודכן ${stale} ימים`, cta: "טפל עכשיו", href: `/properties/${p.id}` });
    } else if (!p.marketing_description && !p.ai_description) {
      out.push({ tone: "neutral", status: "מעקב", title: addr, text: "חסר תיאור שיווקי", cta: "הוסף תיאור", href: `/properties/${p.id}/edit` });
    } else if (p.price_per_sqm && p.price_per_sqm > 28000) {
      out.push({ tone: "danger", status: "בסיכון", title: addr, text: "המחיר גבוה מהממוצע באזור", cta: "בדוק מחיר", href: `/properties/${p.id}` });
    }
    if (out.length >= 6) break;
  }
  return out;
}

function AttentionCenter({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="bg-success-soft/50 border-success/20 rounded-[22px] border p-6 text-center">
        <Icon name="BadgeCheck" size={28} className="text-success mx-auto" />
        <p className="text-ink mt-2 text-sm font-bold">הכל תחת שליטה — אין נכסים שדורשים טיפול מיידי כרגע.</p>
      </div>
    );
  }
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
      {items.map((a, i) => (
        <div key={i} className="bg-card border-line flex min-w-[240px] max-w-[260px] flex-col gap-2 rounded-2xl border p-4 shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-2">
            <Icon name={a.tone === "danger" ? "AlertTriangle" : a.tone === "warning" ? "Megaphone" : "Clock"} size={15} className={a.tone === "danger" ? "text-danger" : a.tone === "warning" ? "text-warning" : "text-muted"} />
            <Badge tone={a.tone} size="sm">{a.status}</Badge>
          </div>
          <p className="text-ink text-sm font-extrabold leading-snug">{a.title}</p>
          <p className="text-muted text-xs">{a.text}</p>
          <Link href={a.href} className="bg-brand-soft text-brand-strong mt-1 rounded-lg px-3 py-2 text-center text-[13px] font-bold">{a.cta}</Link>
        </div>
      ))}
    </div>
  );
}

/* ── 5. Smart opportunities (mock buyer matches) ─────────────────────────── */

interface Opportunity { buyer: string; criteria: string; budget: string; matches: { title: string; score: number }[]; cta: string }
const OPPORTUNITIES: Opportunity[] = [
  { buyer: "משפחת כהן", criteria: "4-5 חדרים בקרית ביאליק", budget: "תקציב עד ₪2.6M", matches: [{ title: "גושן 90, מוצקין", score: 92 }, { title: "קק״ל 54, קרית ביאליק", score: 88 }], cta: "שלח הצעה" },
  { buyer: "משפחת לוי", criteria: "פנטהאוז בחיפה", budget: "תקציב עד ₪4M", matches: [{ title: "שדרות ירושלים 22", score: 84 }], cta: "צור קשר" },
  { buyer: "משקיע — עמיר", criteria: "2-3 חדרים להשקעה", budget: "תקציב עד ₪1.6M", matches: [{ title: "הרצל 15, חיפה", score: 85 }, { title: "שמעוני 6, חיפה", score: 83 }], cta: "צור קשר" },
];

function SmartOpportunities() {
  return (
    <RevealGroup className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {OPPORTUNITIES.map((o) => (
        <RevealItem key={o.buyer}>
          <div className="bg-card border-line flex h-full flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-center gap-2">
              <span className="bg-brand-soft text-brand-strong grid h-9 w-9 place-items-center rounded-full text-sm font-black">{o.buyer.slice(0, 1)}</span>
              <div>
                <p className="text-ink text-sm font-extrabold">{o.buyer}</p>
                <p className="text-muted text-[11px]">{o.criteria}</p>
              </div>
            </div>
            <p className="text-muted text-xs font-bold">{o.budget}</p>
            <div className="border-line flex flex-col gap-1.5 border-t pt-3">
              {o.matches.map((m) => (
                <div key={m.title} className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-ink truncate font-medium">{m.title}</span>
                  <span className="text-success font-black">{m.score}%</span>
                </div>
              ))}
            </div>
            <Link href="/buyers" className="bg-brand text-white mt-auto rounded-lg px-3 py-2 text-center text-[13px] font-bold">{o.cta}</Link>
          </div>
        </RevealItem>
      ))}
    </RevealGroup>
  );
}

/* ── 6. Hot properties carousel (real rows) ──────────────────────────────── */

const STUDIO_LINKS = (id: string) => [
  { label: "פרסם", icon: "Megaphone", href: `/properties/${id}` },
  { label: "צור פוסט", icon: "Sparkles", href: `/creative-studio/property/${id}` },
  { label: "סטורי", icon: "Image", href: `/creative-studio/property/${id}` },
  { label: "AI", icon: "Sparkles", href: `/creative-studio/property/${id}` },
];

function HotPropertyCard({ p, cover }: { p: PropertyRow; cover: string | null }) {
  const score = scoreOf(p);
  const tone = scoreTone(score);
  const statusTone = (PROPERTY_STATUS_TONES[p.status] ?? "neutral") as BadgeTone;
  return (
    <div className="bg-card border-line flex min-w-[300px] max-w-[320px] flex-col overflow-hidden rounded-[22px] border shadow-[var(--shadow-card)]">
      <div className="bg-surface relative aspect-square w-full overflow-hidden">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={p.title} className="absolute inset-0 h-full w-full object-cover object-center" />
        ) : (
          <div className="text-muted absolute inset-0 grid place-items-center"><Icon name="Building2" size={34} /></div>
        )}
        <span className="absolute start-3 top-3"><Badge tone={statusTone} size="sm">{PROPERTY_STATUS_LABELS[p.status]}</Badge></span>
        <span className={cn("bg-card absolute end-3 top-3 grid h-11 w-11 place-items-center rounded-full text-sm font-black ring-2", tone.ring, tone.text)}>{score}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-ink text-base font-extrabold leading-snug">{p.title}</p>
        <p className="text-muted text-xs">{propertyAddressLine(p)}{p.city ? `, ${p.city}` : ""}</p>
        <p className="text-brand-strong text-lg font-black">{p.price ? ils(p.price) : "—"}</p>
        <div className="text-muted flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] font-medium">
          <span>{p.rooms ?? "—"} חדרים</span><span className="bg-line h-3 w-px" />
          <span>{p.size_sqm ?? "—"} מ״ר</span><span className="bg-line h-3 w-px" />
          <span>קומה {p.floor ?? "—"}</span>
        </div>
        <div className="border-line mt-1 grid grid-cols-2 gap-1.5 border-t pt-2.5">
          {STUDIO_LINKS(p.id).map((s) => (
            <Link key={s.label} href={s.href} className="bg-surface text-ink hover:bg-brand-soft hover:text-brand-strong inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors">
              <Icon name={s.icon} size={12} />{s.label}
            </Link>
          ))}
        </div>
        <Link href={`/properties/${p.id}`} className="bg-brand text-white mt-1 inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-[13px] font-bold">
          כניסה לנכס <Icon name="ChevronLeft" size={14} />
        </Link>
      </div>
    </div>
  );
}

function HotPropertiesCarousel({ properties, covers }: { properties: PropertyRow[]; covers: Record<string, string> }) {
  if (properties.length === 0) {
    return <p className="text-muted bg-card border-line rounded-[22px] border p-6 text-center text-sm">אין נכסים חמים עדיין — הוסף נכס ראשון כדי לראות אותו כאן.</p>;
  }
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar">
      {properties.map((p) => <HotPropertyCard key={p.id} p={p} cover={coverFor(p, covers)} />)}
    </div>
  );
}

/* ── 7. Market map (mock heat) ───────────────────────────────────────────── */

const MAP_PINS = [
  { top: "22%", start: "18%", n: 8, tone: "bg-danger" },
  { top: "40%", start: "55%", n: 6, tone: "bg-success" },
  { top: "62%", start: "32%", n: 3, tone: "bg-warning" },
  { top: "34%", start: "78%", n: 7, tone: "bg-success" },
  { top: "70%", start: "68%", n: 4, tone: "bg-brand" },
];

function MarketMapSection() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
      <div className="bg-card border-line relative aspect-[16/9] overflow-hidden rounded-[22px] border shadow-[var(--shadow-card)] lg:aspect-auto">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-soft via-surface to-success-soft/40" />
        <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(var(--color-line) 1px, transparent 1px), linear-gradient(90deg, var(--color-line) 1px, transparent 1px)", backgroundSize: "44px 44px", opacity: 0.5 }} />
        {MAP_PINS.map((p, i) => (
          <div key={i} className="absolute" style={{ top: p.top, insetInlineStart: p.start }}>
            <span className={cn("zono-pulse relative grid h-9 w-9 place-items-center rounded-full text-xs font-black text-white shadow-lg", p.tone)}>{p.n}</span>
          </div>
        ))}
        <div className="bg-card/90 border-line absolute bottom-3 start-3 rounded-xl border px-3 py-2 text-[11px] font-bold backdrop-blur">
          <span className="text-ink">מפת השוק החיה</span>
          <div className="text-muted mt-1 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1"><span className="bg-danger h-2 w-2 rounded-full" />ביקוש גבוה</span>
            <span className="inline-flex items-center gap-1"><span className="bg-warning h-2 w-2 rounded-full" />בינוני</span>
            <span className="inline-flex items-center gap-1"><span className="bg-success h-2 w-2 rounded-full" />נמוך</span>
          </div>
        </div>
      </div>
      <div className="bg-card border-line flex flex-col gap-3 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
        <p className="text-ink text-base font-black">קרית ביאליק</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { l: "נכסים פעילים", v: "14" },
            { l: "מחיר ממוצע", v: "₪2.1M" },
            { l: "ביקוש", v: "+12%", up: true },
            { l: "קונים מחפשים", v: "7" },
          ].map((s) => (
            <div key={s.l} className="bg-surface rounded-xl p-3">
              <p className="text-muted text-[11px] font-bold">{s.l}</p>
              <p className={cn("text-lg font-black", s.up ? "text-success" : "text-ink")}>{s.v}</p>
            </div>
          ))}
        </div>
        <Link href="/market" className="bg-brand-soft text-brand-strong mt-auto rounded-xl px-3 py-2.5 text-center text-sm font-bold">פתח מפה מלאה</Link>
      </div>
    </div>
  );
}

/* ── 8. Pipeline (real rows by status) ───────────────────────────────────── */

const PIPELINE_COLS: { key: string; label: string; statuses: string[]; tone: string }[] = [
  { key: "new", label: "נכסים חדשים", statuses: ["draft"], tone: "text-muted" },
  { key: "marketing", label: "בשיווק", statuses: ["ready", "published"], tone: "text-brand-strong" },
  { key: "active", label: "פעילים", statuses: ["active"], tone: "text-success" },
  { key: "negotiation", label: "במשא ומתן", statuses: ["under_offer", "in_contract"], tone: "text-warning" },
  { key: "sold", label: "נמכר", statuses: ["sold", "rented"], tone: "text-danger" },
];

function PropertyPipeline({ properties, covers }: { properties: PropertyRow[]; covers: Record<string, string> }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
      {PIPELINE_COLS.map((col) => {
        const items = properties.filter((p) => col.statuses.includes(p.status));
        return (
          <div key={col.key} className="bg-surface/60 border-line flex min-w-[230px] max-w-[250px] flex-col gap-2 rounded-2xl border p-3">
            <div className="flex items-center justify-between px-1">
              <span className={cn("text-sm font-extrabold", col.tone)}>{col.label}</span>
              <span className="bg-card text-muted rounded-full px-2 py-0.5 text-[11px] font-bold">{items.length}</span>
            </div>
            {items.slice(0, 4).map((p) => {
              const cover = coverFor(p, covers);
              return (
              <Link key={p.id} href={`/properties/${p.id}`} className="bg-card border-line flex items-center gap-2 rounded-xl border p-2 shadow-[var(--shadow-soft)]">
                <span className="bg-surface text-muted grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg">
                  {cover
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={cover} alt="" className="h-full w-full object-cover" />
                    : <Icon name="Building2" size={15} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-xs font-bold">{p.title}</p>
                  <p className="text-brand-strong text-[11px] font-black">{p.price ? ilsCompact(p.price) : "—"}</p>
                </div>
                <span className="text-success text-[11px] font-black">{scoreOf(p)}</span>
              </Link>
              );
            })}
            <Link href="/properties/new" className="text-muted hover:text-brand-strong rounded-lg py-1.5 text-center text-[11px] font-bold">+ הוסף נכס</Link>
          </div>
        );
      })}
    </div>
  );
}

/* ── 9. Property studio (mock actions) ───────────────────────────────────── */

const STUDIO_ACTIONS = [
  { label: "צור פוסט", icon: "Image" }, { label: "צור סטורי", icon: "Sparkles" },
  { label: "צור רילס", icon: "Presentation" }, { label: "קמפיין פייסבוק", icon: "Megaphone" },
  { label: "דיוור ללקוחות", icon: "Mail" }, { label: "קמפיין וואטסאפ", icon: "MessageCircle" },
  { label: "פלייר דיגיטלי", icon: "FileText" }, { label: "עוד פעולות", icon: "LayoutGrid" },
];

function PropertyStudio({ top }: { top: PropertyRow | null }) {
  const id = top?.id;
  return (
    <div className="bg-gradient-to-br from-brand-soft to-surface border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="bg-card border-line flex w-full shrink-0 flex-col gap-2 rounded-2xl border p-4 lg:w-64">
          <span className="text-muted text-[11px] font-bold">נכס נבחר</span>
          <p className="text-ink text-base font-extrabold">{top ? `${propertyAddressLine(top)}` : "בחר נכס"}</p>
          <div className="flex items-center gap-2">
            <span className="text-success text-2xl font-black">{top ? scoreOf(top) : "—"}</span>
            <span className="text-muted text-xs">/ 100</span>
          </div>
          <Link href={id ? `/properties/${id}` : "/properties"} className="bg-brand text-white mt-1 rounded-lg px-3 py-2 text-center text-[13px] font-bold">כניסה לנכס</Link>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-2.5 sm:grid-cols-4">
          {STUDIO_ACTIONS.map((a) => (
            <Link key={a.label} href={id ? `/creative-studio/property/${id}` : "/creative"} className="bg-card border-line hover:shadow-[var(--shadow-lift)] flex flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-center transition-shadow">
              <span className="bg-brand-soft text-brand-strong grid h-10 w-10 place-items-center rounded-xl"><Icon name={a.icon} size={18} /></span>
              <span className="text-ink text-[12px] font-bold">{a.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── 10. Market intelligence (mock) ──────────────────────────────────────── */

const MARKET_INTEL = [
  { icon: "TrendingUp", tone: "text-success", title: "מחירי דירות בקרית ביאליק עלו 6.4%", sub: "ב-12 החודשים האחרונים" },
  { icon: "Clock", tone: "text-brand-strong", title: "זמן מכירה ממוצע ירד 8%", sub: "מהיר מהרבעון הקודם" },
  { icon: "Users", tone: "text-success", title: "ביקוש ל-5 חדרים עלה 23%", sub: "מגמה חזקה באזור" },
  { icon: "Handshake", tone: "text-ink", title: "12 עסקאות אחרונות באזור", sub: "30 הימים האחרונים" },
  { icon: "MapPin", tone: "text-warning", title: "רחובות עם ביקוש גבוה", sub: "שדרות ירושלים, קק״ל, גושן" },
  { icon: "Tag", tone: "text-danger", title: "נכסים מתחת למחיר השוק", sub: "3 הזדמנויות רכישה" },
];

function MarketIntelligence() {
  return (
    <RevealGroup className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {MARKET_INTEL.map((m) => (
        <RevealItem key={m.title}>
          <div className="bg-card border-line flex h-full items-start gap-3 rounded-[22px] border p-4 shadow-[var(--shadow-soft)]">
            <span className="bg-surface grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Icon name={m.icon} size={18} className={m.tone} /></span>
            <div>
              <p className="text-ink text-sm font-extrabold leading-snug">{m.title}</p>
              <p className="text-muted mt-0.5 text-xs">{m.sub}</p>
            </div>
          </div>
        </RevealItem>
      ))}
    </RevealGroup>
  );
}

/* ── 11. Sticky AI Copilot panel (mock + nav) ────────────────────────────── */

function StickyAICopilotPanel({ atRisk, needMarketing }: { atRisk: number; needMarketing: number }) {
  const cards = [
    { icon: "AlertTriangle", tone: "text-danger", bg: "bg-danger-soft", title: `${atRisk} נכסים בסיכון`, sub: "עלולים לאבד בלעדיות", href: "#attention" },
    { icon: "Users", tone: "text-success", bg: "bg-success-soft", title: "2 קונים מוכנים לפגישה", sub: "התאמה גבוהה", href: "/buyers" },
    { icon: "Megaphone", tone: "text-brand-strong", bg: "bg-brand-soft", title: `${needMarketing} נכסים צריכים שיווק`, sub: "אין פעילות אחרונה", href: "/creative" },
  ];
  return (
    <aside className="hidden w-[300px] shrink-0 xl:block">
      <div className="sticky top-6 flex flex-col gap-4">
        <div className="bg-gradient-to-br from-brand to-brand-strong rounded-[22px] p-5 text-white shadow-[var(--shadow-lift)]">
          <div className="flex items-center gap-2">
            <Icon name="Sparkles" size={18} />
            <p className="text-base font-black">AI Copilot</p>
            <span className="bg-white/15 rounded-full px-2 py-0.5 text-[10px] font-bold">BETA</span>
          </div>
          <p className="text-white/80 mt-0.5 text-xs">תמיד כאן לעזור</p>
          <div className="mt-4 flex flex-col gap-2">
            {cards.map((c) => (
              <Link key={c.title} href={c.href} className="bg-white/10 hover:bg-white/15 flex items-center gap-2.5 rounded-xl p-2.5 transition-colors">
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", c.bg, c.tone)}><Icon name={c.icon} size={15} /></span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold">{c.title}</p>
                  <p className="text-white/70 truncate text-[11px]">{c.sub}</p>
                </div>
              </Link>
            ))}
          </div>
          <button className="bg-white text-brand-strong mt-4 w-full rounded-xl px-3 py-2.5 text-sm font-black">שאל את ZONO</button>
        </div>

        <div className="bg-card border-line rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
          <p className="text-ink mb-2 text-sm font-extrabold">פעולות מהירות</p>
          <div className="flex flex-col gap-1">
            {[
              { l: "הוסף נכס חדש", i: "Plus", h: "/properties/new" },
              { l: "הוסף קונה", i: "UserPlus", h: "/buyers/new" },
              { l: "צור שיווק", i: "Megaphone", h: "/creative" },
              { l: "ייבא נכסים", i: "Download", h: "?inv=external" },
            ].map((q) => (
              <Link key={q.l} href={q.h} className="text-ink hover:bg-surface flex items-center gap-2 rounded-lg px-2 py-2 text-[13px] font-bold transition-colors">
                <span className="text-brand-strong"><Icon name={q.i} size={15} /></span>{q.l}
              </Link>
            ))}
          </div>
        </div>

        <div className="bg-card border-line rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
          <p className="text-ink mb-2 text-sm font-extrabold">פעילות אחרונה</p>
          <div className="flex flex-col gap-2.5">
            {[
              { t: "ליד חדש לנכס בקרית ביאליק", d: "לפני שעה" },
              { t: "פגישה נקבעה עם משפחת כהן", d: "לפני 3 שעות" },
              { t: "פוסט שיווק פורסם", d: "אתמול" },
            ].map((a) => (
              <div key={a.t} className="flex items-start gap-2">
                <span className="bg-brand mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                <div>
                  <p className="text-ink text-xs font-bold leading-snug">{a.t}</p>
                  <p className="text-muted text-[11px]">{a.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ── Root ────────────────────────────────────────────────────────────────── */

export function PropertiesOSView({
  properties,
  agentName,
  covers = {},
  children,
}: {
  properties: PropertyRow[];
  agentName: string;
  /** property_id → resolved cover image (from property_media), so a property's
   *  real image always shows even when primary_image_url is null. */
  covers?: Record<string, string>;
  /** The existing inventory tabs + list/external section (preserves filters). */
  children: ReactNode;
}) {
  const activeProps = useMemo(() => properties.filter((p) => !TERMINAL.has(p.status)), [properties]);
  const hot = useMemo(() => [...properties].sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 8), [properties]);
  const attention = useMemo(() => buildAttention(properties, covers), [properties, covers]);
  const needMarketing = useMemo(() => properties.filter((p) => !TERMINAL.has(p.status) && !coverFor(p, covers)).length, [properties, covers]);
  const potentialCommission = useMemo(() => activeProps.reduce((s, p) => s + (p.price ?? 0) * 0.02, 0), [activeProps]);

  const kpis: Kpi[] = [
    { label: "נכסים פעילים", value: String(activeProps.length), icon: "Building2", tone: "bg-brand-soft text-brand-strong", delta: "מהחודש שעבר", deltaUp: true, highlight: true },
    { label: "נכסים חמים", value: String(properties.filter((p) => scoreOf(p) >= 85).length), icon: "Flame", tone: "bg-danger-soft text-danger" },
    { label: "דורשים טיפול", value: String(attention.length), icon: "AlertTriangle", tone: "bg-warning-soft text-warning" },
    { label: "עמלות פוטנציאליות", value: ilsCompact(potentialCommission), icon: "Wallet", tone: "bg-success-soft text-success", delta: "החודש", deltaUp: true },
  ];

  return (
    <div dir="rtl" className="flex flex-col gap-8 xl:flex-row xl:items-start xl:gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-8">
        <Reveal><PropertiesHero agentName={agentName} /></Reveal>
        <PropertyKpiCards kpis={kpis} />
        <AIActionsBar />

        <section id="attention" className="flex flex-col gap-3 scroll-mt-6">
          <SectionTitle title="דורש טיפול מיידי" action={<ViewAll />} />
          <AttentionCenter items={attention} />
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle title="הזדמנויות חדשות" action={<ViewAll href="/buyers" />} />
          <SmartOpportunities />
        </section>

        <section id="hot-properties" className="flex flex-col gap-3 scroll-mt-6">
          <SectionTitle title="הנכסים החמים שלך" action={<ViewAll />} />
          <HotPropertiesCarousel properties={hot} covers={covers} />
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle title="מפת השוק החיה" action={<ViewAll href="/market" />} />
          <MarketMapSection />
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle title="צינור העסקאות" action={<ViewAll />} />
          <PropertyPipeline properties={properties} covers={covers} />
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle title="כל הנכסים" />
          {children}
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle title="סטודיו הנכס" />
          <PropertyStudio top={hot[0] ?? null} />
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle title="מודיעין שוק" action={<ViewAll href="/market" />} />
          <MarketIntelligence />
        </section>
      </div>

      <StickyAICopilotPanel atRisk={attention.filter((a) => a.status === "בסיכון").length} needMarketing={needMarketing} />
    </div>
  );
}
