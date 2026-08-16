// ============================================================================
// ZONO — Claim My Listings · Today card (server component) — P10A.
// A morning nudge: how many external listings look like the broker's, surfaced
// on /today with a link into the claim inbox. Read-only, evidence-honest — it
// never claims anything; it points the broker at the review surface. Renders
// nothing when there is no anchor or nothing to review (no empty noise).
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { getClaimCandidates } from "@/lib/claim/claim-candidate-service";

export async function ClaimTodayCard() {
  let high = 0, total = 0;
  try {
    const { anchor, candidates } = await getClaimCandidates(30);
    if (!anchor?.ready) return null;
    total = candidates.length;
    high = candidates.filter((c) => c.verdict.confidence === "high").length;
  } catch { return null; }
  if (total === 0) return null;

  return (
    <Link
      href="/claim"
      dir="rtl"
      className="border-line bg-card group flex items-center gap-3 rounded-2xl border p-4 shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <span className="bg-brand-soft grid place-items-center rounded-2xl p-3">
        <Icon name="Home" size={26} strokeWidth={2.2} className="text-[var(--brand-strong,#6d28d9)]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-ink block text-[15px] font-black">נכסים שכנראה שלך ממתינים לאישור</span>
        <span className="text-muted block text-xs">
          {total} נכסים לבדיקה{high ? ` · ${high} בהתאמה גבוהה` : ""} — אשר בלחיצה כדי לייבא ל-CRM
        </span>
      </span>
      <Icon name="ChevronLeft" size={18} strokeWidth={2.2} className="text-muted transition-transform group-hover:-translate-x-0.5" />
    </Link>
  );
}
