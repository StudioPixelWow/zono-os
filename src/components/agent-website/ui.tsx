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
              {title && <h2 className="text-2xl font-black leading-tight text-[var(--brand-text)] sm:text-3xl">{title}</h2>}
              {subtitle && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-[var(--brand-muted)]">{subtitle}</p>}
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
        {kindLabel && <span className="absolute start-3 top-3 z-10 rounded-full bg-[var(--brand-primary)] px-2.5 py-1 text-[11px] font-black text-[var(--brand-on-primary)] shadow">{kindLabel}</span>}
        {property.tag && property.tag !== kindLabel && <span className="absolute end-3 top-3 z-10 rounded-lg bg-white/90 px-2.5 py-1 text-[11px] font-black text-[var(--brand-text)] shadow-sm backdrop-blur">{property.tag}</span>}
        {property.image
          ? <img src={property.image} alt={property.title} loading="lazy" decoding="async" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]" />
          : <PropertyBrandFallback />}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent p-4 pt-10">
          {priceLabel
            ? <div className="text-[19px] font-black text-white drop-shadow-sm">{priceLabel}</div>
            : <div className="text-[13px] font-bold text-white/90">מחיר לפי פנייה</div>}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="line-clamp-1 text-[15px] font-black text-[var(--brand-text)]">{property.title}</div>
        {loc && <div className="line-clamp-1 text-[13px] text-[var(--brand-muted)]">{loc}</div>}
        {meta.length > 0 && (
          <div className="mt-1.5 flex items-center gap-2.5 text-[12px] font-semibold text-[var(--brand-muted)]">
            {meta.map((m, i) => <span key={i} className="flex items-center gap-2.5">{i > 0 && <i className="h-3 w-px bg-[var(--brand-border)]" />}{m}</span>)}
          </div>
        )}
      </div>
    </Link>
  );
}

/** Big trust-numbers strip (only real values). */
export function StatStrip({ stats }: { stats: SiteStat[] }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 sm:justify-start">
      {stats.map((s, i) => (
        <div key={i} className="text-center sm:text-start">
          <div className="text-3xl font-black text-[color:var(--brand-link)] sm:text-4xl">{s.value}</div>
          <div className="mt-1 text-[13px] font-semibold text-[var(--brand-muted)]">{s.label}</div>
        </div>
      ))}
    </div>
  );
}

/** Small hero proof points row. */
export function ProofPoints({ points }: { points: SiteStat[] }) {
  if (!points.length) return null;
  return (
    <div className="flex flex-wrap gap-x-8 gap-y-3">
      {points.map((p, i) => (
        <div key={i} className="flex items-baseline gap-2">
          <span className="text-xl font-black text-[var(--brand-text)]">{p.value}</span>
          <span className="text-[13px] font-semibold text-[var(--brand-muted)]">{p.label}</span>
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
