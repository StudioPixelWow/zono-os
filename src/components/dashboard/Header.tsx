"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "./Icon";
import { useCurrentUser } from "./DashboardDataProvider";
import { ProfileEditPopup } from "./ProfileEditPopup";

/** Top bar: search, notifications, profile. */
export function Header() {
  const user = useCurrentUser();
  const [editOpen, setEditOpen] = useState(false);

  const displayName = user?.fullName?.trim() || "משתמש";
  const roleLabel = user?.roleLabel || "סוכן";
  const avatarUrl = user?.avatarUrl || null;

  return (
    <header className="bg-surface/80 sticky top-0 z-30 backdrop-blur-xl">
      <div className="border-line flex items-center gap-3 border-b px-4 py-3 sm:gap-4 sm:px-6 lg:px-8">
        {/* Search */}
        <div className="relative me-auto hidden w-full max-w-xl md:block">
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
          <Link
            href="/notifications"
            className="bg-card border-line text-muted hover:text-brand hover:border-brand-light relative grid h-11 w-11 place-items-center rounded-2xl border transition"
            aria-label="מרכז ההתראות"
          >
            <Icon name="Bell" size={20} />
            <span className="bg-danger absolute end-2.5 top-2.5 h-2 w-2 rounded-full ring-2 ring-white" />
          </Link>

          <div className="bg-card border-line hidden items-center gap-2.5 rounded-2xl border py-1.5 pe-1.5 ps-3 sm:flex">
            <div className="leading-tight">
              <p className="text-ink text-sm font-bold">{displayName}</p>
              <p className="text-muted text-[11px]">{roleLabel}</p>
            </div>
            {/* Agent avatar — circular, thin purple-gradient frame. Click → edit profile. */}
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="from-brand to-brand-light h-9 w-9 rounded-full bg-gradient-to-br p-[2px] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-brand/30"
              aria-label="עריכת פרופיל"
              title="עריכת פרופיל"
            >
              <div className="bg-card grid h-full w-full place-items-center overflow-hidden rounded-full">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={displayName}
                    className="h-full w-full rounded-full object-cover"
                    referrerPolicy="no-referrer"
                    draggable={false}
                  />
                ) : (
                  <span className="text-brand text-sm font-black">{displayName.charAt(0)}</span>
                )}
              </div>
            </button>
          </div>
        </div>
      </div>

      <ProfileEditPopup
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={{ fullName: displayName, title: roleLabel, avatarUrl }}
      />
    </header>
  );
}
