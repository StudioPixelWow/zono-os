// ZONO — Platform · Sessions & access (P5.9). HONEST classification of what the
// current auth architecture actually supports — no fake sessions dashboard, no
// UI-only "revoke". Platform-access revocation IS available (operator suspend,
// server-enforced every request); Supabase auth-session enumeration/revocation
// is NOT implemented; MFA infra exists but is not enrolled/enforced. Cap:
// platform.audit.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";
import Link from "next/link";

export const dynamic = "force-dynamic";

const CLASS_TONE: Record<string, string> = { AVAILABLE: "bg-success-soft text-success", PARTIAL: "bg-warning-soft text-warning", UNAVAILABLE: "bg-surface text-muted" };

function Capability({ title, cls, children }: { title: string; cls: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE"; children: React.ReactNode }) {
  const label: Record<string, string> = { AVAILABLE: "זמין", PARTIAL: "חלקי", UNAVAILABLE: "לא זמין" };
  return (
    <div className="border-line bg-card rounded-2xl border p-4">
      <div className="flex items-center justify-between">
        <span className="text-ink text-sm font-extrabold">{title}</span>
        <span className={"rounded-md px-2 py-0.5 text-[11px] font-bold " + CLASS_TONE[cls]}>{label[cls]}</span>
      </div>
      <div className="text-muted mt-2 text-[12px] leading-relaxed">{children}</div>
    </div>
  );
}

export default async function Page() {
  const operator = await authorizePlatform("platform.audit.read");
  if (!operator) return <PlatformDenied />;

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="אבטחה" title="הפעלות וגישה" description="סיווג כן של יכולות הגישה בארכיטקטורת האימות הנוכחית — ללא לוח הפעלות מפוברק וללא ביטול-דמה." icon="Lock" />

      <PanelCard title="ביטול גישת פלטפורמה" icon="ShieldCheck">
        <Capability title="השעיית מפעיל = ביטול גישה מיידי" cls="AVAILABLE">
          השעיית מפעיל פלטפורמה (מנהלי פלטפורמה) מבטלת מיידית את כל גישת הפלטפורמה שלו — הבדיקה מתבצעת בצד השרת בכל בקשה (assertPlatformCapability → operatorCan fail-closed). זהו מנגנון ביטול-הגישה הסמכותי לפעולות פלטפורמה.
          <div className="mt-2"><Link href="/platform/security/admin-users" className="text-brand font-bold">לניהול מפעילים ←</Link></div>
        </Capability>
      </PanelCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Capability title="ביטול Supabase session (טוקן אימות)" cls="UNAVAILABLE">
          האפליקציה אינה מנפיקה, אוגרת או מונה sessions של Supabase עבור פלטפורמת האדמין, ואינה משתמשת ב-auth.admin לביטול sessions. לכן אין כאן ביטול-session אמין — ולא נבנה ביטול-דמה שאינו מבטל דבר. ביטול הגישה האפקטיבי לפלטפורמה מתבצע ע״י השעיית המפעיל (למעלה).
        </Capability>
        <Capability title="חסימת משתמש לקוח" cls="AVAILABLE">
          השעיית משתמש ארגון (P5.3) חוסמת את גישתו לאפליקציית הלקוח — נאכף ב-getSessionContext (state=&quot;suspended&quot;). זמין מכרטיס הלקוח → משתמשים.
        </Capability>
      </div>

      <PanelCard title="אימות דו-שלבי (MFA)" icon="Fingerprint">
        <Capability title="MFA — תשתית קיימת, לא נאכפת" cls="PARTIAL">
          תשתית ה-MFA של Supabase קיימת אך אין גורמי MFA רשומים (0) ואין אכיפה עבור מפעילי פלטפורמה. לא מוצג ״שיעור עמידה״ מפוברק. הצעה לעתיד (טעונת אישור נפרד): אכיפת MFA למפעילי פלטפורמה בכניסה, עם gate אכיפה ייעודי — לא מופעל ב-P5.9.
        </Capability>
      </PanelCard>

      <div className="border-line bg-surface flex items-center gap-2 rounded-xl border px-4 py-3">
        <span className="text-muted"><Icon name="Lock" size={14} /></span>
        <span className="text-muted text-[12px] font-semibold">מסך זה מסווג יכולות בכנות. שינויי מדיניות אימות (כמו אכיפת MFA גלובלית) דורשים gate אישור נפרד ואינם חלק מ-P5.9.</span>
      </div>
    </div>
  );
}
