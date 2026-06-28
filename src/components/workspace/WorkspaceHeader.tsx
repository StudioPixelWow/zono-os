// ============================================================================
// ZONO — Workspace shell (presentation only · RTL · server-safe).
// ----------------------------------------------------------------------------
// One consistent header + quick-links strip for the three independent
// workspaces: 🏠 הנכסים שלי · 🏢 מלאי המשרד · 🌍 מודיעין שוק. No data, no logic,
// no intelligence — pure layout that frames each world distinctly so the three
// never feel mixed. Reused by every workspace landing.
// ============================================================================
import Link from "next/link";

export type WorkspaceScope = "personal" | "office" | "market";

const SCOPE_THEME: Record<WorkspaceScope, { ring: string; chip: string; badge: string }> = {
  personal: { ring: "from-brand-soft/60", chip: "bg-brand-soft text-brand-strong", badge: "CRM אישי" },
  office: { ring: "from-sky-100", chip: "bg-sky-100 text-sky-700", badge: "מלאי משרד" },
  market: { ring: "from-emerald-100", chip: "bg-emerald-100 text-emerald-700", badge: "מודיעין שוק" },
};

export function WorkspaceHeader({
  emoji, title, subtitle, scope, action,
}: {
  emoji: string;
  title: string;
  subtitle: string;
  scope: WorkspaceScope;
  action?: React.ReactNode;
}) {
  const theme = SCOPE_THEME[scope];
  return (
    <header dir="rtl" className={`border-line bg-card relative overflow-hidden rounded-3xl border bg-gradient-to-bl ${theme.ring} to-transparent p-5 sm:p-6`}>
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none sm:text-4xl" aria-hidden>{emoji}</span>
          <div>
            <span className={`mb-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-black ${theme.chip}`}>{theme.badge}</span>
            <h1 className="text-ink text-2xl font-black sm:text-3xl">{title}</h1>
            <p className="text-muted mt-1 max-w-2xl text-sm">{subtitle}</p>
          </div>
        </div>
        {action}
      </div>
    </header>
  );
}

export interface WorkspaceLink { href: string; emoji: string; label: string; hint?: string }

/** Quick-links strip to the related EXISTING surfaces for a workspace. */
export function WorkspaceLinks({ links }: { links: WorkspaceLink[] }) {
  if (!links.length) return null;
  return (
    <nav dir="rtl" className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {links.map((l) => (
        <Link
          key={l.href + l.label}
          href={l.href}
          className="border-line bg-card hover:border-brand-light group flex items-center gap-2.5 rounded-2xl border p-3 transition"
        >
          <span className="text-xl leading-none" aria-hidden>{l.emoji}</span>
          <span className="min-w-0">
            <span className="text-ink group-hover:text-brand-strong block truncate text-sm font-bold transition">{l.label}</span>
            {l.hint && <span className="text-muted block truncate text-[11px]">{l.hint}</span>}
          </span>
        </Link>
      ))}
    </nav>
  );
}
