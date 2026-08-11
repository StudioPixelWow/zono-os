// ZONO — Platform · Configuration (P5.11). Read-only platform configuration
// overview built from EXISTING data only. Shows Configured / Missing / Partial /
// Unavailable for each subsystem — NEVER an ENV value or secret. Cap:
// platform.customers.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { isSupabaseConfigured, isServiceRoleConfigured } from "@/lib/supabase/env";
import { getGrowProviderStatus } from "@/lib/platform-admin/server/billing";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

type State = "configured" | "missing" | "partial" | "unavailable" | "shadow" | "available";
const TONE: Record<State, string> = {
  configured: "bg-success-soft text-success", available: "bg-success-soft text-success",
  partial: "bg-warning-soft text-warning", shadow: "bg-info-soft text-info",
  missing: "bg-danger-soft text-danger", unavailable: "bg-surface text-muted",
};
const LABEL: Record<State, string> = {
  configured: "מוגדר", available: "זמין", partial: "חלקי", shadow: "מצב צל", missing: "חסר", unavailable: "לא זמין",
};
function Row({ label, state, note }: { label: string; state: State; note?: string }) {
  return (
    <li className="flex items-center gap-3 px-1 py-2.5">
      <span className="text-ink text-[13px] font-semibold">{label}</span>
      {note ? <span className="text-muted text-[12px]">{note}</span> : null}
      <span className={"ms-auto rounded-md px-2 py-0.5 text-[11px] font-bold " + TONE[state]}>{LABEL[state]}</span>
    </li>
  );
}

export default async function Page() {
  const operator = await authorizePlatform("platform.customers.read");
  if (!operator) return <PlatformDenied />;

  // Presence checks only — env VALUES are never read or shown.
  const supa = isSupabaseConfigured();
  const svcRole = isServiceRoleConfigured();
  const cronSecret = !!process.env.CRON_SECRET;
  const grow = getGrowProviderStatus();
  const growState: State = grow.classification === "LIVE" ? "configured" : grow.classification === "PARTIAL" ? "partial" : grow.classification === "SIMULATED" ? "unavailable" : "missing";

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="מערכת" title="תצורת פלטפורמה" description="סקירת תצורה לקריאה בלבד — מוגדר / חסר / חלקי / לא זמין לכל תת-מערכת. ערכי סביבה וסודות לעולם אינם מוצגים." icon="Settings" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PanelCard title="סביבה ותשתית" icon="Settings">
          <ul className="divide-line divide-y">
            <Row label="Supabase (URL + anon key)" state={supa ? "configured" : "missing"} />
            <Row label="Service-role (גבול פלטפורמה)" state={svcRole ? "configured" : "missing"} />
            <Row label="CRON_SECRET (משימות מתוזמנות)" state={cronSecret ? "configured" : "missing"} />
          </ul>
        </PanelCard>

        <PanelCard title="חיוב (ספק תשלומים)" icon="Wallet">
          <ul className="divide-line divide-y">
            <Row label="ספק Grow" state={growState} note={grow.classification === "SIMULATED" ? "סימולציה — צ׳קאאוט לא מוגדר" : undefined} />
            <Row label="GROW_CHECKOUT_URL" state={grow.checkoutConfigured ? "configured" : "missing"} />
            <Row label="GROW_WEBHOOK_SECRET" state={grow.webhookSecretConfigured ? "configured" : "missing"} />
            <Row label="MRR/ARR" state="unavailable" note="אין מקור סכום חוזר סמכותי" />
          </ul>
        </PanelCard>

        <PanelCard title="בקרת גישה ותמיכה" icon="ShieldCheck">
          <ul className="divide-line divide-y">
            <Row label="בקרת גישה (P5.4)" state="shadow" note="מחושב ומדווח, אינו אוכף" />
            <Row label="מרכז תמיכה (P5.7)" state="available" />
            <Row label="מצב תמיכה — צפייה כמשתמש (P5.8)" state="available" note="קריאה בלבד, תוקף 15 דק׳" />
          </ul>
        </PanelCard>

        <PanelCard title="אבטחה ו-AI" icon="Fingerprint">
          <ul className="divide-line divide-y">
            <Row label="אימות דו-שלבי (MFA)" state="partial" note="תשתית קיימת, לא נאכף" />
            <Row label="ביטול Supabase session" state="unavailable" note="ביטול גישה מתבצע ע״י השעיית מפעיל" />
            <Row label="יומן ביקורת פלטפורמה" state="available" />
            <Row label="ייחוס עלות AI" state="missing" note="אין אינסטרומנטציה של tokens/עלות" />
          </ul>
        </PanelCard>

        <PanelCard title="תפעול ותוסף" icon="Activity">
          <ul className="divide-line divide-y">
            <Row label="מנוע תורים (Meta/Kernel/הפצה)" state="available" />
            <Row label="תזמוני Cron (vercel.json)" state="configured" note="14 תזמונים · ללא היסטוריית ריצה" />
            <Row label="ניטור אינטגרציות" state="available" />
            <Row label="תוסף Facebook (מצב הרשמה)" state="partial" note="מצב לפי heartbeat — ראו תפעול → אינטגרציות" />
          </ul>
        </PanelCard>
      </div>

      <div className="border-line bg-surface flex items-center gap-2 rounded-xl border px-4 py-3">
        <span className="text-muted"><Icon name="Lock" size={14} /></span>
        <span className="text-muted text-[12px] font-semibold">תצוגת נוכחות בלבד — לעולם לא ערכי ENV, מפתחות או סודות. שינויי תצורה מתבצעים מחוץ למרחב זה.</span>
      </div>
    </div>
  );
}
