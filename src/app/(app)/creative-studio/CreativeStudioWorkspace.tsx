"use client";
// ============================================================================
// ZONO — Creative Studio workspace (client island). A CREATE-first operating
// surface, not an archive: two modes (יצירה / ספרייה). CREATE = a Command Center
// that opens the CANONICAL per-entity studio (the real generation wizard lives
// there — we never duplicate a second engine) + quick-create entry points + one
// subtle ZONO helper + a fast-resume "recent" strip. LIBRARY = a bounded,
// query-paginated professional asset grid. All data is real (zono_quick_creative
// _outputs, org-scoped); the creative previews carry the color, the chrome stays
// calm. Opening/filtering/loading-more never reloads the server page.
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import type { SelectableEntity } from "@/lib/creative-studio/service";
import { ENTITY_LABELS, ENTITY_ICONS } from "@/lib/creative-studio/engine";
import {
  type CreativeCardView, type OrgCreativePage,
  CREATIVE_TYPE_LABEL_HE, creativeStudioHref, CREATIVE_PAGE_SIZE,
} from "@/lib/creative-studio/library-model";
import { loadOrgCreativesAction, favoriteOrgCreativeAction } from "@/lib/creative-studio/quick-creative-actions";

const CREATE_TYPES = ["property", "agent", "project", "office"] as const;
const TYPE_FILTERS: { k: string; label: string }[] = [
  { k: "all", label: "הכל" },
  ...Object.entries(CREATIVE_TYPE_LABEL_HE).map(([k, label]) => ({ k, label })),
];

export function CreativeStudioWorkspace({ selectable, recent, initial, propertyNameById, agentNameById }: {
  selectable: Record<string, SelectableEntity[]>;
  recent: CreativeCardView[];
  initial: OrgCreativePage;
  propertyNameById: Record<string, string>;
  agentNameById: Record<string, string>;
}) {
  const [tab, setTab] = useState<"create" | "library">("create");
  const nameOf = (c: CreativeCardView): string | null =>
    (c.propertyId && propertyNameById[c.propertyId]) || (c.agentId && agentNameById[c.agentId]) || null;

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <Header onNew={() => setTab("create")} />

      <div className="border-line flex gap-1 border-b">
        {[["create", "יצירה"], ["library", `ספרייה${initial.total ? ` · ${initial.total}` : ""}`]].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k as "create" | "library")}
            className={`-mb-px border-b-2 px-3.5 py-2 text-[14px] font-bold transition ${tab === k ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}>{label}</button>
        ))}
      </div>

      {tab === "create"
        ? <CreateMode selectable={selectable} recent={recent} nameOf={nameOf} onSeeAll={() => setTab("library")} />
        : <LibraryMode initial={initial} selectable={selectable} nameOf={nameOf} />}
    </main>
  );
}

function Header({ onNew }: { onNew: () => void }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <span className="bg-brand grid h-9 w-9 place-items-center rounded-xl text-white"><Icon name="Presentation" size={18} /></span>
          <h1 className="text-ink text-2xl font-black">סטודיו יצירה</h1>
        </div>
        <p className="text-muted mt-1 text-[13.5px]">כל מה שצריך כדי להפוך נכס לקריאייטיב שמייצר עניין.</p>
      </div>
      <button type="button" onClick={onNew} className="bg-brand inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white transition hover:opacity-90"><Icon name="Plus" size={16} />יצירה חדשה</button>
    </header>
  );
}

// ── CREATE MODE ───────────────────────────────────────────────────────────────
function CreateMode({ selectable, recent, nameOf, onSeeAll }: {
  selectable: Record<string, SelectableEntity[]>; recent: CreativeCardView[];
  nameOf: (c: CreativeCardView) => string | null; onSeeAll: () => void;
}) {
  return (
    <>
      <CommandCenter selectable={selectable} />
      {recent.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-ink text-[15px] font-black">היצירות האחרונות</h2>
            <button type="button" onClick={onSeeAll} className="text-brand-strong text-[12.5px] font-bold hover:underline">כל היצירות →</button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {recent.map((c) => <CreativeCard key={c.id} c={c} context={nameOf(c)} />)}
          </div>
        </section>
      )}
    </>
  );
}

function CommandCenter({ selectable }: { selectable: Record<string, SelectableEntity[]> }) {
  const router = useRouter();
  const types = CREATE_TYPES.filter((t) => (selectable[t] ?? []).length > 0);
  const [type, setType] = useState<string>(types[0] ?? "property");
  const [id, setId] = useState("");
  const options = selectable[type] ?? [];
  const go = () => { if (id) router.push(`/creative-studio/${type}/${id}`); };

  return (
    <section className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-ink text-[15px] font-black">מה יוצרים היום?</h2>
        {/* ONE subtle ZONO presence — an honest helper (not a fabricated insight). */}
        <span className="text-muted inline-flex items-center gap-1.5 text-[12px]"><Icon name="Sparkles" size={14} className="text-brand-strong" />בחרו נכס או סוכן — האשף של ZONO בסטודיו יהפוך אותו לקריאייטיב.</span>
      </div>

      {/* STEP 1 — entity type */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(types.length ? types : (["property", "agent"] as const)).map((t) => (
          <button key={t} type="button" onClick={() => { setType(t); setId(""); }}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-bold transition ${type === t ? "bg-brand text-white" : "border-line text-muted hover:text-ink border"}`}>
            <Icon name={ENTITY_ICONS[t] ?? "Circle"} size={13} />{ENTITY_LABELS[t] ?? t}
          </button>
        ))}
      </div>

      {/* STEP 2 — the entity, STEP 3 — continue into the canonical studio wizard */}
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-muted text-[11px] font-bold">בחרו {ENTITY_LABELS[type] ?? "ישות"}</span>
          <select value={id} onChange={(e) => setId(e.target.value)} className="border-line bg-surface text-ink h-10 min-w-[220px] rounded-xl border px-3 text-[14px]">
            <option value="">— בחר —</option>
            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
        <button type="button" disabled={!id} onClick={go} className="bg-brand inline-flex h-10 items-center gap-1.5 rounded-xl px-5 text-[14px] font-bold text-white transition hover:opacity-90 disabled:opacity-50">המשך ליצירה<Icon name="ArrowLeft" size={15} /></button>
      </div>
      {options.length === 0 && <p className="text-muted mt-2 text-[12px]">אין עדיין {ENTITY_LABELS[type] ?? "ישויות"} לבחירה.</p>}
    </section>
  );
}

