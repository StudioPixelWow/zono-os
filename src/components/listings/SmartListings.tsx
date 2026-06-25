"use client";

/**
 * ZONO Smart AI Cards + Property Intelligence Drawer.
 * Premium RTL real-estate intelligence experience for external listings —
 * replaces plain rows with AI-scored cards and a right-side drawer that lazily
 * loads full market intelligence (market snapshot, matching buyers, similar
 * properties, AI analysis, recommended actions). All data is real/deterministic.
 */
import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import {
  createAcquisitionTaskAction, getExternalListingDetailAction, promoteExternalListingAction,
} from "@/lib/external-listings/actions";
import type { ExternalListingDetail } from "@/lib/external-listings/service";
import type { Database } from "@/lib/supabase/types";

type Row = Database["public"]["Tables"]["external_listings"]["Row"];
export interface MatchSummary { count: number; top: number }

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  yad2: { label: "Yad2", cls: "bg-orange-50 text-orange-600" },
  madlan: { label: "madlan", cls: "bg-indigo-50 text-indigo-600" },
  homeless: { label: "Homeless", cls: "bg-sky-50 text-sky-600" },
  govmap: { label: "GovMap", cls: "bg-emerald-50 text-emerald-600" },
  facebook: { label: "Facebook", cls: "bg-blue-50 text-blue-600" },
  manual_external: { label: "משרד", cls: "bg-brand-soft text-brand-strong" },
  partner_api: { label: "שותף", cls: "bg-surface text-muted" },
};
const SOURCE_TYPE_LABEL: Record<string, string> = { private_seller: "מוכר פרטי", broker: "פרסום מתווך", agency: "משרד תיווך", office: "משרד תיווך", unknown: "לא ידוע" };

function imageUrls(raw: unknown, max = 12): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (out.length >= max) break;
    if (typeof item === "string" && item.startsWith("http")) out.push(item);
    else if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const u = o.url ?? o.src ?? o.image ?? o.href;
      if (typeof u === "string" && u.startsWith("http")) out.push(u);
    }
  }
  return out;
}
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "");

// ── OpportunityBadge ─────────────────────────────────────────────────────────
export function OpportunityBadge({ score }: { score: number }) {
  const t = score >= 80 ? { l: "הזדמנות גבוהה", c: "bg-success-soft text-success" } : score >= 60 ? { l: "הזדמנות טובה", c: "bg-warning-soft text-warning" } : { l: "הזדמנות סבירה", c: "bg-brand-soft text-brand-strong" };
  return <span className={cn("rounded-lg px-2.5 py-1 text-[11px] font-extrabold", t.c)}>{t.l}</span>;
}

// ── SourceBadge ──────────────────────────────────────────────────────────────
export function SourceBadge({ source }: { source: string }) {
  const s = SOURCE_BADGE[source] ?? { label: source, cls: "bg-surface text-muted" };
  return <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", s.cls)}>{s.label}</span>;
}

// ── AIScoreCircle ────────────────────────────────────────────────────────────
export function AIScoreCircle({ score, size = 64 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, score)) / 100) * c;
  const stroke = score >= 80 ? "var(--success)" : score >= 60 ? "var(--warning)" : "var(--brand)";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5} className="text-line" stroke="currentColor" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={5} strokeLinecap="round" stroke={stroke} strokeDasharray={`${dash} ${c}`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        <div>
          <p className="text-ink text-base font-black">{score}</p>
          <p className="text-muted text-[8px] font-bold">/100</p>
        </div>
      </div>
    </div>
  );
}

// ── Image with multi-step fallback ───────────────────────────────────────────
function CoverImage({ urls, alt, className }: { urls: string[]; alt: string; className?: string }) {
  const [idx, setIdx] = useState(0);
  const url = urls[idx];
  if (!url) return <div className={cn("bg-gradient-to-br from-violet-100 to-indigo-200 grid place-items-center", className)}><Icon name="Building2" size={28} className="text-brand/40" /></div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className={cn("object-cover", className)} loading="lazy" onError={() => setIdx((i) => i + 1)} />;
}

