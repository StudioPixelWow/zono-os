"use client";

import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";

type EmptyKind = "no-buyers" | "no-results" | "no-urgent" | "no-matches";

const PRESETS: Record<EmptyKind, { icon: string; title: string; body: string }> = {
  "no-buyers": {
    icon: "Users",
    title: "אין עדיין קונים",
    body: "הוסף/י את הקונה הראשון כדי להתחיל לנהל תקציבים, התאמות ונקודות טיפול.",
  },
  "no-results": {
    icon: "Search",
    title: "לא נמצאו קונים תואמים",
    body: "אין קונים שעונים על הסינון או החיפוש הנוכחי. נסה/י לנקות את הסינונים.",
  },
  "no-urgent": {
    icon: "CheckCircle2",
    title: "אין כרגע קונים דחופים",
    body: "כל הקונים הפעילים מטופלים. נחזור להציג כאן ברגע שמשהו ידרוש תשומת לב.",
  },
  "no-matches": {
    icon: "Home",
    title: "טרם חושבו התאמות",
    body: "מנוע ההתאמות עדיין לא הופעל לקונה הזה. ההתאמות יופיעו לאחר חישוב.",
  },
};

export function BuyerEmptyState({
  kind,
  onClear,
  compact,
}: {
  kind: EmptyKind;
  onClear?: () => void;
  compact?: boolean;
}) {
  const p = PRESETS[kind];
  return (
    <div
      className={`bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border text-center ${
        compact ? "px-6 py-10" : "px-6 py-16"
      }`}
    >
      <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl">
        <Icon name={p.icon} size={26} />
      </span>
      <p className="text-ink text-lg font-extrabold">{p.title}</p>
      <p className="text-muted max-w-sm text-sm">{p.body}</p>
      {kind === "no-buyers" && (
        <Link href="/buyers/new">
          <Button leadingIcon={<Icon name="Plus" size={18} strokeWidth={2.2} />}>
            הוסף קונה ראשון
          </Button>
        </Link>
      )}
      {kind === "no-results" && onClear && (
        <Button variant="secondary" size="sm" onClick={onClear}>
          נקה סינונים
        </Button>
      )}
    </div>
  );
}
