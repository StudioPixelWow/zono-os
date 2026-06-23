"use client";

// Inline owner/seller contact preview — name + phone + WhatsApp/call buttons,
// shown directly on cards so the agent can act without opening the property.
// Native intents only (tel: / wa.me) — we never message on the user's behalf.
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";

/** Israeli phone → wa.me digits (0xx → 972xx). */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

export function ContactButtons({
  name,
  phone,
  className,
}: {
  name?: string | null;
  phone?: string | null;
  className?: string;
}) {
  const wa = whatsappNumber(phone);
  if (!name && !phone) return null;
  const btn = "grid h-8 w-8 place-items-center rounded-lg border border-line bg-card text-muted transition hover:text-brand-strong hover:border-brand-light";
  return (
    <div className={cn("bg-surface/60 flex items-center justify-between gap-2 rounded-xl px-2.5 py-2", className)} onClick={(e) => e.stopPropagation()}>
      <div className="min-w-0">
        {name && <p className="text-ink truncate text-[12px] font-bold">{name}</p>}
        {phone && <p className="text-muted text-[11px] font-medium" dir="ltr">{phone}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {wa && (
          <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={btn} aria-label="וואטסאפ"><Icon name="MessageCircle" size={15} /></a>
        )}
        {phone && (
          <a href={`tel:${phone}`} className={btn} aria-label="התקשר"><Icon name="Phone" size={15} /></a>
        )}
      </div>
    </div>
  );
}
