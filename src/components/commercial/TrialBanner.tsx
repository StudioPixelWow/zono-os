// ============================================================================
// ZONO — Trial countdown banner. A slim, always-visible bar shown across the app
// while an office is inside its 14-day free trial (enforced + unpaid + trial
// active). It counts down the days left from registration and drives activation
// with a single clear CTA. Urgency rises as the trial nears its end. Server
// component — no client JS; the CTA is a plain link to the activation screen.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";

export function TrialBanner({ daysLeft }: { daysLeft: number }) {
  const d = Math.max(0, daysLeft);
  const urgent = d <= 3;                 // last stretch → warmer, louder
  const soon = d <= 7 && !urgent;

  const bg = urgent
    ? "linear-gradient(90deg,#b91c1c,#dc2626)"
    : soon
      ? "linear-gradient(90deg,#b45309,#d97706)"
      : "linear-gradient(90deg,#5b21b6,#7c3aed)";

  const daysLabel =
    d === 0 ? "היום האחרון של הניסיון" :
    d === 1 ? "נותר יום אחרון לניסיון" :
    `נותרו ${d} ימי ניסיון`;

  const lead = urgent
    ? "הניסיון שלך עומד להסתיים"
    : "אתה בתקופת הניסיון החינמית של ZONO";

  return (
    <div dir="rtl" style={{ background: bg, color: "#fff" }} className="relative">
      <Link
        href="/payment-required"
        className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2.5 text-center text-sm font-bold no-underline"
        style={{ color: "#fff" }}
      >
        <span className="inline-flex items-center gap-2">
          <Icon name={urgent ? "AlertTriangle" : "Sparkles"} className="h-4 w-4" />
          <span>{lead} — <span className="font-black">{daysLabel}</span>.</span>
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[13px] font-black ring-1 ring-white/30 transition hover:bg-white/30">
          הפעל מנוי עכשיו <Icon name="ArrowLeft" className="h-3.5 w-3.5" />
        </span>
      </Link>
    </div>
  );
}
