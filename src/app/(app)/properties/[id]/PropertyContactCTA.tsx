"use client";
// ============================================================================
// ZONO — Property Contact CTA (client). Large, persistent "contact the property"
// action that adapts to the property's representation context. WhatsApp is the
// primary action, Call is secondary. Renders a desktop panel near the property
// actions AND a mobile sticky bottom bar that clears the app bottom nav + the ZI
// launcher, is safe-area aware and fully RTL. Additive + isolated; every click
// records an analytics event. Never renders a fake number — an unavailable phone
// shows an honest disabled state.
// ============================================================================
import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { trackPropertyContactClick } from "@/lib/properties/contact/actions";
import type { ResolvedPropertyContact, ContactAction } from "@/lib/properties/contact/property-contact-core";

// No-op subscribe for the client-mount snapshot (useSyncExternalStore).
const EMPTY_SUBSCRIBE = () => () => {};

const BADGE_TONE: Record<ResolvedPropertyContact["representation"], string> = {
  private_owner: "bg-success/10 text-success",
  broker: "bg-brand-soft text-brand",
  broker_exclusive: "bg-warning/15 text-warning",
};

function useTrack(propertyId: string, contact: ResolvedPropertyContact) {
  return (action: ContactAction) => {
    // Best-effort; never block the navigation to wa.me / tel:.
    void trackPropertyContactClick({ propertyId, contactType: contact.contactType, action }).catch(() => {});
  };
}

/** Shared button pair (WhatsApp primary + Call secondary), size-configurable. */
function ContactButtons({
  contact,
  onTrack,
  size,
}: {
  contact: ResolvedPropertyContact;
  onTrack: (a: ContactAction) => void;
  size: "panel" | "bar";
}) {
  const big = size === "bar";
  if (contact.disabled) {
    return (
      <div
        className={cn(
          "flex flex-1 items-center justify-center gap-2 rounded-2xl border border-dashed",
          "border-line text-muted font-semibold",
          big ? "h-12 text-sm" : "h-11 text-[13px]",
        )}
      >
        <Icon name="Phone" size={16} /> {contact.emptyLabel}
      </div>
    );
  }
  return (
    <>
      <a
        href={contact.whatsappUrl ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => onTrack("whatsapp")}
        className={cn(
          "flex flex-[2] items-center justify-center gap-2 rounded-2xl font-black text-white shadow-sm transition active:scale-[0.99]",
          "bg-[#25D366] hover:brightness-95",
          big ? "h-12 text-[15px]" : "h-12 text-sm",
        )}
      >
        <Icon name="MessageCircle" size={big ? 20 : 18} />
        {contact.whatsappLabel}
      </a>
      <a
        href={contact.telUrl ?? undefined}
        onClick={() => onTrack("call")}
        className={cn(
          "flex flex-1 items-center justify-center gap-2 rounded-2xl font-bold transition active:scale-[0.99]",
          "bg-surface text-ink border-line hover:bg-brand-soft border",
          big ? "h-12 text-sm" : "h-12 text-[13px]",
        )}
      >
        <Icon name="Phone" size={16} />
        {contact.callLabel}
      </a>
    </>
  );
}

export function PropertyContactCTA({
  propertyId,
  contact,
}: {
  propertyId: string;
  contact: ResolvedPropertyContact;
}) {
  const track = useTrack(propertyId, contact);
  // Portal the mobile bar to <body> so position:fixed resolves against the
  // viewport. Rendered inline it lands inside a transformed ancestor
  // (`.zono-page-enter` carries a transform), which creates a containing block
  // and would make the "sticky" bar scroll with the page. Gate on client mount
  // (document.body is server-undefined); useSyncExternalStore returns false on the
  // server snapshot and true on the client — no setState-in-effect.
  const mounted = useSyncExternalStore(EMPTY_SUBSCRIBE, () => true, () => false);

  const mobileBar = (
    <div
      dir="rtl"
      className={cn(
        "fixed inset-x-0 z-30 lg:hidden",
        "bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))]",
        "border-line bg-card/95 border-t px-3 pb-2 pt-2 backdrop-blur-xl",
      )}
    >
      <div className="mb-1 flex items-center gap-2 pe-20">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", BADGE_TONE[contact.representation])}>
          {contact.badgeLabel}
        </span>
        {contact.contactName && !contact.disabled && (
          <span className="text-muted truncate text-[11px] font-semibold">{contact.contactName}</span>
        )}
      </div>
      {/* Reserve inline-end room (pe-20) for the ZI launcher so it can't cover the CTA. */}
      <div className="flex items-stretch gap-2 pe-20">
        <ContactButtons contact={contact} onTrack={track} size="bar" />
      </div>
    </div>
  );

  return (
    <>
      {/* ── Desktop / tablet: prominent panel near the property actions ──────── */}
      <div className="border-line bg-card hidden flex-col gap-3 rounded-2xl border p-3.5 lg:flex">
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink text-[13px] font-black">יצירת קשר עם הנכס</span>
          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", BADGE_TONE[contact.representation])}>
            {contact.badgeLabel}
          </span>
        </div>
        {contact.contactName && !contact.disabled && (
          <span className="text-muted -mt-1 text-[11px] font-semibold">{contact.contactName}</span>
        )}
        <div className="flex items-stretch gap-2">
          <ContactButtons contact={contact} onTrack={track} size="panel" />
        </div>
      </div>

      {/* ── Mobile: sticky bottom action bar (portaled to <body>) ─────────────────
          Sits ABOVE the app bottom nav (fixed bottom-0, z-40) using the shared
          4.75rem clearance, is safe-area aware, and reserves inline-end space so
          the floating ZI launcher never covers the buttons. RTL via inset-x. */}
      {mounted && createPortal(mobileBar, document.body)}
    </>
  );
}
