/* eslint-disable @next/next/no-img-element -- external CDN listing photos; next/image would require remotePatterns config */
// ============================================================================
// 🌐 AI Brokerage Website — shared presentational UI (server-safe). 32.1.
// Glass cards, stat pills, JSON-LD injector. No client state.
// ============================================================================
import Link from "next/link";

export function JsonLd({ data }: { data: Record<string, unknown>[] }) {
  return <>{data.map((d, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(d) }} />)}</>;
}

export function Glass({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-white/40 bg-white/60 shadow-xl backdrop-blur-md ${className}`}>{children}</div>;
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/40 bg-white/60 px-4 py-3 text-center backdrop-blur-md">
      <div className="text-2xl font-black" style={{ color: "var(--site-accent)" }}>{value}</div>
      <div className="text-[11px] text-slate-600">{label}</div>
    </div>
  );
}

const fmt = (n: number | null) => (n == null ? null : `₪${n.toLocaleString("he-IL")}`);

// Graceful fallbacks so the luxury card renders premium on ANY page — including
// legacy/portal pages that don't set the --site-* theme pipeline.
const ACCENT = "var(--site-accent, #6d28d9)";
const GRADIENT = "var(--site-gradient, linear-gradient(135deg, #6d28d9 0%, #8b5cf6 100%))";

/** Luxury fallback artwork for a listing with no photo — a themed architectural
 *  silhouette, never a blank gray box. Server-safe inline SVG (no client JS). */
function LuxuryFallback() {
  return (
    <div className="absolute inset-0" style={{ background: GRADIENT }} aria-hidden>
      <div className="absolute inset-0 opacity-90" style={{ background: "radial-gradient(120% 90% at 80% 0%, rgba(255,255,255,0.28), transparent 55%)" }} />
      <svg viewBox="0 0 200 150" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice">
        <g fill="rgba(255,255,255,0.16)">
          <rect x="24" y="66" width="40" height="70" rx="3" />
          <rect x="72" y="44" width="52" height="92" rx="3" />
          <rect x="132" y="78" width="40" height="58" rx="3" />
        </g>
        <g fill="rgba(255,255,255,0.30)">
          <rect x="80" y="54" width="8" height="8" rx="1" /><rect x="96" y="54" width="8" height="8" rx="1" /><rect x="112" y="54" width="8" height="8" rx="1" />
          <rect x="80" y="72" width="8" height="8" rx="1" /><rect x="96" y="72" width="8" height="8" rx="1" /><rect x="112" y="72" width="8" height="8" rx="1" />
          <rect x="80" y="90" width="8" height="8" rx="1" /><rect x="96" y="90" width="8" height="8" rx="1" /><rect x="112" y="90" width="8" height="8" rx="1" />
        </g>
      </svg>
    </div>
  );
}

/**
 * LuxuryPropertyCard — the single premium public property card shared by every
 * generated ZONO site (office / agent / all landing types). Same required props
 * as before (drop-in), plus optional public-safe extras (location, rooms, sqm,
 * AI match score, one-line reason) rendered only when provided. No private data.
 */
export function PropertyCard({
  slug, id, title, price, image, badge, base = "ai-site",
  location = null, rooms = null, area = null, matchScore = null, reason = null, href,
}: {
  slug: string; id: string; title: string; price: number | null; image: string | null;
  badge?: string | null; base?: "ai-site" | "ai-agent";
  location?: string | null; rooms?: number | null; area?: number | null;
  matchScore?: number | null; reason?: string | null;
  /** Override the link target, or pass `null` for a non-linking card (legacy /
   *  portal pages without a property detail route). Default: computed ai-site href. */
  href?: string | null;
}) {
  const meta = [rooms != null ? `${rooms} חד׳` : null, area != null ? `${area} מ״ר` : null].filter(Boolean).join(" · ");
  const target = href === undefined ? `/${base}/${slug}/property/${id}` : href;
  const cardCls = "group flex flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/70 shadow-[0_2px_10px_rgba(15,23,42,0.06)] backdrop-blur-md transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_-12px_rgba(15,23,42,0.28)]";
  const inner = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden">
        {image
          ? <img src={image} alt={title} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]" />
          : <LuxuryFallback />}
        {/* legibility veil for overlaid pills */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/25 to-transparent" />
        {badge && <span className="absolute end-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-black text-white shadow-sm" style={{ background: GRADIENT }}>{badge}</span>}
        {matchScore != null && (
          <span className="absolute start-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-black shadow-sm backdrop-blur-sm" style={{ color: ACCENT }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: ACCENT }} /> {matchScore}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="line-clamp-1 text-[15px] font-black text-slate-900">{title}</div>
        {location && <div className="line-clamp-1 text-[12px] font-medium text-slate-500">{location}</div>}
        <div className="mt-1 flex items-end justify-between gap-2">
          {fmt(price) ? <div className="text-[17px] font-black" style={{ color: ACCENT }}>{fmt(price)}</div> : <span className="text-[12px] font-semibold text-slate-400">מחיר לפי פנייה</span>}
          {meta && <div className="text-[11px] font-semibold text-slate-500">{meta}</div>}
        </div>
        {reason && <div className="mt-1 line-clamp-1 text-[11px] italic text-slate-400">{reason}</div>}
      </div>
    </>
  );
  return target === null
    ? <div className={cardCls}>{inner}</div>
    : <Link href={target} className={cardCls}>{inner}</Link>;
}
