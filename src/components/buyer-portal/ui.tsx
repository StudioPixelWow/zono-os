/* eslint-disable @next/next/no-img-element -- external CDN listing photos; next/image would require remotePatterns config */
// ============================================================================
// 🛒 Buyer Portal — shared presentational UI (server-safe). 32.3.
// Glass cards, stat pills, recommendation cards, portal nav. No client state.
// ============================================================================
import Link from "next/link";

const NAV: { href: string; label: string; icon: string }[] = [
  { href: "/buyer-portal/dashboard", label: "בית", icon: "🏠" },
  { href: "/buyer-portal/properties", label: "נכסים", icon: "🔑" },
  { href: "/buyer-portal/favorites", label: "מועדפים", icon: "❤️" },
  { href: "/buyer-portal/searches", label: "חיפושים", icon: "🔍" },
  { href: "/buyer-portal/appointments", label: "פגישות", icon: "📅" },
  { href: "/buyer-portal/messages", label: "הודעות", icon: "💬" },
  { href: "/buyer-portal/documents", label: "מסמכים", icon: "📄" },
  { href: "/buyer-portal/profile", label: "פרופיל", icon: "⚙️" },
];

export function PortalNav({ active }: { active: string }) {
  return (
    <nav className="sticky top-0 z-20 -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-white/40 bg-white/70 px-4 py-2 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={`shrink-0 rounded-xl px-3 py-1.5 text-[13px] font-bold transition ${active === n.href ? "text-white" : "text-slate-600 hover:bg-white"}`} style={active === n.href ? { background: "var(--bp-gradient)" } : undefined}>
          <span className="ml-1">{n.icon}</span>{n.label}
        </Link>
      ))}
    </nav>
  );
}

export function Glass({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-white/40 bg-white/60 shadow-xl backdrop-blur-md ${className}`}>{children}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/40 bg-white/60 px-4 py-3 text-center backdrop-blur-md">
      <div className="text-2xl font-black" style={{ color: "var(--bp-accent)" }}>{value}</div>
      <div className="text-[11px] text-slate-600">{label}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

const fmt = (n: number | null) => (n == null ? null : `₪${n.toLocaleString("he-IL")}`);
const TIER_HE: Record<string, string> = { perfect: "התאמה מושלמת", emerging: "מתפתחת", hidden: "נסתרת", future: "עתידית" };

export function RecoCard({ id, title, price, image, city, neighborhood, matchScore, tier, why }: { id: string; title: string; price: number | null; image: string | null; city: string | null; neighborhood: string | null; matchScore: number; tier: string; why: string[] }) {
  return (
    <Link href={`/buyer-portal/property/${id}`} className="group overflow-hidden rounded-2xl border border-white/40 bg-white/60 shadow-md backdrop-blur-md transition hover:shadow-xl">
      <div className="relative aspect-[4/3] bg-slate-100">
        {image ? <img src={image} alt={title} className="h-full w-full object-cover transition group-hover:scale-105" loading="lazy" /> : <div className="flex h-full items-center justify-center text-slate-400">🏠</div>}
        <span className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: "var(--bp-gradient)" }}>{TIER_HE[tier] ?? "התאמה"} · {matchScore}</span>
      </div>
      <div className="p-3">
        <div className="line-clamp-1 text-[13px] font-bold text-slate-800">{title}</div>
        <div className="text-[12px] text-slate-500">{[neighborhood, city].filter(Boolean).join(", ")}</div>
        {fmt(price) && <div className="text-[13px] font-black" style={{ color: "var(--bp-accent)" }}>{fmt(price)}</div>}
        {why[0] && <div className="mt-1 line-clamp-1 text-[11px] text-emerald-700">✓ {why[0]}</div>}
      </div>
    </Link>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return <Glass className="p-10 text-center"><p className="text-[15px] font-black text-slate-700">{title}</p><p className="mt-1 text-[13px] text-slate-500">{body}</p></Glass>;
}

export function AuthGate({ state, email }: { state: "unauthenticated" | "unlinked"; email?: string | null }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="text-5xl">🛒</div>
      <h1 className="mt-4 text-2xl font-black text-slate-900">פורטל הקונה של ZONO</h1>
      {state === "unauthenticated" ? (
        <>
          <p className="mt-2 text-[14px] text-slate-600">התחברו כדי לגשת למרחב האישי שלכם — המלצות, נכסים שמורים, פגישות ותובנות.</p>
          <Link href="/login" className="mt-6 inline-block rounded-xl px-6 py-2.5 text-sm font-bold text-white" style={{ background: "var(--bp-gradient)" }}>התחברות</Link>
        </>
      ) : (
        <p className="mt-2 text-[14px] text-slate-600">החשבון {email ? `(${email}) ` : ""}עדיין לא מקושר לתיק קונה. פנו לברוקר שלכם כדי להפעיל את הפורטל האישי.</p>
      )}
    </div>
  );
}
