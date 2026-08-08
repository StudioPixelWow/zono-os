// ============================================================================
// ZONO — Home "נכסים חדשים באזור": private-owner (no-broker) listings with a
// direct WhatsApp-to-owner CTA. Real external listings (has_agent=false) with a
// photo + owner phone. Light, RTL, premium — matches the ZONO card language.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import type { HomePrivateListing } from "./types";

const ils = (n: number | null) => (n && n > 0 ? `₪${Math.round(n).toLocaleString("he-IL")}` : "מחיר לא צויין");

function Card({ p }: { p: HomePrivateListing }) {
  const loc = [p.neighborhood, p.city].filter(Boolean).join(", ");
  return (
    <div className="bg-card border-line flex flex-col overflow-hidden rounded-2xl border shadow-[var(--shadow-soft)]">
      <Link href={p.href} className="relative block aspect-[4/3] overflow-hidden bg-surface">
        {p.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.imageUrl} alt={p.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="text-muted/60 flex h-full w-full items-center justify-center"><Icon name="Building2" size={28} /></div>
        )}
        <span className="bg-success-soft text-success absolute end-2 top-2 rounded-full px-2.5 py-1 text-[10px] font-black">ללא מתווך</span>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="text-ink truncate text-sm font-black">{p.title}</p>
          {loc && <p className="text-muted truncate text-[12px]">{loc}</p>}
        </div>
        <p className="text-brand-strong text-base font-black">{ils(p.price)}</p>
        <div className="text-muted flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
          {p.rooms ? <span className="inline-flex items-center gap-1"><Icon name="LayoutGrid" size={12} /> {p.rooms} חד׳</span> : null}
          {p.sqm ? <span className="inline-flex items-center gap-1"><Icon name="Maximize2" size={12} /> {p.sqm} מ״ר</span> : null}
          {p.floor != null ? <span className="inline-flex items-center gap-1"><Icon name="Building" size={12} /> קומה {p.floor}</span> : null}
        </div>
        <div className="mt-auto flex items-center gap-2 pt-1">
          {p.whatsappUrl ? (
            <a
              href={p.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-2 text-[13px] font-black text-white transition hover:brightness-95"
            >
              <Icon name="MessageCircle" size={15} /> וואטסאפ לבעלים
            </a>
          ) : (
            <span className="bg-surface text-muted inline-flex flex-1 items-center justify-center rounded-xl px-3 py-2 text-[12px] font-bold">אין טלפון זמין</span>
          )}
          <Link href={p.href} className="border-line text-ink hover:bg-surface inline-flex items-center justify-center rounded-xl border px-3 py-2 text-[13px] font-bold transition">
            לפרטים
          </Link>
        </div>
      </div>
    </div>
  );
}

export function PrivateOwnerListings({ items }: { items: HomePrivateListing[] }) {
  if (items.length === 0) {
    return (
      <div className="bg-card border-line text-muted flex flex-col items-center justify-center gap-1 rounded-[22px] border p-8 text-center shadow-[var(--shadow-card)]">
        <Icon name="Home" size={24} className="text-muted/70" />
        <p className="text-ink text-sm font-bold">אין כרגע נכסים חדשים ללא מתווך באזור</p>
        <p className="text-xs">ZONO תמשיך לסרוק ותציף נכסים פרטיים חדשים אוטומטית</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5" dir="rtl">
      {items.map((p) => <Card key={p.id} p={p} />)}
    </div>
  );
}
