"use client";
// Signature "האזור שלי. המומחיות שלי." section (spec §9/§10). Renders a REAL
// map from geocoded property coordinates via the shared <ZonoMap>; when there
// are no coordinates it falls back cleanly to an Area-Expertise panel — never a
// broken/empty map. Map is lazy-loaded so it never blocks initial render (§24).
import dynamic from "next/dynamic";
import Link from "next/link";
import type { SiteProperty, SiteArea } from "@/lib/agent-website/site-data";
import type { ZonoMapPoint } from "@/components/maps/ZonoMap";
import { AreaChips } from "./ui";

const ZonoMap = dynamic(() => import("@/components/maps/ZonoMap").then((m) => m.ZonoMap), {
  ssr: false,
  loading: () => <div className="grid h-full min-h-[340px] w-full place-items-center rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-muted)]">טוען מפה…</div>,
});

const money = (n: number | null) => (typeof n === "number" && n > 0 ? `₪${n.toLocaleString("he-IL")}` : null);

export function ExpertiseMap({ points, areas, primaryArea, propertiesHref }: {
  points: SiteProperty[]; areas: SiteArea[]; primaryArea: string | null; propertiesHref: string;
}) {
  const mapPoints: ZonoMapPoint[] = points.map((p) => ({
    id: p.id, lat: p.lat as number, lng: p.lng as number, title: p.title,
    details: [money(p.price) ?? "", [p.rooms ? `${p.rooms} חד׳` : "", p.sizeSqm ? `${p.sizeSqm} מ״ר` : ""].filter(Boolean).join(" · ")].filter(Boolean),
    href: p.href, imageUrl: p.image, tone: "brand",
  }));
  const heading = primaryArea ? `המומחה שלך לנדל״ן ב${primaryArea}` : "האזור שלי. המומחיות שלי.";
  const hasMap = mapPoints.length > 0;
  const useHeat = mapPoints.length >= 4; // heat map with cluster counts once several properties are geocoded

  return (
    <section id="areas" className="bg-[var(--brand-surface)]">
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-5 py-14 sm:px-8 lg:grid-cols-[1.4fr_1fr] lg:py-20">
        <div className="order-2 lg:order-1">
          {hasMap ? (
            <div className="overflow-hidden rounded-2xl border border-[var(--brand-border)]">
              <ZonoMap points={mapPoints} heightClass="h-[420px]" clusterThreshold={5} markersWithHeat heatmap={useHeat} markerRevealZoom={15} emptyMessage="אין עדיין נכסים ממופים" />
            </div>
          ) : (
            <AreaFallback areas={areas} />
          )}
        </div>

        <div className="order-1 flex flex-col justify-center lg:order-2">
          <div className="mb-1 text-[13px] font-bold text-[color:var(--brand-link)]">אזורי התמחות</div>
          <h2 className="text-2xl font-black leading-tight text-[var(--brand-text)] sm:text-3xl">{heading}</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--brand-muted)]">היכרות מעמיקה עם האזור מביאה תוצאות — כל רחוב, כל שכונה, וכל הזדמנות.</p>

          {areas.length > 0 && (
            <div className="mt-5">
              <AreaChips areas={areas} />
            </div>
          )}

          {/* Only real numbers (spec §10/§18) */}
          {areas.some((a) => a.deals || a.inventory) && (
            <div className="mt-6 flex flex-wrap gap-x-10 gap-y-4">
              {areas.filter((a) => a.deals || a.inventory).slice(0, 3).map((a) => (
                <div key={a.name}>
                  <div className="text-2xl font-black text-[color:var(--brand-link)]">{a.deals ?? a.inventory}</div>
                  <div className="text-[12px] font-semibold text-[var(--brand-muted)]">{a.deals ? `עסקאות ב${a.name}` : `נכסים ב${a.name}`}</div>
                </div>
              ))}
            </div>
          )}

          <Link href={propertiesHref} className="mt-7 inline-flex w-fit items-center gap-2 rounded-xl bg-[var(--brand-primary)] px-5 py-3 text-[14px] font-bold text-[var(--brand-on-primary)] transition hover:bg-[color:var(--brand-primary-hover)]">
            צפו בנכסים באזור
          </Link>
        </div>
      </div>
    </section>
  );
}

function AreaFallback({ areas }: { areas: SiteArea[] }) {
  return (
    <div className="grid min-h-[340px] grid-cols-2 gap-3 rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-background)] p-5 sm:grid-cols-3">
      {areas.slice(0, 9).map((a) => (
        <div key={a.name} className="flex flex-col justify-center rounded-xl border border-[var(--brand-border)] p-4 text-center">
          <div className="text-[15px] font-black text-[var(--brand-text)]">{a.name}</div>
          {(a.deals || a.inventory) ? <div className="mt-1 text-[12px] font-semibold text-[color:var(--brand-link)]">{a.deals ? `${a.deals} עסקאות` : `${a.inventory} נכסים`}</div> : null}
        </div>
      ))}
    </div>
  );
}
