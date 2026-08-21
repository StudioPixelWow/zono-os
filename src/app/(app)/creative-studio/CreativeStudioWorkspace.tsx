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
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { ZonoMark } from "@/components/zono/ZonoMark";
import type { SelectableEntity } from "@/lib/creative-studio/service";
import type { CreativeOpportunity } from "@/lib/creative-studio/creative-opportunities";
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

export function CreativeStudioWorkspace({ selectable, recent, initial, opportunities, propertyNameById, agentNameById }: {
  selectable: Record<string, SelectableEntity[]>;
  recent: CreativeCardView[];
  initial: OrgCreativePage;
  opportunities: CreativeOpportunity[];
  propertyNameById: Record<string, string>;
  agentNameById: Record<string, string>;
}) {
  const [tab, setTab] = useState<"create" | "library">("create");
  const [detail, setDetail] = useState<CreativeCardView | null>(null);
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
        ? <CreateMode selectable={selectable} recent={recent} opportunities={opportunities} nameOf={nameOf} onOpenDetail={setDetail} onSeeAll={() => setTab("library")} />
        : <LibraryMode initial={initial} selectable={selectable} nameOf={nameOf} onOpenDetail={setDetail} />}

      {detail && <CreativeDetailDrawer card={detail} context={nameOf(detail)} onClose={() => setDetail(null)} />}
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
function CreateMode({ selectable, recent, opportunities, nameOf, onOpenDetail, onSeeAll }: {
  selectable: Record<string, SelectableEntity[]>; recent: CreativeCardView[];
  opportunities: CreativeOpportunity[];
  nameOf: (c: CreativeCardView) => string | null; onOpenDetail: (c: CreativeCardView) => void; onSeeAll: () => void;
}) {
  return (
    <>
      <CommandCenter selectable={selectable} />
      {opportunities.length > 0 && <SmartOpportunities opportunities={opportunities} />}
      {recent.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-ink text-[15px] font-black">היצירות האחרונות</h2>
            <button type="button" onClick={onSeeAll} className="text-brand-strong text-[12.5px] font-bold hover:underline">כל היצירות →</button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {recent.map((c) => <CreativeCard key={c.id} c={c} context={nameOf(c)} onOpen={onOpenDetail} />)}
          </div>
        </section>
      )}
    </>
  );
}

