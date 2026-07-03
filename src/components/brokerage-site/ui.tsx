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

export function PropertyCard({ slug, id, title, price, image, badge }: { slug: string; id: string; title: string; price: number | null; image: string | null; badge?: string | null }) {
  return (
    <Link href={`/ai-site/${slug}/property/${id}`} className="group overflow-hidden rounded-2xl border border-white/40 bg-white/60 shadow-md backdrop-blur-md transition hover:shadow-xl">
      <div className="relative aspect-[4/3] bg-slate-100">
        {image ? <img src={image} alt={title} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" /> : <div className="flex h-full items-center justify-center text-slate-400">🏠</div>}
        {badge && <span className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: "var(--site-gradient)" }}>{badge}</span>}
      </div>
      <div className="p-3">
        <div className="line-clamp-1 text-[13px] font-bold text-slate-800">{title}</div>
        {fmt(price) && <div className="text-[13px] font-black" style={{ color: "var(--site-accent)" }}>{fmt(price)}</div>}
      </div>
    </Link>
  );
}
