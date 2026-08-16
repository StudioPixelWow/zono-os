// ============================================================================
// ZONO — Claim My Listings · inbox page (/claim) — P10A.
// The review surface: real external listings the evidence engine associates with
// the caller's verified source identity, scored + explained, each claimable in a
// single click (weak ones gated behind explicit confirmation). Read model is the
// server candidate service; all writes go through server actions.
// ============================================================================
import { ClaimInbox } from "@/components/claim/ClaimInbox";

export const dynamic = "force-dynamic";

export default function ClaimPage() {
  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <header>
        <h1 className="text-ink text-2xl font-black">הנכסים שלי</h1>
        <p className="text-muted mt-1 text-sm">נכסים שפורסמו במקורות חיצוניים ונראה שהם שלך — אשר בלחיצה כדי לייבא אותם ל-CRM עם התמונות המקוריות.</p>
      </header>
      <ClaimInbox />
    </div>
  );
}
