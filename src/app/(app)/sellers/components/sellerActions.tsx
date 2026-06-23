"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { whatsappNumber } from "@/components/listings/ContactButtons";
import { logSellerTouchpointAction } from "@/lib/seller-intelligence/actions";
import type { SellerInsight, NextActionKind } from "@/lib/sellers/insights";

export { whatsappNumber };

const ICON_BY_KIND: Record<NextActionKind, string> = {
  call: "Phone",
  whatsapp: "MessageCircle",
  send_update: "Send",
  schedule_meeting: "Calendar",
  suggest_price: "Tag",
  link_property: "Home",
  mark_handled: "CheckCircle2",
};

/**
 * Primary "next action" control. Call/WhatsApp open the user's own apps (native
 * intents — we never message on their behalf). Navigation actions route to the
 * seller's detail/edit; "mark handled" logs a touchpoint via a server action.
 */
export function NextActionButton({
  insight,
  size = "sm",
  className,
}: {
  insight: SellerInsight;
  size?: "sm" | "md";
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const s = insight.seller;
  const { kind, label } = insight.nextAction;
  const icon = <Icon name={ICON_BY_KIND[kind]} size={size === "sm" ? 15 : 17} />;

  if (kind === "call" && s.phone) {
    return (
      <a href={`tel:${s.phone}`} onClick={(e) => e.stopPropagation()}>
        <Button size={size} leadingIcon={icon} className={className}>{label}</Button>
      </a>
    );
  }
  if (kind === "whatsapp") {
    const wa = whatsappNumber(s.phone);
    if (wa) {
      return (
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
          <Button size={size} leadingIcon={icon} className={className}>{label}</Button>
        </a>
      );
    }
  }
  if (kind === "suggest_price") {
    return (
      <Button size={size} variant="secondary" leadingIcon={icon} className={className}
        onClick={(e) => { e.stopPropagation(); router.push(`/sellers/${s.id}/edit`); }}>
        {label}
      </Button>
    );
  }
  if (kind === "send_update" || kind === "schedule_meeting" || kind === "link_property") {
    return (
      <Button size={size} variant="secondary" leadingIcon={icon} className={className}
        onClick={(e) => { e.stopPropagation(); router.push(`/sellers/${s.id}`); }}>
        {label}
      </Button>
    );
  }
  // Fallback: mark handled (logs an outbound call touchpoint)
  return (
    <Button size={size} variant="secondary" loading={pending} leadingIcon={icon} className={className}
      onClick={(e) => {
        e.stopPropagation();
        startTransition(async () => {
          await logSellerTouchpointAction(s.id, "phone_call", "positive", null);
          router.refresh();
        });
      }}>
      {label}
    </Button>
  );
}

/** Compact icon-only quick actions (call / whatsapp / email) for table + drawer. */
export function QuickContactIcons({ insight }: { insight: SellerInsight }) {
  const s = insight.seller;
  const wa = whatsappNumber(s.phone);
  const cls =
    "grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition hover:text-brand-strong hover:border-brand-light";
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {s.phone && (
        <a href={`tel:${s.phone}`} className={cls} aria-label="התקשר"><Icon name="Phone" size={15} /></a>
      )}
      {wa && (
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={cls} aria-label="וואטסאפ"><Icon name="MessageCircle" size={15} /></a>
      )}
      {s.email && (
        <a href={`mailto:${s.email}`} className={cls} aria-label="אימייל"><Icon name="Mail" size={15} /></a>
      )}
    </div>
  );
}

/** "סמן כטופל" — standalone button used in the drawer + cockpit cards. */
export function MarkHandledButton({ sellerId, onDone }: { sellerId: string; onDone?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      leadingIcon={<Icon name="CheckCircle2" size={15} />}
      className={cn(done && "text-success")}
      onClick={(e) => {
        e.stopPropagation();
        startTransition(async () => {
          await logSellerTouchpointAction(sellerId, "phone_call", "positive", null);
          setDone(true);
          onDone?.();
          router.refresh();
        });
      }}
    >
      {done ? "סומן ✓" : "סמן כטופל"}
    </Button>
  );
}
