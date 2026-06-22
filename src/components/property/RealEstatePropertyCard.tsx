import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";

/**
 * Shared real-estate card — one consistent language/style for internal
 * properties, external listings and project units (#P3-3). Callers map their
 * row into this normalized shape; no CRM/internal wording leaks in.
 */
export interface RealEstateCardData {
  href: string;
  title: string;
  imageUrl?: string | null;
  statusLabel?: string | null;
  statusTone?: string;
  /** למכירה / להשכרה */
  dealLabel?: string | null;
  price?: number | null;
  priceLabel?: string | null; // pre-formatted (e.g. "₪2,200,000")
  addressLine?: string | null;
  rooms?: number | null;
  sqm?: number | null;
  floor?: number | null;
  parking?: number | null;
  tags?: string[]; // חדש / בלעדי / בהזדמנות
  ctaLabel?: string;
}

const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;

export function RealEstatePropertyCard({ d }: { d: RealEstateCardData }) {
  const price = d.priceLabel ?? (d.price != null && d.price > 0 ? ils(d.price) : "—");
  return (
    <Link
      href={d.href}
      className="bg-card border-line hover:shadow-[var(--shadow-lift)] flex flex-col overflow-hidden rounded-[22px] border shadow-[var(--shadow-card)] transition-shadow"
    >
      <div className="bg-surface relative aspect-[16/10] overflow-hidden">
        {d.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.imageUrl} alt={d.title} className="h-full w-full object-cover" />
        ) : (
          <div className="text-muted grid h-full place-items-center"><Icon name="Building2" size={32} /></div>
        )}
        <div className="absolute end-3 top-3 flex flex-wrap gap-1.5">
          {d.dealLabel && <Badge tone="brand" size="sm">{d.dealLabel}</Badge>}
          {d.statusLabel && <Badge tone={(d.statusTone ?? "neutral") as never} size="sm">{d.statusLabel}</Badge>}
        </div>
        {(d.tags ?? []).length > 0 && (
          <div className="absolute start-3 top-3 flex flex-wrap gap-1.5">
            {d.tags!.map((t) => <Badge key={t} tone="success" size="sm">{t}</Badge>)}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 p-5">
        <h3 className="text-ink text-base font-extrabold leading-snug">{d.title}</h3>
        {d.addressLine && <p className="text-muted text-sm">{d.addressLine}</p>}
        <p className="text-brand-strong text-lg font-black">{price}</p>
        <div className="text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium">
          <span>{d.rooms ?? "—"} חדרים</span>
          <span className="bg-line h-3 w-px" />
          <span>{d.sqm ?? "—"} מ״ר</span>
          <span className="bg-line h-3 w-px" />
          <span>קומה {d.floor ?? "—"}</span>
          {d.parking != null && d.parking > 0 && (<><span className="bg-line h-3 w-px" /><span>{d.parking} חניה</span></>)}
        </div>
        <span className={cn("text-brand-strong mt-1 inline-flex items-center gap-1 text-[13px] font-bold")}>
          {d.ctaLabel ?? "לפרטים נוספים"} <Icon name="ChevronLeft" size={14} />
        </span>
      </div>
    </Link>
  );
}
