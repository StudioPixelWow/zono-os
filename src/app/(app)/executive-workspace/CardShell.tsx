"use client";
// ============================================================================
// 🏛️ Executive Workspace — card chrome (client). Premium RTL card frame with
// three honest states every composed card shares: content, skeleton (loading),
// and unavailable+retry (provider returned null / failed). One card's state is
// fully independent of the others — a card can be unavailable while its
// neighbours render normally.
// ============================================================================
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";

export function CardShell({
  title, subtitle, source, children, className = "",
}: {
  title: string;
  subtitle?: string;
  source?: string;          // the canonical provider this card composes (audit chip)
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section dir="rtl" className={`bg-card border-line flex flex-col gap-3 rounded-[20px] border p-5 shadow-[var(--shadow-card)] ${className}`}>
      <header className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-ink text-sm font-black">{title}</h3>
          {subtitle ? <p className="text-muted mt-0.5 text-[11px] font-medium">{subtitle}</p> : null}
        </div>
        {source ? <span className="text-muted/70 shrink-0 rounded-full bg-[var(--surface-2,#f4f4f7)] px-2 py-0.5 text-[9px] font-bold" title={source}>מקור קנוני</span> : null}
      </header>
      {children}
    </section>
  );
}

/** Loading placeholder — shown while the card's provider streams in. */
export function CardSkeleton({ title }: { title: string }) {
  return (
    <section dir="rtl" className="bg-card border-line flex flex-col gap-3 rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
      <h3 className="text-ink text-sm font-black">{title}</h3>
      <div className="flex flex-col gap-2">
        <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--surface-2,#eee)]" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--surface-2,#eee)]" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-[var(--surface-2,#eee)]" />
      </div>
    </section>
  );
}

/** Honest "unavailable" state with a retry. NEVER fabricates data — an empty or
 *  failed provider looks unavailable, not healthy. Retry re-runs the server
 *  component tree (router.refresh) without a full reload. */
export function CardUnavailable({ note }: { note?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col items-center gap-2 rounded-[14px] border border-amber-200 bg-amber-50/60 p-5 text-center">
      <AlertTriangle size={20} className="text-amber-500" />
      <p className="text-[12px] font-black text-amber-800">{note ?? "המידע אינו זמין כעת"}</p>
      <p className="text-[11px] text-amber-700/80">הנתונים לא נטענו — לא מוצג מידע משוער.</p>
      <button
        type="button"
        onClick={() => start(() => router.refresh())}
        disabled={pending}
        className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-white/70 px-3 py-1 text-[11px] font-bold text-amber-800 disabled:opacity-60"
      >
        <RefreshCw size={12} className={pending ? "animate-spin" : ""} />
        {pending ? "מרענן…" : "נסה שוב"}
      </button>
    </div>
  );
}
