/* eslint-disable @next/next/no-img-element -- external CDN listing photos; next/image would require remotePatterns config */
// ============================================================================
// 🌍 Area Portal — shared presentational UI (server-safe). 32.5.
// Magazine-quality glass cards, stats, listing/transaction/insight cards,
// breadcrumbs, JSON-LD injector. RTL. No client state.
// ============================================================================
import Link from "next/link";

export function JsonLd({ data }: { data: Record<string, unknown>[] }) {
  return <>{data.map((d, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(d) }} />)}</>;
}

export function Glass({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-white/40 bg-white/60 shadow-xl backdrop-blur-md ${className}`}>{children}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/40 bg-white/60 px-4 py-3 text-center backdrop-blur-md">
      <div className="text-xl font-black sm:text-2xl" style={{ color: "var(--ap-accent)" }}>{value}</div>
      <div className="text-[11px] text-slate-600">{label}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

export function Breadcrumbs({ trail }: { trail: { name: string; href?: string }[] }) {
  return (
    <nav className="mb-4 flex flex-wrap items-center gap-1 text-[12px] text-slate-500">
      {trail.map((t, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <span className="opacity-50">/</span>}
          {t.href ? <Link href={t.href} className="font-semibold hover:text-slate-800">{t.name}</Link> : <span className="font-bold text-slate-700">{t.name}</span>}
        </span>
      ))}
    </nav>
  );
}

const fmt = (n: number | null) => (n == null ? null : `₪${n.toLocaleString("he-IL")}`);

export function ListingCard({ title, price, image, rooms, area, neighborhood, tags }: { title: string; price: number | null; image: string | null; rooms: number | null; area: number | null; neighborhood: string | null; tags: string[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/40 bg-white/60 shadow-md backdrop-blur-md">
      <div className="relative aspect-[4/3] bg-slate-100">
        {image ? <img src={image} alt={title} className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center text-slate-400">🏠</div>}
        {tags[0] && <span className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: "var(--ap-gradient)" }}>{tags[0]}</span>}
      </div>
      <div className="p-3">
        <div className="line-clamp-1 text-[13px] font-bold text-slate-800">{title}</div>
        <div className="text-[11px] text-slate-500">{[neighborhood, rooms ? `${rooms} חד׳` : null, area ? `${area} מ״ר` : null].filter(Boolean).join(" · ")}</div>
        {fmt(price) && <div className="text-[13px] font-black" style={{ color: "var(--ap-accent)" }}>{fmt(price)}</div>}
      </div>
    </div>
  );
}

const INSIGHT_ICON: Record<string, string> = { summary: "📋", buy: "🛒", sell: "🏷️", invest: "💰", warning: "⚠️", luxury: "💎", demand: "🔥", outlook: "🔭" };
export function InsightCard({ kind, title, body, evidence }: { kind: string; title: string; body: string; evidence: string[] }) {
  return (
    <Glass className="p-4">
      <h3 className="text-[15px] font-black text-slate-800">{INSIGHT_ICON[kind] ?? "•"} {title}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{body}</p>
      {evidence.length > 0 && <p className="mt-2 text-[11px] text-slate-400">מבוסס על: {evidence.join(" · ")}</p>}
    </Glass>
  );
}

export function OfficeRow({ name, brokers, listings }: { name: string; brokers: number; listings: number }) {
  return <div className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-[13px]"><span className="font-bold text-slate-800">{name}</span><span className="text-slate-500">{listings} נכסים · {brokers} מתווכים</span></div>;
}
export function BrokerRow({ name, agency, listings, verified }: { name: string; agency: string | null; listings: number; verified: boolean }) {
  return <div className="flex items-center justify-between rounded-xl bg-white/60 px-3 py-2 text-[13px]"><span className="font-bold text-slate-800">{name}{verified && <span className="ml-1 text-emerald-600">✓</span>}{agency && <span className="text-slate-400"> · {agency}</span>}</span><span className="text-slate-500">{listings} נכסים</span></div>;
}
