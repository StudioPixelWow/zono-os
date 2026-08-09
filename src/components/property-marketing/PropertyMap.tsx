"use client";
// Property location (spec §15) — real map with a brand-toned marker ONLY when the
// exact address is public; otherwise an area block (no precise pin) so a private
// address is never revealed. Map lazy-loaded (does not block initial render).
import dynamic from "next/dynamic";
import type { ZonoMapPoint } from "@/components/maps/ZonoMap";

const ZonoMap = dynamic(() => import("@/components/maps/ZonoMap").then((m) => m.ZonoMap), {
  ssr: false,
  loading: () => <div className="grid h-[360px] w-full place-items-center rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)] text-[var(--brand-muted)]">טוען מפה…</div>,
});

export function PropertyMap({ lat, lng, exact, area, title }: { lat: number | null; lng: number | null; exact: boolean; area: string; title: string }) {
  const hasPin = exact && lat != null && lng != null;
  if (hasPin) {
    const point: ZonoMapPoint = { id: "prop", lat: lat as number, lng: lng as number, title, tone: "brand" };
    return (
      <div className="overflow-hidden rounded-2xl border border-[var(--brand-border)]">
        <ZonoMap points={[point]} heightClass="h-[380px]" initialZoom={15} emptyMessage="" />
      </div>
    );
  }
  // Private address → area context only, no precise marker.
  return (
    <div className="grid h-[240px] place-items-center rounded-2xl border border-[var(--brand-border)] bg-[var(--brand-surface)]">
      <div className="text-center">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-[var(--brand-soft)] text-[color:var(--brand-primary)]">
          <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden><path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z" /><circle cx={12} cy={10} r={2.5} /></svg>
        </div>
        <div className="text-[16px] font-black text-[var(--brand-text)]">{area || "אזור הנכס"}</div>
        <div className="mt-1 text-[13px] text-[var(--brand-muted)]">הכתובת המדויקת תימסר בפנייה לסוכן</div>
      </div>
    </div>
  );
}
