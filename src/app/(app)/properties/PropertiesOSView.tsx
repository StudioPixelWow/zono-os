"use client";

// ============================================================================
// ZONO — Properties INVENTORY COMMAND CENTER (הנכסים שלי).
// ----------------------------------------------------------------------------
// The daily inventory operating surface — NOT a catalog. First viewport answers
// "what's my inventory state" and "what needs me now": one compact header + a KPI
// strip, an evidence-gated ZONO brief, a DOMINANT "דורשים טיפול" queue, compact
// quick operations — then the bounded Inventory Explorer (children). Every signal
// is derived from real rows via the pure inventory-center module (no carousels,
// no fabricated buyers/scores, no mock studio). Reused by /my-properties and
// /office-inventory; the explorer + URL filters are preserved as `children`.
// ============================================================================
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { IconSurface, type Accent } from "@/components/ui/action-surfaces";
import { propertyAddressLine, PROPERTY_STATUS_LABELS, PROPERTY_STATUS_TONES, type PropertyRow } from "@/lib/properties/labels";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import {
  attentionFor, inventoryKpis, inventoryBrief, isTerminal, type Attention,
} from "@/lib/properties/inventory-center";

const coverFor = (p: PropertyRow, covers: Record<string, string>): string | null => covers[p.id] ?? p.primary_image_url ?? null;
const ils = (n: number) => (n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `₪${Math.round(n / 1000)}K` : `₪${Math.round(n).toLocaleString("he-IL")}`);

const KPI_ACCENT: Record<string, Accent> = { Building2: "brand", Handshake: "success", Home: "brand", AlertTriangle: "danger" };

interface Kpi { label: string; value: string; icon: string; highlight?: boolean }
function KpiStrip({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((k) => (
        <div key={k.label} className={cn("relative flex h-full flex-col gap-1 rounded-[22px] border p-4 shadow-[var(--shadow-card)]", k.highlight ? "zono-gradient-glow border-transparent text-white" : "bg-card border-line")}>
          <span className="absolute end-4 top-4">
            {k.highlight ? <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/15 text-white"><Icon name={k.icon} size={22} /></span> : <IconSurface name={k.icon} tier="m" accent={KPI_ACCENT[k.icon] ?? "brand"} variant="soft" />}
          </span>
          <span className={cn("text-[34px] font-black leading-none tracking-tight", k.highlight ? "text-white" : "text-ink")}>{k.value}</span>
          <span className={cn("text-xs font-bold", k.highlight ? "text-white/80" : "text-muted")}>{k.label}</span>
        </div>
      ))}
    </div>
  );
}

