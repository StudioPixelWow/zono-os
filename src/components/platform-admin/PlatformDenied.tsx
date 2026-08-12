// Safe, non-revealing denial for the platform control plane (P5.1). Shown to any
// caller who is not an active platform operator (or lacks the required
// capability). Deliberately generic: it never confirms what lies behind the
// route, never echoes the attempted capability, and offers only a route back to
// the customer app.
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";

export function PlatformDenied({ title = "אין גישה", note = "המרחב הזה זמין לצוות ZONO בלבד." }: { title?: string; note?: string }) {
  return (
    <div dir="rtl" className="grid min-h-[60vh] place-items-center p-6">
      <div className="border-line bg-card w-full max-w-sm rounded-3xl border p-8 text-center">
        <span className="text-muted bg-surface mx-auto grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Lock" size={26} /></span>
        <p className="text-ink mt-4 text-xl font-black">{title}</p>
        <p className="text-muted mt-1.5 text-sm">{note}</p>
        <Link href="/" className="text-brand-strong mt-5 inline-flex items-center gap-1 text-sm font-bold">
          <Icon name="ArrowLeft" size={15} />חזרה לאזור האישי
        </Link>
      </div>
    </div>
  );
}
