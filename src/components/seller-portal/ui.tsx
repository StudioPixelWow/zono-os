// ============================================================================
// 🏷️ Seller Portal — shared presentational UI (server-safe). 32.4.
// Consistent with the Buyer Portal; seller (teal/emerald) accent. No client state.
// ============================================================================
import Link from "next/link";

const NAV: { href: string; label: string; icon: string }[] = [
  { href: "/seller-portal/dashboard", label: "בית", icon: "🏠" },
  { href: "/seller-portal/property", label: "הנכס", icon: "🔑" },
  { href: "/seller-portal/buyers", label: "קונים", icon: "🧲" },
  { href: "/seller-portal/activity", label: "פעילות", icon: "📈" },
  { href: "/seller-portal/appointments", label: "פגישות", icon: "📅" },
  { href: "/seller-portal/messages", label: "הודעות", icon: "💬" },
  { href: "/seller-portal/documents", label: "מסמכים", icon: "📄" },
  { href: "/seller-portal/profile", label: "פרופיל", icon: "⚙️" },
];

export function PortalNav({ active }: { active: string }) {
  return (
    <nav className="sticky top-0 z-20 -mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-white/40 bg-white/70 px-4 py-2 backdrop-blur-md sm:mx-0 sm:rounded-2xl sm:border">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={`shrink-0 rounded-xl px-3 py-1.5 text-[13px] font-bold transition ${active === n.href ? "text-white" : "text-slate-600 hover:bg-white"}`} style={active === n.href ? { background: "var(--sp-gradient)" } : undefined}>
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
      <div className="text-2xl font-black" style={{ color: "var(--sp-accent)" }}>{value}</div>
      <div className="text-[11px] text-slate-600">{label}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

const TIER_HE: Record<string, string> = { perfect: "קונה מוביל", emerging: "מתפתח", waiting: "בהמתנה" };

export function BuyerCard({ rank, score, tier, label, why }: { rank: number; score: number; tier: string; label: string; why: string[] }) {
  return (
    <div className="rounded-2xl border border-white/40 bg-white/60 p-3 shadow-md backdrop-blur-md">
      <div className="flex items-center justify-between">
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: "var(--sp-gradient)" }}>{TIER_HE[tier] ?? "קונה"} · {score}</span>
        <span className="text-[11px] text-slate-400">#{rank}</span>
      </div>
      <div className="mt-1.5 text-[13px] font-bold text-slate-800">{label}</div>
      {why[0] && <div className="mt-1 line-clamp-1 text-[11px] text-emerald-700">✓ {why[0]}</div>}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return <Glass className="p-10 text-center"><p className="text-[15px] font-black text-slate-700">{title}</p><p className="mt-1 text-[13px] text-slate-500">{body}</p></Glass>;
}

export function AuthGate({ state, email }: { state: "unauthenticated" | "unlinked"; email?: string | null }) {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <div className="text-5xl">🏷️</div>
      <h1 className="mt-4 text-2xl font-black text-slate-900">פורטל המוכר של ZONO</h1>
      {state === "unauthenticated" ? (
        <>
          <p className="mt-2 text-[14px] text-slate-600">התחברו כדי לגשת למרחב האישי שלכם — ביצועי הנכס, קונים, הערכת שווי ותובנות.</p>
          <Link href="/login" className="mt-6 inline-block rounded-xl px-6 py-2.5 text-sm font-bold text-white" style={{ background: "var(--sp-gradient)" }}>התחברות</Link>
        </>
      ) : (
        <p className="mt-2 text-[14px] text-slate-600">החשבון {email ? `(${email}) ` : ""}עדיין לא מקושר לתיק מוכר. פנו לברוקר שלכם כדי להפעיל את הפורטל האישי.</p>
      )}
    </div>
  );
}
