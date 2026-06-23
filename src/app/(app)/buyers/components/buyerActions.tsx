"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { markBuyerContactedAction } from "@/lib/buyers/actions";
import type { BuyerInsight, NextActionKind } from "@/lib/buyers/insights";

/** Israeli phone → wa.me digits (0xx → 972xx). Falls back to raw digits. */
export function whatsappNumber(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

const ICON_BY_KIND: Record<NextActionKind, string> = {
  call: "Phone",
  whatsapp: "MessageCircle",
  send_properties: "Home",
  update_budget: "SlidersHorizontal",
  schedule_meeting: "Calendar",
  mark_handled: "CheckCircle2",
};

/**
 * Primary "next action" control. Call/WhatsApp/email open the user's own apps
 * (native intents — we never send on their behalf). Navigation actions route to
 * the buyer's detail; "mark handled" stamps last-contacted via a server action.
 */
export function NextActionButton({
  insight,
  size = "sm",
  className,
}: {
  insight: BuyerInsight;
  size?: "sm" | "md";
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const b = insight.buyer;
  const { kind, label } = insight.nextAction;
  const icon = <Icon name={ICON_BY_KIND[kind]} size={size === "sm" ? 15 : 17} />;

  if (kind === "call" && b.phone) {
    return (
      <a href={`tel:${b.phone}`} onClick={(e) => e.stopPropagation()}>
        <Button size={size} leadingIcon={icon} className={className}>
          {label}
        </Button>
      </a>
    );
  }
  if (kind === "whatsapp") {
    const wa = whatsappNumber(b.phone);
    if (wa) {
      return (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          <Button size={size} leadingIcon={icon} className={className}>
            {label}
          </Button>
        </a>
      );
    }
  }
  if (kind === "send_properties") {
    return (
      <Button
        size={size}
        leadingIcon={icon}
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          router.push(`/buyers/${b.id}?tab=matches`);
        }}
      >
        {label}
      </Button>
    );
  }
  if (kind === "update_budget") {
    return (
      <Button
        size={size}
        variant="secondary"
        leadingIcon={icon}
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          router.push(`/buyers/${b.id}/edit`);
        }}
      >
        {label}
      </Button>
    );
  }
  if (kind === "schedule_meeting") {
    return (
      <Button
        size={size}
        variant="secondary"
        leadingIcon={icon}
        className={className}
        onClick={(e) => {
          e.stopPropagation();
          router.push(`/buyers/${b.id}`);
        }}
      >
        {label}
      </Button>
    );
  }
  // Fallback: mark handled
  return (
    <Button
      size={size}
      variant="secondary"
      loading={pending}
      leadingIcon={icon}
      className={className}
      onClick={(e) => {
        e.stopPropagation();
        startTransition(async () => {
          await markBuyerContactedAction(b.id);
          router.refresh();
        });
      }}
    >
      {label}
    </Button>
  );
}

/** Compact icon-only quick actions (call / whatsapp / email) for table + drawer. */
export function QuickContactIcons({ insight }: { insight: BuyerInsight }) {
  const b = insight.buyer;
  const wa = whatsappNumber(b.phone);
  const cls =
    "grid h-8 w-8 place-items-center rounded-lg border border-line text-muted transition hover:text-brand-strong hover:border-brand-light";
  return (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {b.phone && (
        <a href={`tel:${b.phone}`} className={cls} aria-label="התקשר">
          <Icon name="Phone" size={15} />
        </a>
      )}
      {wa && (
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={cls} aria-label="וואטסאפ">
          <Icon name="MessageCircle" size={15} />
        </a>
      )}
      {b.email && (
        <a href={`mailto:${b.email}`} className={cls} aria-label="אימייל">
          <Icon name="Mail" size={15} />
        </a>
      )}
    </div>
  );
}

/** "סמן כטופל" — standalone button used in the drawer + cockpit cards. */
export function MarkHandledButton({ buyerId, onDone }: { buyerId: string; onDone?: () => void }) {
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
          await markBuyerContactedAction(buyerId);
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