// ── Smart Opportunities — REAL, evidence-backed (deriveCreativeOpportunities) ──
// The single ZONO moment in the creation experience (mascot used here, not on the
// generation helper). Every row is a provable fact; empty → the section is hidden.
function SmartOpportunities({ opportunities }: { opportunities: CreativeOpportunity[] }) {
  return (
    <section className="bg-card border-line rounded-[22px] border p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-2.5">
        <ZonoMark size="compact" state="opportunity" />
        <div>
          <h2 className="text-ink text-[14px] font-black">זונו מצא {opportunities.length} {opportunities.length === 1 ? "הזדמנות" : "הזדמנויות"} ליצירה</h2>
          <p className="text-muted text-[11.5px]">הזדמנויות מבוססות-נתונים — לכל אחת סיבה אמיתית מהמערכת.</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {opportunities.map((o) => (
          <div key={`${o.propertyId}:${o.type}`} className="border-line flex items-center gap-3 rounded-xl border p-2.5">
            <span className="bg-surface grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg">
              {o.image ? <img src={o.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <Icon name="Building" size={16} className="text-muted" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-ink truncate text-[12.5px] font-bold">{o.reasonHe}</p>
              <p className="text-muted truncate text-[11px]">{o.propertyTitle}{o.location ? ` · ${o.location}` : ""}</p>
            </div>
            <Link href={o.studioHref} className="bg-brand-soft text-brand-strong shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-bold transition hover:opacity-90">צור עכשיו →</Link>
          </div>
        ))}
      </div>
    </section>
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
function LibraryMode({ initial, selectable, nameOf, onOpenDetail }: {
  initial: OrgCreativePage; selectable: Record<string, SelectableEntity[]>;
  nameOf: (c: CreativeCardView) => string | null; onOpenDetail: (c: CreativeCardView) => void;
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
            {items.map((c) => <CreativeCard key={c.id} c={c} context={nameOf(c)} onOpen={onOpenDetail} />)}
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

// Approval/provider state → subtle tone (Phase 16: red only for real failure). ──
function stateChip(c: CreativeCardView): { label: string; cls: string } | null {
  if (c.isFailed) return { label: "נכשל", cls: "bg-danger-soft text-danger" };
  if (c.status === "approved") return { label: "מאושר", cls: "bg-success-soft text-success" };
  if (c.status === "rejected") return { label: "נדחה", cls: "bg-card text-muted border-line border" };
  if (!c.hasImage) return { label: "ממתין לתמונה", cls: "bg-warning-soft text-warning" };
  return null; // generated/draft → no chip (calm)
}

// ── Creative Card 2.0 — the creative dominates; opens the detail drawer ────────
function CreativeCard({ c, context, onOpen }: { c: CreativeCardView; context: string | null; onOpen: (c: CreativeCardView) => void }) {
  const [fav, setFav] = useState(c.isFavorite);
  const [, start] = useTransition();
  const toggleFav = () => { const v = !fav; setFav(v); start(async () => { await favoriteOrgCreativeAction({ outputId: c.id, value: v }); }); };
  const chip = stateChip(c);

  return (
    <div className="bg-card border-line group flex flex-col overflow-hidden rounded-2xl border shadow-[var(--shadow-card)]">
      <button type="button" onClick={() => onOpen(c)} aria-label={`פתיחת ${c.title || c.typeLabel}`} className="bg-surface relative block aspect-[4/5] w-full overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]">
        {c.hasImage
          ? <img src={c.imageUrl!} alt={c.title || c.typeLabel} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]" />
          : <div className="text-muted grid h-full w-full place-items-center"><Icon name="Image" size={26} /></div>}
        <span className="bg-black/55 absolute start-2 top-2 rounded-md px-1.5 py-0.5 text-[10.5px] font-bold text-white backdrop-blur-sm">{c.typeLabel}</span>
        {chip && <span className={`absolute end-2 top-2 rounded-md px-1.5 py-0.5 text-[10px] font-black ${chip.cls}`}>{chip.label}</span>}
      </button>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <div className="text-ink line-clamp-1 text-[12.5px] font-bold">{c.headline || c.title || c.typeLabel}</div>
        {context && <div className="text-muted line-clamp-1 text-[11px]">{context}</div>}
        <div className="mt-1 flex items-center justify-between gap-1">
          <button type="button" onClick={() => onOpen(c)} className="text-brand-strong inline-flex items-center gap-0.5 text-[12px] font-bold hover:underline">פתח<Icon name="ArrowLeft" size={12} /></button>
          <button type="button" onClick={toggleFav} aria-label={fav ? "הסר ממועדפים" : "הוסף למועדפים"} aria-pressed={fav}
            className={`grid h-7 w-7 place-items-center rounded-lg transition ${fav ? "text-warning" : "text-muted hover:text-ink"}`}><Icon name="Star" size={15} /></button>
        </div>
      </div>
    </div>
  );
}

// ── Library detail drawer — lightweight; real actions only, no duplicated engine ─
function CreativeDetailDrawer({ card, context, onClose }: { card: CreativeCardView; context: string | null; onClose: () => void }) {
  const studioHref = creativeStudioHref(card);
  const distHref = card.status === "approved" && card.propertyId ? `/distribution/marketing-plan/${card.propertyId}` : null;
  const [fav, setFav] = useState(card.isFavorite);
  const [, start] = useTransition();
  const toggleFav = () => { const v = !fav; setFav(v); start(async () => { await favoriteOrgCreativeAction({ outputId: card.id, value: v }); }); };
  const chip = stateChip(card);
  const created = card.createdAt ? new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric" }).format(new Date(card.createdAt)) : null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  const meta = (label: string, value: string) => (
    <div className="flex items-center justify-between gap-2 py-1.5"><span className="text-muted text-[12px]">{label}</span><span className="text-ink text-[12.5px] font-bold">{value}</span></div>
  );

  return (
    <div dir="rtl" className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="פרטי קריאייטיב">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="bg-surface absolute inset-y-0 start-0 flex h-[100dvh] w-full max-w-[460px] flex-col shadow-2xl sm:w-[88vw] md:w-[440px]">
        <div className="border-line flex items-center justify-between border-b px-4 py-2.5">
          <span className="text-muted text-[12px] font-bold">פרטי קריאייטיב</span>
          <button type="button" onClick={onClose} aria-label="סגירה" className="text-muted hover:text-ink grid h-8 w-8 place-items-center rounded-lg"><Icon name="X" size={18} /></button>
        </div>

        <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="bg-card border-line relative aspect-[4/5] w-full overflow-hidden rounded-2xl border">
            {card.hasImage
              ? <img src={card.imageUrl!} alt={card.title || card.typeLabel} className="h-full w-full object-cover" />
              : <div className="text-muted grid h-full w-full place-items-center"><Icon name="Image" size={34} /></div>}
            {chip && <span className={`absolute end-2.5 top-2.5 rounded-md px-2 py-0.5 text-[11px] font-black ${chip.cls}`}>{chip.label}</span>}
          </div>
          <div>
            <h3 className="text-ink text-[15px] font-black">{card.headline || card.title || card.typeLabel}</h3>
            {context && <p className="text-muted text-[12px]">{context}</p>}
          </div>
          <div className="bg-card border-line rounded-2xl border px-3.5 py-1">
            {meta("סוג", card.typeLabel)}
            {card.format && meta("פורמט", card.format)}
            {created && meta("נוצר", created)}
          </div>
        </div>

        <div className="border-line bg-surface flex flex-col gap-2 border-t px-4 py-3">
          <div className="flex items-center gap-2">
            {studioHref && <Link href={studioHref} onClick={onClose} className="bg-brand inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"><Icon name="Presentation" size={14} />פתח בסטודיו</Link>}
            <button type="button" onClick={toggleFav} aria-pressed={fav} aria-label={fav ? "הסר ממועדפים" : "הוסף למועדפים"} className={`border-line grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition ${fav ? "text-warning" : "text-muted hover:text-ink"}`}><Icon name="Star" size={16} /></button>
            {card.hasImage && <a href={card.imageUrl!} target="_blank" rel="noopener noreferrer" download aria-label="הורדת התמונה" className="border-line text-ink hover:bg-card grid h-10 w-10 shrink-0 place-items-center rounded-xl border transition"><Icon name="Download" size={16} /></a>}
          </div>
          {distHref && <Link href={distHref} onClick={onClose} className="border-line text-ink hover:bg-card inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 text-[13px] font-bold transition"><Icon name="Share2" size={14} className="text-brand-strong" />המשך להפצה</Link>}
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
