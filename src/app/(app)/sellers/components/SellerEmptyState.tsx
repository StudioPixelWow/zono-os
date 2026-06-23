"use client";

import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";

type EmptyKind = "no-sellers" | "no-results" | "no-urgent";

const PRESETS: Record<EmptyKind, { icon: string; title: string; body: string }> = {
  "no-sellers": {
    icon: "UserCheck",
    title: "אין מוכרים עדיין",
    body: "הוסף/י מוכר כדי ש-ZONO יבנה לו תאום דיגיטלי עם ציוני אמון, סיכון נטישה ופעולות מומלצות.",
  },
  "no-results": {
    icon: "Search",
    title: "לא נמצאו מוכרים תואמים",
    body: "אין מוכרים שעונים על הסינון או החיפוש הנוכחי. נסה/י לנקות את הסינונים.",
  },
  "no-urgent": {
    icon: "CheckCircle2",
    title: "אין כרגע מוכרים דחופים",
    body: "כל המוכרים הפעילים מטופלים. נחזור להציג כאן ברגע שמשהו ידרוש תשומת לב.",
  },
};

export function SellerEmptyState({
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
      {kind === "no-sellers" && (
        <Link href="/sellers/new">
          <Button leadingIcon={<Icon name="Plus" size={18} strokeWidth={2.2} />}>הוסף מוכר ראשון</Button>
        </Link>
      )}
      {kind === "no-results" && onClear && (
        <Button variant="secondary" size="sm" onClick={onClear}>נקה סינונים</Button>
      )}
    </div>
  );
}