// ── LIBRARY MODE ──────────────────────────────────────────────────────────────
function LibraryMode({ initial, selectable, nameOf }: {
  initial: OrgCreativePage; selectable: Record<string, SelectableEntity[]>;
  nameOf: (c: CreativeCardView) => string | null;
}) {
  const [items, setItems] = useState<CreativeCardView[]>(initial.items);
  const [page, setPage] = useState<{ total: number; hasMore: boolean; nextOffset: number }>({ total: initial.total, hasMore: initial.hasMore, nextOffset: initial.nextOffset });
  const [propertyId, setPropertyId] = useState<string>("");
  const [outputType, setOutputType] = useState<string>("all");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [pending, start] = useTransition();
  const properties = selectable.property ?? [];
  const isFiltered = !!(propertyId || outputType !== "all" || favoritesOnly);

  // ONE query path. Filters resolve to the query layer (not client slicing);
  // offset 0 replaces the grid, a later offset appends (Load More).
  const run = (offset: number, next: { propertyId: string; outputType: string; favoritesOnly: boolean }) => start(async () => {
    const r = await loadOrgCreativesAction({
      propertyId: next.propertyId || null,
      outputType: next.outputType === "all" ? null : next.outputType,
      favoritesOnly: next.favoritesOnly,
      limit: CREATIVE_PAGE_SIZE, offset,
    });
    setItems((prev) => offset === 0 ? r.items : [...prev, ...r.items]);
    setPage({ total: r.total, hasMore: r.hasMore, nextOffset: r.nextOffset });
  });
  const setFilter = (patch: Partial<{ propertyId: string; outputType: string; favoritesOnly: boolean }>) => {
    const next = { propertyId, outputType, favoritesOnly, ...patch };
    setPropertyId(next.propertyId); setOutputType(next.outputType); setFavoritesOnly(next.favoritesOnly);
    run(0, next);
  };

  return (
    <section className="flex flex-col gap-4">
      {/* Toolbar — filters run at the query layer, not client slicing */}
      <div className="bg-card border-line flex flex-wrap items-center gap-2 rounded-2xl border p-3">
        <div className="text-muted flex items-center gap-1.5"><Icon name="Filter" size={15} /><span className="text-[12px] font-bold">סינון</span></div>
        <select value={propertyId} onChange={(e) => setFilter({ propertyId: e.target.value })}
          className="border-line bg-surface text-ink h-9 rounded-lg border px-2 text-[13px]">
          <option value="">כל הנכסים</option>
          {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="flex flex-wrap gap-1">
          {TYPE_FILTERS.map((f) => (
            <button key={f.k} type="button" onClick={() => setFilter({ outputType: f.k })}
              className={`rounded-full px-2.5 py-1 text-[12px] font-bold transition ${outputType === f.k ? "bg-brand text-white" : "border-line text-muted hover:text-ink border"}`}>{f.label}</button>
          ))}
        </div>
        <button type="button" onClick={() => setFilter({ favoritesOnly: !favoritesOnly })}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold transition ${favoritesOnly ? "bg-warning-soft text-warning" : "border-line text-muted hover:text-ink border"}`}><Icon name="Star" size={13} />מועדפים</button>
        <span className="text-muted ms-auto text-[12px] font-semibold">{page.total} יצירות</span>
      </div>

      {items.length === 0 ? (
        pending ? <GridSkeleton /> : <LibraryEmpty filtered={isFiltered} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {items.map((c) => <CreativeCard key={c.id} c={c} context={nameOf(c)} />)}
          </div>
          {page.hasMore && (
            <div className="flex justify-center pt-1">
              <button type="button" disabled={pending} onClick={() => run(page.nextOffset, { propertyId, outputType, favoritesOnly })}
                className="border-line text-ink hover:bg-card inline-flex items-center gap-1.5 rounded-xl border px-5 py-2.5 text-[13px] font-bold transition disabled:opacity-50">{pending ? "טוען…" : "טען עוד"}</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

// ── Creative Card 2.0 — the creative dominates; one primary action + favorite ──
function CreativeCard({ c, context }: { c: CreativeCardView; context: string | null }) {
  const href = creativeStudioHref(c);
  const [fav, setFav] = useState(c.isFavorite);
  const [, start] = useTransition();
  const toggleFav = () => { const v = !fav; setFav(v); start(async () => { await favoriteOrgCreativeAction({ outputId: c.id, value: v }); }); };

  const preview = (
    <div className="bg-surface relative aspect-[4/5] w-full overflow-hidden">
      {c.hasImage
        ? <img src={c.imageUrl!} alt={c.title || c.typeLabel} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        : <div className="text-muted grid h-full w-full place-items-center"><Icon name="Image" size={26} /></div>}
      <span className="bg-black/55 absolute start-2 top-2 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold text-white backdrop-blur-sm">{c.typeLabel}</span>
      {c.isFailed && <span className="bg-danger-soft text-danger absolute end-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-black">נכשל</span>}
      {!c.hasImage && !c.isFailed && <span className="bg-warning-soft text-warning absolute end-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-black">ממתין לתמונה</span>}
    </div>
  );

  return (
    <div className="bg-card border-line group flex flex-col overflow-hidden rounded-2xl border shadow-[var(--shadow-card)]">
      {href ? <Link href={href} className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]">{preview}</Link> : preview}
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <div className="text-ink line-clamp-1 text-[12.5px] font-bold">{c.headline || c.title || c.typeLabel}</div>
        {context && <div className="text-muted line-clamp-1 text-[11px]">{context}</div>}
        <div className="mt-1 flex items-center justify-between gap-1">
          {href
            ? <Link href={href} className="text-brand-strong inline-flex items-center gap-0.5 text-[12px] font-bold hover:underline">פתח<Icon name="ArrowLeft" size={12} /></Link>
            : <span className="text-muted text-[12px]">—</span>}
          <button type="button" onClick={toggleFav} aria-label={fav ? "הסר ממועדפים" : "הוסף למועדפים"} aria-pressed={fav}
            className={`grid h-7 w-7 place-items-center rounded-lg transition ${fav ? "text-warning" : "text-muted hover:text-ink"}`}><Icon name="Star" size={15} /></button>
        </div>
      </div>
    </div>
  );
}

function LibraryEmpty({ filtered }: { filtered: boolean }) {
  if (filtered) return <p className="text-muted py-12 text-center text-[14px]">אין יצירות התואמות לסינון.</p>;
  return (
    <div className="bg-card border-line flex flex-col items-center gap-2 rounded-[22px] border p-10 text-center shadow-[var(--shadow-card)]">
      <span className="bg-brand-soft text-brand-strong grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Sparkles" size={22} /></span>
      <p className="text-ink text-[15px] font-black">עוד אין כאן יצירות</p>
      <p className="text-muted max-w-xs text-[13px]">בחרו נכס או סוכן ב״יצירה״ — ותתחילו את הקריאייטיב הראשון שלכם.</p>
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, i) => <div key={i} className="bg-black/[0.05] aspect-[4/5] animate-pulse rounded-2xl" />)}
    </div>
  );
}
