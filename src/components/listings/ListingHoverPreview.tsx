"use client";

import { useRef, useState } from "react";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { getListingPreviewAction } from "@/lib/external-listings/actions";
import type { ListingPreview } from "@/lib/external-listings/service";

const SOURCE_LABEL: Record<string, string> = {
  private_seller: "מוכר פרטי",
  broker: "פרסום מתווך",
  agency: "משרד תיווך",
  office: "משרד תיווך",
  unknown: "לא ידוע",
};

/**
 * Reusable hover quick-preview for an external listing. Wrap any property-name
 * trigger anywhere in the app. Lazily fetches rich data (images, description,
 * insights) on first hover and caches it — surfaces info NOT in the row.
 */
export function ListingHoverPreview({
  listingId,
  children,
  className,
}: {
  listingId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ListingPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const fetched = useRef(false);

  const onEnter = () => {
    setOpen(true);
    if (fetched.current) return;
    fetched.current = true;
    setLoading(true);
    getListingPreviewAction(listingId)
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  };

  return (
    <span
      className={cn("group/lhp relative inline-block", className)}
      onMouseEnter={onEnter}
      onMouseLeave={() => setOpen(false)}
    >
      {children}
      {open && (
        <span className="border-line bg-card absolute top-full start-0 z-50 mt-1 block w-80 rounded-2xl border p-0 text-start shadow-[var(--shadow-lift)]">
          {loading && !data ? (
            <span className="text-muted flex items-center gap-2 p-4 text-xs">
              <Icon name="Clock" size={14} /> טוען תצוגה מקדימה…
            </span>
          ) : !data ? (
            <span className="text-muted block p-4 text-xs">אין נתונים זמינים</span>
          ) : (
            <PreviewCard d={data} />
          )}
        </span>
      )}
    </span>
  );
}

function PreviewCard({ d }: { d: ListingPreview }) {
  const meta = [
    d.rooms != null ? `${d.rooms} חד׳` : null,
    d.sqm != null ? `${d.sqm} מ״ר` : null,
    d.floor != null ? `קומה ${d.floor}${d.totalFloors ? `/${d.totalFloors}` : ""}` : null,
  ].filter(Boolean) as string[];

  return (
    <span className="block">
      {/* Images */}
      {d.images.length > 0 ? (
        <span className="flex gap-0.5 overflow-hidden rounded-t-2xl">
          {d.images.slice(0, 3).map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              className={cn("h-24 object-cover", d.images.length === 1 ? "w-full" : "w-1/3")}
              loading="lazy"
            />
          ))}
        </span>
      ) : (
        <span className="bg-surface text-muted flex h-20 items-center justify-center rounded-t-2xl">
          <Icon name="Building2" size={20} />
        </span>
      )}

      <span className="block p-3">
        <span className="flex items-start justify-between gap-2">
          <b className="text-ink text-sm font-extrabold leading-tight">{d.title ?? "מודעה"}</b>
          {d.opportunityScore > 0 && (
            <span className="bg-brand-soft text-brand-strong shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold">{d.opportunityScore}</span>
          )}
        </span>
        <span className="text-muted mt-0.5 block text-[11px]">
          {[d.neighborhood, d.address, d.city].filter(Boolean).join(" · ") || "—"}
        </span>

        <span className="text-ink mt-2 flex items-center gap-2 text-sm font-black">
          {d.price ? formatShekels(d.price) : "—"}
          {d.pricePerSqm && <span className="text-muted text-[11px] font-bold">₪{d.pricePerSqm.toLocaleString()}/מ״ר</span>}
        </span>
        {meta.length > 0 && <span className="text-muted mt-0.5 block text-[11px]">{meta.join(" · ")}</span>}

        <span className="text-muted mt-1 block text-[11px]">
          סוג פרסום: <b className="text-ink">{SOURCE_LABEL[d.sourceType] ?? SOURCE_LABEL.unknown}</b>
          {d.detectedBrokerName ? ` · ${d.detectedBrokerName}` : d.contactName ? ` · ${d.contactName}` : ""}
        </span>

        {d.description && (
          <span className="text-muted mt-2 block text-[11px] leading-relaxed" style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {d.description}
          </span>
        )}

        {d.insights.length > 0 && (
          <span className="border-line mt-2 block border-t pt-2">
            {d.insights.map((ins, i) => (
              <span key={i} className="text-ink flex items-start gap-1.5 text-[11px] leading-snug">
                <span className="text-brand-strong mt-[3px]">•</span>
                <span>{ins}</span>
              </span>
            ))}
          </span>
        )}
      </span>
    </span>
  );
}
