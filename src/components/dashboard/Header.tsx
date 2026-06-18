"use client";

import { Icon } from "./Icon";
import { useCurrentOrganization, useCurrentUser } from "./DashboardDataProvider";

/** Top bar: logo + tagline, search, notifications, profile, primary CTA. */
export function Header() {
  const user = useCurrentUser();
  const organization = useCurrentOrganization();

  const displayName = user?.fullName?.trim() || "משתמש";
  const roleLabel = user?.roleLabel || "סוכן";
  const tagline = organization?.name || "הסוכן החזק בזון שלך";

  return (
    <header className="bg-surface/80 sticky top-0 z-30 backdrop-blur-xl">
      <div className="border-line flex items-center gap-3 border-b px-4 py-3 sm:gap-4 sm:px-6 lg:px-8">
        {/* Logo + tagline */}
        <div className="flex items-center gap-2.5">
          <div className="bg-brand text-white grid h-9 w-9 place-items-center rounded-xl text-base font-black shadow-[0_6px_16px_rgba(124,58,237,0.35)] lg:hidden">
            Z
          </div>
          <div className="leading-tight">
            <span className="text-ink text-xl font-black tracking-tight">
              ZONO
            </span>
            <p className="text-muted hidden text-[11px] font-medium sm:block">
              {tagline}
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mx-auto hidden w-full max-w-xl md:block">
          <span className="text-muted pointer-events-none absolute inset-y-0 end-3 flex items-center">
            <Icon name="Search" size={18} />
          </span>
          <input
            type="search"
            placeholder="חיפוש נכס, לקוח, שכונה, רחוב..."
            className="bg-card border-line text-ink placeholder:text-muted focus:border-brand-light focus:ring-brand/15 h-11 w-full rounded-2xl border pe-10 ps-4 text-sm outline-none transition focus:ring-4"
          />
        </div>

        {/* Right cluster */}
        <div className="ms-auto flex items-center gap-2 sm:gap-3 md:ms-0">
          <button
            type="button"
            className="bg-card border-line text-muted hover:text-brand hover:border-brand-light relative grid h-11 w-11 place-items-center rounded-2xl border transition"
            aria-label="התראות"
          >
            <Icon name="Bell" size={20} />
            <span className="bg-danger absolute end-2.5 top-2.5 h-2 w-2 rounded-full ring-2 ring-white" />
          </button>

          <div className="bg-card border-line hidden items-center gap-2.5 rounded-2xl border py-1.5 pe-1.5 ps-3 sm:flex">
            <div className="leading-tight">
              <p className="text-ink text-sm font-bold">{displayName}</p>
              <p className="text-muted text-[11px]">{roleLabel}</p>
            </div>
            <div className="from-brand to-brand-light grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br text-sm font-black text-white">
              {displayName.charAt(0)}
            </div>
          </div>

          <button
            type="button"
            className="bg-brand hover:bg-brand-strong inline-flex h-11 items-center gap-2 rounded-2xl px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(124,58,237,0.3)] transition"
          >
            <Icon name="Plus" size={18} strokeWidth={2.2} />
            <span className="hidden sm:inline">פעולה חדשה</span>
          </button>
        </div>
      </div>
    </header>
  );
}
