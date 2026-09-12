// ============================================================================
// ZONO — Payment Required (/payment-required). The NO-TRIAL activation screen a
// new office lands on until a verified Grow payment activates its subscription.
// NOT an error page: it confirms the account is ready, shows the exact price
// (server-derived), teases the value ZONO already prepared (city scan + claim
// candidates), and offers ONE action — activate. Paid / grandfathered orgs are
// redirected away. Session-gated; lives OUTSIDE the (app) group so the payment
// gate never bounces it.
// ============================================================================
import { redirect } from "next/navigation";
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { destinationForState } from "@/lib/auth/onboarding-routing";
import { resolvePaymentGate } from "@/lib/commercial/access-gate";
import { getOrgBillingOverview } from "@/lib/commercial/overview";
import { getClaimCandidates } from "@/lib/claim/claim-candidate-service";
import { BillingActivationPanel } from "@/app/(app)/settings/plan/BillingActivationPanel";

export const dynamic = "force-dynamic";

const ils = (n: number | null | undefined) => (n == null ? "—" : `₪${Number(n).toLocaleString("he-IL")}`);

export default async function PaymentRequiredPage() {
  const sc = await getSessionContext();
  if (sc.state !== "ready") { const a = destinationForState(sc.state, "app"); redirect(a === "render" ? "/login" : a); }
  const orgId = sc.profile!.org_id;
  const createdAt = (sc.organization as { created_at?: string | null } | null)?.created_at ?? null;

  // Paid or grandfathered → they belong in the app, not here.
  const gate = await resolvePaymentGate(orgId, createdAt);
  if (!gate.blocked) redirect("/");

  const overview = await getOrgBillingOverview(orgId).catch(() => null);
  let claimCount = 0;
  try { const { candidates } = await getClaimCandidates(30); claimCount = candidates.length; } catch { /* teaser is best-effort */ }

  const city = (sc.profile as { operating_city?: string | null; primary_city?: string | null } | null);
  const cityName = city?.operating_city ?? city?.primary_city ?? null;

  return (
    <main dir="rtl" className="mx-auto flex min-h-screen w-full max-w-[720px] flex-col justify-center gap-5 px-4 py-10">
      <header className="text-center">
        <h1 className="text-ink text-2xl font-black sm:text-3xl">החשבון שלך מוכן. נשאר רק להפעיל את ZONO.</h1>
        <p className="text-muted mx-auto mt-2 max-w-[52ch] text-[15px]">
          {cityName
            ? `זיהינו את אזור הפעילות שלך (${cityName}) והמערכת כבר התחילה להכין עבורך מידע.`
            : "המערכת כבר התחילה להכין עבורך את מודיעין השוק באזור שלך."}
        </p>
        {claimCount > 0 && (
          <p className="text-brand-strong mt-2 text-[15px] font-bold">
            מצאנו עבורך {claimCount} נכסים אפשריים — לאחר הפעלת החשבון תוכל/י לבדוק ולשייך אותם.
          </p>
        )}
      </header>

      {/* Value summary */}
      {overview && (
        <div className="bg-card border-line rounded-2xl border p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Cell label="מסלול" value="ZONO Pro" />
            <Cell label="משתמשים" value={String(overview.billableAgents)} />
            <Cell label="מחיר למשתמש" value={ils(overview.pricePerAgentIls)} />
            <Cell label="סה״כ חודשי" value={overview.customPricingRequired ? "התאמה אישית" : ils(overview.monthlyIls)} />
          </div>
          <ul className="text-muted mt-4 grid grid-cols-1 gap-1.5 text-[13.5px] sm:grid-cols-2">
            <li>✓ שיוך אוטומטי של הנכסים שלך מהמקורות</li>
            <li>✓ מודיעין מתווכים ומשרדים באזור</li>
            <li>✓ מפת שוק חיה והזדמנויות בלעדיות</li>
            <li>✓ CRM, לידים, פרסום ואוטומציות AI</li>
          </ul>
        </div>
      )}

      {/* The activation panel carries the server-authoritative CTA + history. */}
      {overview && <BillingActivationPanel overview={overview} />}

      <p className="text-muted text-center text-xs">
        התשלום מאובטח ומתבצע דרך Grow. הגישה נפתחת אוטומטית מיד לאחר אימות התשלום בשרת.
        {" "}<Link href="/account" className="underline">לחשבון</Link>
      </p>
    </main>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-muted text-[11px] font-semibold">{label}</div>
      <div className="text-ink mt-0.5 text-lg font-black">{value}</div>
    </div>
  );
}
