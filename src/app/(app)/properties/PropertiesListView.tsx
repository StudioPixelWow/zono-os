"use client";

// ============================================================================
// ZONO — INVENTORY EXPLORER. A bounded, operational replacement for the endless
// "כל הנכסים" card wall: URL-persisted server filters (city/type/status/price/
// rooms) + client search, quick-filter chips, sort, grid/list, and load-more
// pagination (never renders the whole inventory at once). Attention is derived
// from real fields via the pure inventory-center module — no fabricated signals.
// ============================================================================
import { useMemo, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { RealEstatePropertyCard } from "@/components/property/RealEstatePropertyCard";
import { normalizeListingKind, transactionBadge, formatPropertyPrice } from "@/lib/property/transaction";
import { ContextualZeroState } from "@/components/common/ContextualZeroState";
import {
  PROPERTY_STATUS_LABELS, PROPERTY_STATUS_OPTIONS, PROPERTY_STATUS_TONES,
  PROPERTY_TYPE_LABELS, PROPERTY_TYPE_OPTIONS, propertyAddressLine, type PropertyRow,
} from "@/lib/properties/labels";
import {
  attentionFor, sortRows, paginate, SORT_OPTIONS, isSortKey, PAGE_SIZE,
  type SortKey, type AttentionKey,
} from "@/lib/properties/inventory-center";

interface Filters { city?: string; type?: string; status?: string; minPrice?: number; maxPrice?: number; minRooms?: number; maxRooms?: number }

const field = "bg-surface border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none transition";
const ATT_TONE: Record<string, string> = { warning: "bg-warning-soft text-warning", danger: "bg-danger-soft text-danger", neutral: "bg-surface text-muted" };

type QuickChip = "all" | "sale" | "rent" | "exclusive" | "draft" | "matches" | "attention";
const CHIPS: { id: QuickChip; label: string }[] = [
  { id: "all", label: "הכל" }, { id: "sale", label: "למכירה" }, { id: "rent", label: "להשכרה" },
  { id: "exclusive", label: "בלעדיות" }, { id: "matches", label: "עם קונים מתאימים" },
  { id: "draft", label: "טיוטה / לא פורסם" }, { id: "attention", label: "דורשים טיפול" },
];

type AgentInfo = { name: string; avatarUrl: string | null };

export function PropertiesListView({
  properties, filters, error, currentUserId = null, covers = {}, agents = {}, matchCounts = {},
  eyebrow = "CRM נכסים", title = "כל הנכסים", initialAttention = null,
}: {
  properties: PropertyRow[]; filters: Filters; error?: boolean; currentUserId?: string | null;
  covers?: Record<string, string>; agents?: Record<string, AgentInfo>; matchCounts?: Record<string, number>;
  eyebrow?: string; title?: string;
  /** deep-linked attention key from the ZONO brief (e.g. ?attention=no_image). */
  initialAttention?: AttentionKey | null;
}) {
  const [now] = useState(() => Date.now());
  const hasCover = useMemo(() => {
    const s = new Set<string>();
    for (const p of properties) if (covers[p.id] || p.primary_image_url) s.add(p.id);
    return (id: string) => s.has(id);
  }, [properties, covers]);

  const [view, setView] = useState<"cards" | "table">("cards");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [chip, setChip] = useState<QuickChip>(initialAttention ? "attention" : "all");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let rows = properties.filter((p) => {
      if (needle) {
        const hay = `${p.title ?? ""} ${propertyAddressLine(p)} ${p.city ?? ""} ${p.neighborhood ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      const kind = normalizeListingKind(p.listing_kind);
      switch (chip) {
        case "sale": if (kind !== "sale") return false; break;
        case "rent": if (kind !== "rent") return false; break;
        case "exclusive": if (!p.has_exclusivity) return false; break;
        case "matches": if ((matchCounts[p.id] ?? 0) <= 0) return false; break;
        case "draft": if (p.status !== "draft") return false; break;
        case "attention": {
          const a = attentionFor(p, hasCover(p.id), now);
          if (!a) return false;
          if (initialAttention && a.key !== initialAttention) return false;
          break;
        }
      }
      return true;
    });
    rows = sortRows(rows, sort, hasCover, now);
    return rows;
  }, [properties, q, chip, sort, hasCover, now, initialAttention, matchCounts]);

  const paged = paginate(filtered, page);

  return (
    <section className="flex flex-col gap-5">
      {/* Header + view toggle + new */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-brand text-xs font-bold tracking-wide">{eyebrow}</p>
          <h2 className="text-ink text-xl font-black sm:text-2xl">{title} <span className="text-muted text-base font-bold">· {filtered.length}</span></h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-card border-line flex overflow-hidden rounded-xl border">
            <button type="button" onClick={() => setView("cards")} aria-label="תצוגת כרטיסים" aria-pressed={view === "cards"} className={cn("grid h-9 w-9 place-items-center transition", view === "cards" ? "bg-brand-soft text-brand-strong" : "text-muted")}><Icon name="LayoutGrid" size={18} /></button>
            <button type="button" onClick={() => setView("table")} aria-label="תצוגת רשימה" aria-pressed={view === "table"} className={cn("grid h-9 w-9 place-items-center transition", view === "table" ? "bg-brand-soft text-brand-strong" : "text-muted")}><Icon name="List" size={18} /></button>
          </div>
          <Link href="/properties/new"><Button leadingIcon={<Icon name="Plus" size={18} strokeWidth={2.2} />}>נכס חדש</Button></Link>
        </div>
      </div>

      {/* Control bar: search + sort + quick chips */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <span className="text-muted pointer-events-none absolute inset-y-0 start-3 grid place-items-center"><Icon name="Search" size={16} /></span>
            <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="חיפוש: כותרת / כתובת / עיר" className={cn(field, "ps-9")} />
          </div>
          <select value={sort} onChange={(e) => { if (isSortKey(e.target.value)) setSort(e.target.value); }} className={cn(field, "w-auto")} aria-label="מיון">
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((c) => (
            <button key={c.id} type="button" onClick={() => { setChip(c.id); setPage(1); }}
              className={cn("rounded-full px-3.5 py-1.5 text-[12.5px] font-bold transition", chip === c.id ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink")}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced filters (URL-persisted, server refetch) */}
      <details className="bg-card border-line rounded-[18px] border">
        <summary className="text-ink cursor-pointer select-none px-4 py-3 text-[13px] font-bold">סינון מתקדם (עיר · סוג · סטטוס · מחיר · חדרים)</summary>
        <form method="get" className="grid grid-cols-2 gap-3 p-4 pt-0 sm:grid-cols-3 lg:grid-cols-7">
          <input name="city" defaultValue={filters.city ?? ""} placeholder="עיר" className={field} />
          <select name="type" defaultValue={filters.type ?? ""} className={field}><option value="">כל הסוגים</option>{PROPERTY_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <select name="status" defaultValue={filters.status ?? ""} className={field}><option value="">כל הסטטוסים</option>{PROPERTY_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <input name="minPrice" type="number" defaultValue={filters.minPrice ?? ""} placeholder="מחיר מ-" className={field} />
          <input name="maxPrice" type="number" defaultValue={filters.maxPrice ?? ""} placeholder="מחיר עד" className={field} />
          <input name="minRooms" type="number" step="0.5" defaultValue={filters.minRooms ?? ""} placeholder="חדרים מ-" className={field} />
          <input name="maxRooms" type="number" step="0.5" defaultValue={filters.maxRooms ?? ""} placeholder="חדרים עד" className={field} />
          <div className="col-span-2 flex gap-2 sm:col-span-3 lg:col-span-7"><Button type="submit" size="sm">סינון</Button><Link href="/my-properties" className="text-muted hover:text-ink self-center text-sm font-semibold">נקה</Link></div>
        </form>
      </details>

      {/* States */}
      {error ? (
        <div className="bg-danger-soft text-danger rounded-2xl px-4 py-3 text-sm font-semibold">לא ניתן לטעון את הנכסים כעת. נסה/י לרענן.</div>
      ) : properties.length === 0 ? (
        <ContextualZeroState icon="Building2" title="הנכס הראשון שלך מתחיל כאן." value="ברגע שתוסיף נכס, ZONO תתחיל למפות אותו, להתאים לו קונים, לבנות לו שיווק ולעקוב אחרי המסע שלו עד העסקה." cta="הוסף נכס ראשון" href="/properties/new" className="rounded-[24px] py-16" />
      ) : filtered.length === 0 ? (
        <div className="text-muted bg-card border-line rounded-[20px] border p-10 text-center text-sm font-semibold">אין נכסים שתואמים את הסינון. <button type="button" onClick={() => { setQ(""); setChip("all"); }} className="text-brand-strong font-bold">נקה סינון</button></div>
      ) : view === "cards" ? (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {paged.items.map((p) => {
              const att = attentionFor(p, hasCover(p.id), now);
              const mc = matchCounts[p.id] ?? 0;
              const agent = agents[p.id];
              return (
                <div key={p.id} className="relative">
                  {att && <span className={cn("absolute end-3 top-3 z-10 rounded-full px-2.5 py-1 text-[10.5px] font-black shadow-sm", ATT_TONE[att.tone])}>דורש טיפול · {att.reason}</span>}
                  <RealEstatePropertyCard d={{
                    href: `/properties/${p.id}`, title: p.title, imageUrl: covers[p.id] ?? p.primary_image_url,
                    statusLabel: PROPERTY_STATUS_LABELS[p.status], statusTone: PROPERTY_STATUS_TONES[p.status],
                    dealLabel: transactionBadge(normalizeListingKind(p.listing_kind))?.label ?? null,
                    dealTone: normalizeListingKind(p.listing_kind) === "rent" ? "success" : "brand",
                    priceLabel: formatPropertyPrice({ kind: normalizeListingKind(p.listing_kind), price: p.price, monthlyRent: p.monthly_rent }),
                    addressLine: `${PROPERTY_TYPE_LABELS[p.type]} · ${propertyAddressLine(p)}`,
                    rooms: p.rooms, sqm: p.size_sqm, floor: p.floor, parking: p.parking_count,
                    tags: mc > 0 ? [`${mc} קונים מתאימים`] : undefined,
                    agentName: agent?.name ?? null, agentAvatarUrl: agent?.avatarUrl ?? null,
                  }} />
                </div>
              );
            })}
          </div>
          {paged.page < paged.pages && (
            <div className="flex justify-center pt-1">
              <button type="button" onClick={() => setPage((n) => n + 1)} className="bg-card border-line text-ink hover:border-brand-light rounded-xl border px-6 py-2.5 text-[13px] font-bold shadow-[var(--shadow-soft)] transition">
                טען עוד ({paged.total - paged.items.length})
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="bg-card border-line overflow-x-auto rounded-[20px] border">
            <table className="w-full min-w-[720px] text-start text-sm">
              <thead className="text-muted border-line border-b text-xs"><tr>{["נכס", "סוכן", "סוג", "סטטוס", "מחיר", "חד׳", "מ״ר", "קונים", "טיפול"].map((h) => <th key={h} className="px-4 py-3 text-start font-bold">{h}</th>)}</tr></thead>
              <tbody>
                {paged.items.map((p) => {
                  const att = attentionFor(p, hasCover(p.id), now);
                  const k = normalizeListingKind(p.listing_kind); const b = transactionBadge(k);
                  const agent = agents[p.id]; const mc = matchCounts[p.id] ?? 0;
                  return (
                    <tr key={p.id} className="border-line hover:bg-surface border-b last:border-0">
                      <td className="px-4 py-3"><Link href={`/properties/${p.id}`} className="text-ink font-bold hover:text-brand">{p.title}</Link><p className="text-muted text-xs">{propertyAddressLine(p)}</p></td>
                      <td className="px-4 py-3">{agent ? (
                        <span className="flex items-center gap-2">
                          {agent.avatarUrl
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={agent.avatarUrl} alt={agent.name} className="h-6 w-6 shrink-0 rounded-full object-cover" />
                            : <span className="bg-brand-soft text-brand-strong grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-black">{agent.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}</span>}
                          <span className="text-ink truncate text-xs font-semibold">{agent.name}</span>
                        </span>
                      ) : <span className="text-muted text-xs">—</span>}</td>
                      <td className="text-muted px-4 py-3">{PROPERTY_TYPE_LABELS[p.type]}</td>
                      <td className="px-4 py-3"><Badge tone={PROPERTY_STATUS_TONES[p.status]} size="sm">{PROPERTY_STATUS_LABELS[p.status]}</Badge></td>
                      <td className="px-4 py-3"><span className="flex flex-col gap-0.5">{b && <span className={`inline-block w-fit rounded px-1.5 py-0.5 text-[10px] font-bold ${b.tone === "success" ? "bg-success-soft text-success" : "bg-brand-soft text-brand-strong"}`}>{b.label}</span>}<span className="text-ink font-bold">{formatPropertyPrice({ kind: k, price: p.price, monthlyRent: p.monthly_rent })}</span></span></td>
                      <td className="text-muted px-4 py-3">{p.rooms ?? "—"}</td>
                      <td className="text-muted px-4 py-3">{p.size_sqm ?? "—"}</td>
                      <td className="px-4 py-3">{mc > 0 ? <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-black">{mc}</span> : <span className="text-muted text-xs">—</span>}</td>
                      <td className="px-4 py-3">{att ? <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-black", ATT_TONE[att.tone])}>{att.reason}</span> : <span className="text-success text-xs">✓</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {paged.page < paged.pages && (
            <div className="flex justify-center pt-1"><button type="button" onClick={() => setPage((n) => n + 1)} className="bg-card border-line text-ink hover:border-brand-light rounded-xl border px-6 py-2.5 text-[13px] font-bold transition">טען עוד ({paged.total - paged.items.length})</button></div>
          )}
        </>
      )}
    </section>
  );
}