function ZonoBrief({ items }: { items: { key: string; text: string; href: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="bg-card border-line rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-brand text-white grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-black">Z</span>
        <div><p className="text-ink text-sm font-black leading-tight">זונו על המלאי שלך</p><p className="text-muted text-[11px]">מבוסס-ראיות בלבד</p></div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((b) => (
          <Link key={b.key} href={b.href} className="border-line hover:border-brand-light flex items-center justify-between gap-2 rounded-xl border p-3 transition">
            <span className="text-ink text-[12.5px] font-bold leading-tight">{b.text}</span>
            <span className="text-brand-strong shrink-0"><Icon name="ChevronLeft" size={15} /></span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function AttentionCard({ p, cover, att }: { p: PropertyRow; cover: string | null; att: Attention }) {
  const statusTone = (PROPERTY_STATUS_TONES[p.status] ?? "neutral") as BadgeTone;
  const toneText: Record<string, string> = { warning: "text-warning", danger: "text-danger", neutral: "text-muted" };
  return (
    <div className="bg-card border-line flex flex-col overflow-hidden rounded-[20px] border shadow-[var(--shadow-soft)]">
      <div className="flex items-stretch gap-3 p-3">
        <div className="bg-surface relative h-20 w-20 shrink-0 overflow-hidden rounded-xl">
          {cover
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={cover} alt={p.title} className="h-full w-full object-cover" />
            : <span className="text-muted grid h-full w-full place-items-center"><Icon name="Building2" size={24} /></span>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2">
            <Badge tone={statusTone} size="sm">{PROPERTY_STATUS_LABELS[p.status]}</Badge>
            {p.price ? <span className="text-brand-strong text-[12.5px] font-black">{ils(p.price)}</span> : null}
          </div>
          <p className="text-ink mt-0.5 line-clamp-1 text-[13.5px] font-black">{p.title}</p>
          <p className="text-muted line-clamp-1 text-[11.5px]">{propertyAddressLine(p)}</p>
          <p className={cn("mt-0.5 line-clamp-1 text-[11.5px] font-bold", toneText[att.tone])}>דורש טיפול: {att.reason}</p>
        </div>
      </div>
      <Link href={att.href} className="bg-brand-soft text-brand-strong m-3 mt-0 rounded-lg py-2 text-center text-[13px] font-bold">{att.cta}</Link>
    </div>
  );
}

const QUICK_OPS = [
  { label: "הוספת נכס", icon: "Plus", href: "/properties/new" },
  { label: "יצירת קריאייטיב", icon: "Sparkles", href: "/creative-studio" },
  { label: "מסמכים", icon: "FileText", href: "/documents" },
  { label: "קונים מתאימים", icon: "Users", href: "/buyers" },
  { label: "הערכת שווי", icon: "BarChart3", href: "/valuation" },
];
function QuickOps() {
  return (
    <div className="flex flex-wrap gap-2">
      {QUICK_OPS.map((a) => (
        <Link key={a.label} href={a.href} className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-[13px] font-bold shadow-[var(--shadow-soft)] transition">
          <span className="text-brand-strong"><Icon name={a.icon} size={16} /></span>{a.label}
        </Link>
      ))}
    </div>
  );
}

export function PropertiesOSView({ properties, agentName, covers = {}, children }: {
  properties: PropertyRow[]; agentName: string; covers?: Record<string, string>; children: ReactNode;
}) {
  const [now] = useState(() => Date.now());
  const hasCover = useMemo(() => {
    const s = new Set<string>();
    for (const p of properties) if (covers[p.id] || p.primary_image_url) s.add(p.id);
    return (id: string) => s.has(id);
  }, [properties, covers]);

  const kpisData = useMemo(() => inventoryKpis(properties, hasCover, now), [properties, hasCover, now]);
  const brief = useMemo(() => inventoryBrief(properties, hasCover, now), [properties, hasCover, now]);
  const attention = useMemo(() => {
    const out: { p: PropertyRow; att: Attention }[] = [];
    for (const p of properties) {
      if (isTerminal(p.status)) continue;
      const att = attentionFor(p, hasCover(p.id), now);
      if (att) out.push({ p, att });
      if (out.length >= 6) break;
    }
    return out;
  }, [properties, hasCover, now]);

  const kpis: Kpi[] = [
    { label: "נכסים פעילים", value: String(kpisData.active), icon: "Building2", highlight: true },
    { label: "בבלעדיות", value: String(kpisData.exclusive), icon: "Handshake" },
    { label: "למכירה", value: String(kpisData.forSale), icon: "Home" },
    { label: "דורשים טיפול", value: String(kpisData.needsAttention), icon: "AlertTriangle" },
  ];
  const subtitle = `${kpisData.active} נכסים פעילים${kpisData.needsAttention > 0 ? ` · ${kpisData.needsAttention} דורשים טיפול` : ""}${kpisData.forRent > 0 ? ` · ${kpisData.forRent} להשכרה` : ""}`;

  return (
    <div dir="rtl" className="flex flex-col gap-6">
      {/* INVENTORY NOW — compact header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted text-[12px] font-bold">שלום {agentName} 👋</p>
          <h1 className="text-ink text-2xl font-black sm:text-3xl">הנכסים שלי</h1>
          <p className="text-muted mt-0.5 text-sm font-semibold">{subtitle}</p>
        </div>
        <Link href="/properties/new" className="bg-brand text-white inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[14px] font-black shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5">
          <Icon name="Plus" size={18} strokeWidth={2.2} /> נכס חדש
        </Link>
      </div>

      <KpiStrip kpis={kpis} />
      <ZonoBrief items={brief} />

      {/* NEEDS ATTENTION — the dominant operational queue */}
      {attention.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-ink text-lg font-black sm:text-xl">דורשים טיפול</h2>
            <Link href="/my-properties?attention=no_image" className="text-brand-strong inline-flex items-center gap-1 text-sm font-bold">כל הדורשים טיפול <Icon name="ChevronLeft" size={15} /></Link>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {attention.map(({ p, att }) => <AttentionCard key={p.id} p={p} cover={coverFor(p, covers)} att={att} />)}
          </div>
        </section>
      )}

      {/* QUICK OPERATIONS */}
      <section className="flex flex-col gap-2">
        <h2 className="text-ink text-sm font-black">פעולות מהירות</h2>
        <QuickOps />
      </section>

      {/* INVENTORY EXPLORER (children) */}
      <section id="inventory" className="scroll-mt-6">{children}</section>
    </div>
  );
}
