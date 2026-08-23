// ============================================================================
// ZONO Agent Website — presentational primitives (server-safe, token-driven).
// ----------------------------------------------------------------------------
// STRUCTURE = ZONO (fixed grid/geometry/spacing). IDENTITY = brand tokens.
// Every color here reads from --brand-* / --site-* CSS variables — NO hardcoded
// brand hue — so one template renders unlimited agent brands (spec §19/§26).
// ============================================================================
import Link from "next/link";
import type { ReactNode } from "react";
import type { SiteProperty, SiteStat, SiteArea } from "@/lib/agent-website/site-data";
import { statStripGridClass } from "@/lib/agent-website/stat-strip-layout";
import { FavoriteButton } from "./FavoriteButton";

export const money = (n: number | null | undefined): string | null =>
  typeof n === "number" && n > 0 ? `₪${n.toLocaleString("he-IL")}` : null;

/** Section wrapper — consistent max width, spacing and heading rhythm. */
export function SectionShell({ id, eyebrow, title, subtitle, action, children, tone = "base", className = "" }: {
  id?: string; eyebrow?: string; title?: string; subtitle?: string;
  action?: ReactNode; children: ReactNode; tone?: "base" | "surface" | "soft"; className?: string;
}) {
  return (
    <section id={id} className={`${tone === "surface" ? "bg-[var(--brand-surface)]" : tone === "soft" ? "bg-[var(--brand-soft)]" : ""} ${className}`}>
      <div className="mx-auto w-full max-w-7xl px-5 py-14 sm:px-8 lg:py-20">
        {(title || action) && (
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
            <div>
              {eyebrow && <div className="mb-1 text-[13px] font-bold tracking-wide text-[color:var(--brand-link)]">{eyebrow}</div>}
              {title && <h2 className="text-[28px] font-black leading-[1.08] tracking-tight text-[var(--brand-text)] sm:text-[40px]">{title}</h2>}
              {subtitle && <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-[var(--brand-muted)]">{subtitle}</p>}
            </div>
            {action}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

/** Small pill link that reveals on the section header (e.g. "לכל הנכסים ←"). */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="shrink-0 text-[14px] font-bold text-[color:var(--brand-link)] transition hover:opacity-80">{children}</Link>;
}

/** Branded no-image fallback — agent/office brand gradient + building motif
 *  (never a gray box + tiny icon, never a fabricated photo). */
function PropertyBrandFallback() {
  return (
    <div className="relative grid h-full w-full place-items-center overflow-hidden" style={{ background: "linear-gradient(135deg, var(--brand-soft) 0%, var(--brand-primary) 140%)" }}>
      <svg viewBox="0 0 120 80" className="h-1/2 w-1/2 text-[color:var(--brand-primary)] opacity-40" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
        <path d="M8 74V34l20-12 20 12v40M48 74V22l24-14 24 14v52M28 74v-14M28 48v-6M72 74v-16M88 74v-16M72 44v-6M88 44v-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** Premium property card — image dominates (price over the image), sale/rent chip. */
export function AgentPropertyCard({ property }: { property: SiteProperty }) {
  const loc = [property.neighborhood, property.city].filter(Boolean).join(", ");
  const priceLabel = property.listingKind === "rent"
    ? (money(property.monthlyRent) ? `${money(property.monthlyRent)} / חודש` : null)
    : money(property.price);
  const kindLabel = property.listingKind === "rent" ? "להשכרה" : property.listingKind === "sale" ? "למכירה" : null;
  const meta = [
    property.rooms != null ? `${property.rooms} חד׳` : null,
    property.sizeSqm != null ? `${property.sizeSqm} מ״ר` : null,
    property.floor != null ? `קומה ${property.floor}` : null,
  ].filter(Boolean);

  return (
    <Link
      href={property.href}
      className="group relative flex flex-col overflow-hidden rounded-3xl bg-[var(--brand-background)] shadow-[0_10px_30px_-18px_rgba(15,23,42,0.25)] ring-1 ring-[var(--brand-border)] transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_26px_50px_-24px_rgba(15,23,42,0.42)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-primary)]"
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <FavoriteButton label={`שמירת ${property.title} למועדפים`} />
        {kindLabel && <span className="absolute start-3 top-3 z-10 rounded-full bg-[var(--brand-primary)] px-3 py-1 text-[12px] font-black text-[var(--brand-on-primary)] shadow">{kindLabel}</span>}
        {property.tag && property.tag !== kindLabel && <span className="absolute end-3 top-3 z-10 rounded-lg bg-white/90 px-3 py-1 text-[12px] font-black text-[var(--brand-text)] shadow-sm backdrop-blur">{property.tag}</span>}
        {property.image
          ? <img src={property.image} alt={property.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
          : <PropertyBrandFallback />}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent p-5 pt-12">
          {priceLabel
            ? <div className="text-[24px] font-black text-white drop-shadow-sm">{priceLabel}</div>
            : <div className="text-[14px] font-bold text-white/90">מחיר לפי פנייה</div>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-5">
        <div className="line-clamp-1 text-[18px] font-black text-[var(--brand-text)]">{property.title}</div>
        {loc && <div className="line-clamp-1 text-[14px] text-[var(--brand-muted)]">{loc}</div>}
        {meta.length > 0 && (
          <div className="mt-2 flex items-center gap-3 text-[14px] font-semibold text-[var(--brand-text)]">
            {meta.map((m, i) => <span key={i} className="flex items-center gap-3">{i > 0 && <i className="h-3.5 w-px bg-[var(--brand-border)]" />}{m}</span>)}
          </div>
        )}
      </div>
    </Link>
  );
}

/** Centered proof composition of real trust-numbers — large numbers, clear
 *  labels. Responsive by REAL count (see statStripGridClass): 0 hides, 1 is a
 *  centered single-stat composition, 2 a balanced pair, 3–4 a responsive grid
 *  that wraps cleanly (no stray dividers). Only real values; never fabricated. */
export function StatStrip({ stats }: { stats: SiteStat[] }) {
  if (stats.length < 1) return null;
  return (
    <div className={`mx-auto grid ${statStripGridClass(stats.length)} gap-x-4 gap-y-8 sm:gap-x-8`}>
      {stats.map((s, i) => (
        <div key={i} className="flex flex-col items-center px-2 text-center">
          <div className="text-[44px] font-black leading-none tracking-tight text-[color:var(--brand-link)] sm:text-[64px]">{s.value}</div>
          <div className="mt-3 text-[15px] font-bold text-[var(--brand-muted)] sm:text-[16px]">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Small hero proof points row. */
export function ProofPoints({ points }: { points: SiteStat[] }) {
  if (!points.length) return null;
  return (
    <div className="flex flex-wrap gap-x-9 gap-y-3">
      {points.map((p, i) => (
        <div key={i} className="flex items-baseline gap-2">
          <span className="text-2xl font-black text-[var(--brand-text)]">{p.value}</span>
          <span className="text-[14px] font-semibold text-[var(--brand-muted)]">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Area chips. */
export function AreaChips({ areas }: { areas: (string | SiteArea)[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {areas.map((a, i) => {
        const name = typeof a === "string" ? a : a.name;
        return (
          <span key={i} className="rounded-full border border-[var(--brand-border)] bg-[var(--brand-background)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--brand-text)]">
            {name}
          </span>
        );
      })}
    </div>
  );
}
