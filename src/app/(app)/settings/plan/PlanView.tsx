// ============================================================================
// ZONO — Plan & Offer (canonical commercial model). ONE flat offer, not tiers:
// ₪197 per active user / month, ALL capabilities open, 14-day free trial.
// Offices with MORE THAN 10 agents are custom-priced (sales conversation) — we
// never auto-compute 197×N above the threshold. The legacy starter/professional/
// office/enterprise tiers (₪199 / ₪599 …) are RETIRED and no longer shown; the
// live billing summary + activation lives in <BillingActivationPanel/> above.
// Server component — presentational only (no plan switching).
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";
import { COMMERCIAL_MODEL } from "@/lib/commercial/model";
import type { OrgPlan } from "@/lib/launch";

const PLAN_STATUS_HE: Record<string, string> = {
  active: "פעיל", trialing: "תקופת ניסיון", trial: "תקופת ניסיון",
  past_due: "בפיגור תשלום", canceled: "מבוטל", cancelled: "מבוטל", expired: "פג",
};

// What "all capabilities open" means, in the customer's language. Every ZONO
// customer gets all of this — there is no feature tiering under the flat model.
const INCLUDED: string[] = [
  "רדאר נכסים וזיהוי הזדמנויות בזמן אמת",
  "שיוך אוטומטי של הנכסים שלך מהמקורות",
  "מודיעין מתווכים ומשרדים באזור הפעילות",
  "מפת שוק חיה והזדמנויות בלעדיות",
  "CRM מלא — לידים, קונים ומוכרים",
  "אוטומציות שיווק ומסעות לקוח עם AI",
  "מודיעין מנהלים, מתחרים וביצועי משרד",
  "ריבוי סוכנים, פרסום, דוחות ותמיכה",
];

export function PlanView({ current }: { current: OrgPlan }) {
  const price = COMMERCIAL_MODEL.pricePerAgentIls; // ₪197 (env-overridable for QA only)
  const threshold = COMMERCIAL_MODEL.customPricingAgentThreshold; // 10
  const status = PLAN_STATUS_HE[current.status] ?? current.status;

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <div className="bg-card border-line rounded-[20px] border p-5">
        <h1 className="text-ink text-lg font-black">התוכנית שלך</h1>
        <p className="text-muted text-xs">
          מסלול <span className="text-brand-strong font-bold">ZONO Pro</span> · סטטוס {status}
        </p>
      </div>

      {/* The single, canonical offer */}
      <div className="border-brand-strong bg-brand-soft/40 relative flex flex-col gap-4 rounded-2xl border p-6">
        <span className="bg-brand-strong absolute -top-3 right-6 rounded-full px-3 py-0.5 text-[11px] font-black text-white">
          כל היכולות פתוחות
        </span>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-ink text-xl font-black">ZONO Pro</div>
            <div className="text-muted text-[13px]">מנוי חודשי · לכל סוכן פעיל במשרד</div>
          </div>
          <div className="text-left">
            <div className="text-ink text-3xl font-black leading-none">
              ₪{price.toLocaleString("he-IL")}
              <span className="text-muted text-sm font-bold"> / משתמש בחודש</span>
            </div>
            <div className="text-brand-strong mt-1 text-[13px] font-bold">14 ימי ניסיון חינם — ללא כרטיס אשראי</div>
          </div>
        </div>

        <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {INCLUDED.map((f) => (
            <li key={f} className="text-ink/90 flex items-start gap-1.5 text-[13.5px]">
              <Icon name="Check" size={15} className="mt-0.5 shrink-0 text-emerald-500" /> {f}
            </li>
          ))}
        </ul>
      </div>

      {/* Above-threshold = custom pricing (sales), never auto-computed */}
      <div className="bg-card border-line flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5">
        <div>
          <div className="text-ink font-black">משרד עם יותר מ-{threshold} סוכנים?</div>
          <p className="text-muted text-[13px]">נבנה יחד הצעת מחיר מותאמת למשרד שלך.</p>
        </div>
        <a
          href="/support"
          className="bg-ink inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-black text-white transition hover:opacity-90"
        >
          <Icon name="Sparkles" size={16} /> יצירת קשר להצעת מחיר
        </a>
      </div>

      <p className="text-muted text-center text-[11px]">
        חיוב, חשבוניות והפעלת המנוי מנוהלים בפאנל למעלה. המחיר קבוע לכל משתמש — אין מסלולים או תוספות נסתרות.
      </p>
    </div>
  );
}