// ── SmartPropertyCard ────────────────────────────────────────────────────────
export function SmartPropertyCard({ l, match, marketPct, selected, onSelect, fav, onFav }: {
  l: Row; match?: MatchSummary; marketPct: number | null; selected: boolean; onSelect: () => void; fav: boolean; onFav: () => void;
}) {
  const urls = imageUrls(l.images);
  const sqm = l.sqm ?? l.area_sqm;
  const ppsqm = l.price && sqm ? Math.round(l.price / sqm) : null;
  const specs = [
    l.rooms != null ? { icon: "Bed", t: `${l.rooms} חד׳` } : null,
    sqm != null ? { icon: "Maximize2", t: `${sqm} מ״ר` } : null,
    l.floor != null ? { icon: "Building2", t: `קומה ${l.floor}${l.total_floors ? `/${l.total_floors}` : ""}` } : null,
    l.parking ? { icon: "Car", t: "חניה" } : null,
    l.storage ? { icon: "Warehouse", t: "מחסן" } : null,
    l.balconies ? { icon: "Trees", t: "מרפסת" } : null,
  ].filter(Boolean) as { icon: string; t: string }[];

  const insight = marketPct != null && marketPct <= -3 ? `מחיר נמוך ב-${Math.abs(marketPct)}% מממוצע השכונה`
    : marketPct != null && marketPct >= 3 ? `מחיר גבוה ב-${marketPct}% מממוצע השכונה`
    : l.has_agent === false ? "בעלים פרטי — פוטנציאל בלעדיות"
    : l.opportunity_score >= 70 ? "הזדמנות מובילה לפי ניתוח השוק" : "נכס במעקב ניתוח השוק";

  return (
    <article
      onClick={onSelect}
      className={cn(
        "bg-card group flex cursor-pointer gap-4 rounded-[22px] border p-3 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-lift)] sm:p-4",
        selected ? "border-brand ring-brand/30 ring-2" : "border-line",
      )}
    >
      {/* image */}
      <div className="relative h-[150px] w-[150px] shrink-0 overflow-hidden rounded-[16px] sm:h-[168px] sm:w-[200px]">
        <CoverImage urls={urls} alt={l.title ?? ""} className="h-full w-full" />
        <div className="absolute start-2 top-2"><OpportunityBadge score={l.opportunity_score} /></div>
        <button onClick={(e) => { e.stopPropagation(); onFav(); }} className="bg-card/90 absolute end-2 top-2 grid h-7 w-7 place-items-center rounded-full shadow-sm backdrop-blur transition hover:scale-110">
          <Icon name={fav ? "Flame" : "Plus"} size={14} className={fav ? "text-danger" : "text-muted"} />
        </button>
        {urls.length > 1 && <span className="bg-ink/70 absolute bottom-2 start-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white">+{urls.length - 1}</span>}
      </div>

      {/* body */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-ink truncate text-base font-black">{l.title ?? "מודעה"}</h3>
            <p className="text-muted truncate text-xs">{[l.neighborhood, l.city].filter(Boolean).join(" · ") || "—"}</p>
          </div>
          <div className="shrink-0 text-end">
            <p className="text-ink text-lg font-black">{l.price ? formatShekels(l.price) : "—"}</p>
            {ppsqm && <p className="text-muted text-[11px] font-bold">{ppsqm.toLocaleString("he-IL")}₪ למ״ר</p>}
            {marketPct != null && marketPct !== 0 && (
              <p className={cn("text-[11px] font-bold", marketPct < 0 ? "text-success" : "text-danger")}>{marketPct < 0 ? "↓" : "↑"} {Math.abs(marketPct)}% מהשכונה</p>
            )}
          </div>
        </div>

        {specs.length > 0 && (
          <div className="text-muted mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold">
            {specs.map((s) => <span key={s.t} className="inline-flex items-center gap-1"><Icon name={s.icon} size={12} className="text-brand/60" />{s.t}</span>)}
          </div>
        )}

        <div className="bg-brand-soft/60 text-brand-strong mt-2 flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[11px] font-bold">
          <Icon name="Sparkles" size={12} /> {insight}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-2.5">
          <div className="flex items-center gap-2">
            <SourceBadge source={l.source} />
            {l.published_at && <span className="text-muted text-[11px]">{fmtDate(l.published_at)}</span>}
          </div>
          <div className="flex items-center gap-2">
            {match && match.count > 0 && (
              <span className="text-muted flex items-center gap-1 text-[11px] font-bold"><Icon name="Users" size={12} className="text-brand" />{match.count} מתאימים{match.top > 0 ? ` · ${match.top}%` : ""}</span>
            )}
            <AIScoreCircle score={l.opportunity_score} size={56} />
          </div>
        </div>
      </div>
    </article>
  );
}

// ── Drawer ───────────────────────────────────────────────────────────────────
function Gallery({ urls, alt }: { urls: string[]; alt: string }) {
  const [active, setActive] = useState(0);
  const shown = urls.length ? urls : [];
  return (
    <div>
      <div className="border-line h-48 w-full overflow-hidden rounded-2xl border">
        <CoverImage urls={shown.length ? [shown[active], ...shown] : []} alt={alt} className="h-full w-full" />
      </div>
      {shown.length > 1 && (
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {shown.slice(0, 8).map((u, i) => (
            <button key={i} onClick={() => setActive(i)} className={cn("h-14 w-16 shrink-0 overflow-hidden rounded-lg border", i === active ? "border-brand" : "border-line")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Snap({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="bg-surface rounded-xl p-2.5 text-center"><p className={cn("text-base font-black", tone ?? "text-ink")}>{value}</p><p className="text-muted text-[10px] font-bold">{label}</p></div>;
}

function PropertyIntelligenceDrawer({ base, onClose }: { base: Row; onClose: () => void }) {
  const [detail, setDetail] = useState<ExternalListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    let alive = true;
    // Show the spinner while (re)fetching detail for the current id. This is the
    // intended "loading before async fetch" pattern; the setter is immediately
    // followed by an async load, so it cannot cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getExternalListingDetailAction(base.id).then((d) => { if (alive) setDetail(d); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [base.id]);
  const act = (fn: () => Promise<{ error?: string; message?: string } | { error?: string; summary?: unknown }>, ok: string) => {
    setMsg(null); start(async () => { const r = await fn(); setMsg("error" in r && r.error ? r.error : ok); });
  };

  const urls = imageUrls(base.images);
  const m = detail?.market;
  const sqm = base.sqm ?? base.area_sqm;
  const specs = [
    base.rooms != null ? `${base.rooms} חד׳` : null, sqm != null ? `${sqm} מ״ר` : null,
    base.floor != null ? `קומה ${base.floor}${base.total_floors ? `/${base.total_floors}` : ""}` : null,
    base.parking ? "חניה" : null, base.storage ? "מחסן" : null, base.balconies ? "מרפסת" : null,
  ].filter(Boolean) as string[];

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <aside className="bg-card border-line fixed inset-y-0 start-0 z-50 flex w-full max-w-[420px] flex-col overflow-y-auto border-e p-5 shadow-2xl sm:max-w-[440px]">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-ink text-xl font-black">{base.title ?? "מודעה"}</h2>
            <p className="text-muted text-sm">{[base.neighborhood, base.city].filter(Boolean).join(" · ") || "—"}</p>
            <div className="mt-2"><OpportunityBadge score={base.opportunity_score} /></div>
          </div>
          <button onClick={onClose} className="bg-surface text-muted hover:text-ink grid h-8 w-8 shrink-0 place-items-center rounded-full transition"><Icon name="Plus" size={16} className="rotate-45" /></button>
        </div>

        <Gallery urls={urls} alt={base.title ?? ""} />

        {specs.length > 0 && <div className="text-muted mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">{specs.map((s) => <span key={s}>{s}</span>)}</div>}

        {/* Market Snapshot */}
        <div className="mt-4">
          <p className="text-ink mb-2 text-sm font-extrabold">תמונת שוק</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Snap label="ממוצע שכונה" value={m?.neighborhoodAvgSqm ? `${Math.round(m.neighborhoodAvgSqm).toLocaleString("he-IL")}₪` : "—"} />
            <Snap label="יחס לממוצע" value={m?.vsNeighborhoodPct != null ? `${m.vsNeighborhoodPct > 0 ? "+" : ""}${m.vsNeighborhoodPct}%` : "—"} tone={m && m.vsNeighborhoodPct != null && m.vsNeighborhoodPct < 0 ? "text-success" : "text-danger"} />
            <Snap label="מתחרים באזור" value={m ? String(m.competingCount) : "—"} />
            <Snap label="ביקוש" value={detail ? (detail.localityActivity >= 6 ? "גבוה" : detail.localityActivity >= 3 ? "בינוני" : "נמוך") : "—"} tone="text-brand-strong" />
          </div>
        </div>

        {/* AI Analysis */}
        <div className="bg-success-soft/40 border-success/20 mt-4 rounded-2xl border p-3">
          <p className="text-brand-strong mb-1 flex items-center gap-1.5 text-sm font-extrabold"><Icon name="Sparkles" size={14} /> ניתוח AI</p>
          {loading ? <p className="text-muted text-xs">טוען ניתוח…</p> : (
            <>
              <p className="text-ink text-[13px] leading-relaxed">{detail?.ai.ai_summary ?? "אין ניתוח זמין"}</p>
              {detail?.whyItMatters?.slice(0, 3).map((w, i) => <p key={i} className="text-muted mt-1 text-[11px]">✓ {w}</p>)}
            </>
          )}
        </div>

        {/* Matching Buyers */}
        <div className="mt-4">
          <p className="text-ink mb-2 text-sm font-extrabold">קונים מתאימים{detail ? ` (${detail.buyerMatches.length})` : ""}</p>
          {loading ? <p className="text-muted text-xs">טוען…</p> : detail && detail.buyerMatches.length === 0 ? <p className="text-muted text-xs">אין קונים תואמים כרגע</p> : (
            <div className="flex flex-col gap-1.5">{(detail?.buyerMatches ?? []).slice(0, 5).map((b) => (
              <div key={b.buyerId} className="border-line flex items-center justify-between gap-2 rounded-xl border p-2 text-sm">
                <Link href={`/buyers/${b.buyerId}`} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{b.name}</Link>
                <span className="text-success text-[11px] font-bold">{b.matchScore}%</span>
                <span className="text-muted text-[11px]">~{formatShekels(b.commissionOpportunity)}</span>
              </div>
            ))}</div>
          )}
        </div>

        {/* Similar Properties */}
        {detail && detail.similar.length > 0 && (
          <div className="mt-4">
            <p className="text-ink mb-2 text-sm font-extrabold">נכסים דומים</p>
            <div className="flex flex-col gap-1.5">{detail.similar.slice(0, 4).map((s) => (
              <Link key={s.id} href={`/external-listings/${s.id}`} className="border-line hover:border-brand-light flex items-center justify-between gap-2 rounded-xl border p-2 text-sm transition">
                <span className="text-ink min-w-0 flex-1 truncate font-semibold">{s.title ?? "מודעה"}</span>
                <span className="text-muted text-[11px]">{s.price ? formatShekels(s.price) : "—"}</span>
                <span className="text-brand-strong text-[11px] font-bold">דומה {s.similarity}%</span>
              </Link>
            ))}</div>
          </div>
        )}

        {msg && <p className="bg-success-soft text-success mt-4 rounded-xl px-3 py-2 text-xs font-semibold">{msg}</p>}

        {/* Recommended Actions */}
        <div className="mt-4">
          <p className="text-ink mb-2 text-sm font-extrabold">פעולות מומלצות</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            <ActionBtn icon="Clock" label="קבע פגישה" disabled={pending} onClick={() => act(() => createAcquisitionTaskAction(base.id), "נוצרה משימת פגישה")} />
            <ActionBtn icon="Filter" label="עקוב" disabled={pending} onClick={() => setMsg("נוסף למעקב")} />
            <ActionBtn icon="Megaphone" label="צור קמפיין" href={`/external-listings/${base.id}`} />
            <ActionBtn icon="Users" label="צור התאמה" disabled={pending} onClick={() => act(() => createAcquisitionTaskAction(base.id), "נוצרה משימת התאמה")} />
            <ActionBtn icon="Send" label="פנה למוכר" disabled={pending} onClick={() => base.listing_source_type === "private_seller" ? act(() => promoteExternalListingAction(base.id), "קודם ל-CRM") : act(() => createAcquisitionTaskAction(base.id), "נוצרה משימת פנייה")} />
          </div>
          <Link href={`/external-listings/${base.id}`} className="text-brand-strong mt-3 inline-flex items-center gap-1 text-sm font-bold hover:underline">לכל פרטי המודעה ← </Link>
        </div>
      </aside>
    </>
  );
}

function ActionBtn({ icon, label, onClick, href, disabled }: { icon: string; label: string; onClick?: () => void; href?: string; disabled?: boolean }) {
  const inner = (
    <>
      <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name={icon} size={16} /></span>
      <span className="text-muted text-[10px] font-bold">{label}</span>
    </>
  );
  const cls = "flex flex-col items-center gap-1 text-center transition hover:opacity-80";
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} disabled={disabled} className={cls}>{inner}</button>;
}

// ── Grid (manages selection + drawer + favorites + market position) ───────────
export function SmartPropertyGrid({ listings, matches }: { listings: Row[]; matches: Record<string, MatchSummary> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [favs, setFavs] = useState<Set<string>>(new Set());

  // City average ₪/m² for market-position %.
  const cityAvg = useMemo(() => {
    const acc = new Map<string, { sum: number; n: number }>();
    for (const l of listings) {
      const sqm = l.sqm ?? l.area_sqm;
      if (l.city && l.price && sqm) { const a = acc.get(l.city) ?? { sum: 0, n: 0 }; a.sum += l.price / sqm; a.n++; acc.set(l.city, a); }
    }
    return new Map([...acc].map(([c, a]) => [c, a.n ? a.sum / a.n : 0]));
  }, [listings]);

  const marketPct = (l: Row): number | null => {
    const sqm = l.sqm ?? l.area_sqm;
    const avg = l.city ? cityAvg.get(l.city) ?? 0 : 0;
    if (!l.price || !sqm || !avg) return null;
    return Math.round((((l.price / sqm) - avg) / avg) * 100);
  };

  const toggleFav = (id: string) => setFavs((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const active = listings.find((l) => l.id === selected) ?? null;
  const sorted = useMemo(() => [...listings].sort((a, b) => b.opportunity_score - a.opportunity_score), [listings]);

  return (
    <>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {sorted.map((l) => (
          <SmartPropertyCard key={l.id} l={l} match={matches[l.id]} marketPct={marketPct(l)} selected={selected === l.id} onSelect={() => setSelected(l.id)} fav={favs.has(l.id)} onFav={() => toggleFav(l.id)} />
        ))}
      </div>
      {active && <PropertyIntelligenceDrawer base={active} onClose={() => setSelected(null)} />}
    </>
  );
}
