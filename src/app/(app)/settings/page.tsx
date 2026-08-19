import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { IconSurface } from "@/components/ui/action-surfaces";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Item = { label: string; href: string; icon: string; desc: string };
type Group = { title: string; items: Item[]; minRole?: "manager" | "owner" };

// One clear map of "where do I configure X". Personal groups are visible to everyone;
// office / communication / billing / admin groups are role-gated for visibility (the
// pages + actions still enforce access server-side — this only hides links agents
// cannot use, it never widens permission).
const GROUPS: Group[] = [
  {
    title: "החשבון שלי",
    items: [
      { label: "החשבון והמנוי", href: "/account", icon: "Wallet", desc: "מנוי, חבילה, תשלומים וחשבוניות" },
      { label: "התראות ותקשורת", href: "/settings/notifications", icon: "Bell", desc: "אילו עדכונים לקבל ובאיזה ערוץ" },
      { label: "חיבור Google", href: "/settings/integrations", icon: "Calendar", desc: "יומן, Gmail ואנשי קשר — חיבור אישי" },
      { label: "WhatsApp אישי", href: "/settings/whatsapp/personal", icon: "MessageCircle", desc: "ערוץ WhatsApp אישי (בטא) — חיבור בסריקת QR" },
    ],
  },
  {
    title: "המשרד",
    minRole: "manager",
    items: [
      { label: "מותג וזהות", href: "/settings/brand", icon: "Presentation", desc: "פרופיל, לוגו, צבעי מותג וסגנון — מקור האמת לכל העיצובים" },
      { label: "הצוות", href: "/team", icon: "Users", desc: "ניהול הסוכנים וההרשאות במשרד" },
      { label: "אזורי פעילות", href: "/settings/operating-areas", icon: "MapPin", desc: "ניהול ערי ושכונות הפעילות שלך" },
      { label: "סנכרון נכסים אוטומטי", href: "/settings/property-radar", icon: "Locate", desc: "סריקת יד2/מדלן, התראות וקרדיטים" },
    ],
  },
  {
    title: "תקשורת ואינטגרציות",
    minRole: "manager",
    items: [
      { label: "WhatsApp למשרד", href: "/settings/whatsapp", icon: "MessageCircle", desc: "חיבור WhatsApp, מספר שולח ותבניות מאושרות" },
      { label: "פרסום בפייסבוק", href: "/settings/distribution-connections", icon: "Share2", desc: "חיבור פייסבוק, התוסף וקבוצות הפרסום" },
    ],
  },
  {
    title: "חיוב ומנוי",
    minRole: "manager",
    items: [
      { label: "חבילות ותוכניות", href: "/settings/plan", icon: "Wallet", desc: "השוואת חבילות והרשאות שימוש" },
    ],
  },
  {
    title: "גילוי וניווט",
    items: [
      { label: "מרכז התראות", href: "/notifications", icon: "Bell", desc: "כל הסיגנלים במקום אחד" },
      { label: "מודיעין המלצות", href: "/recommendations", icon: "Sparkles", desc: "המלצות מוסברות לכל הישויות" },
      { label: "מדריך מודולים", href: "/search/modules", icon: "Search", desc: "כל המודולים במערכת" },
    ],
  },
  {
    title: "ניהול מערכת",
    minRole: "owner",
    items: [
      { label: "מנועי חישוב", href: "/admin/system-health", icon: "Settings", desc: "סטטוס ורענון של כל המנועים" },
      { label: "מרכז תצורה", href: "/admin/configuration", icon: "Settings", desc: "סטטוס אינטגרציות (ללא סודות)" },
      { label: "מטריצת הרשאות", href: "/admin/permissions", icon: "UserCheck", desc: "תפקיד מינימלי לכל פעולה" },
      { label: "יומן ביקורת", href: "/admin/audit-log", icon: "Clock", desc: "תיעוד פעולות רגישות" },
      { label: "איכות דאטה", href: "/admin/data-quality", icon: "Shield", desc: "זיהוי דאטה שבורה לפי קטגוריה" },
      { label: "העשרת שכונות (AI)", href: "/admin/neighborhood-enrichment", icon: "Sparkles", desc: "העלאת קובץ ערים ויצירת שכונות אוטומטית" },
      { label: "גאוקודינג מיקומים", href: "/admin/geocoding", icon: "MapPin", desc: "השלמת קואורדינטות אמיתיות למפה" },
      { label: "רישום Mock", href: "/admin/mock-registry", icon: "Eye", desc: "שקיפות נתוני הדגמה" },
    ],
  },
];

async function roleFlags(): Promise<{ isManager: boolean; isOwner: boolean }> {
  try {
    const sb = await createClient();
    const [{ data: mgr }, { data: own }] = await Promise.all([
      sb.rpc("has_min_role", { p_min: "manager" }),
      sb.rpc("has_min_role", { p_min: "owner" }),
    ]);
    return { isManager: mgr === true, isOwner: own === true };
  } catch {
    return { isManager: false, isOwner: false };   // fail-closed: agents don't see office/admin links
  }
}

export default async function SettingsHubPage() {
  const { isManager, isOwner } = await roleFlags();
  const visible = GROUPS.filter((g) => !g.minRole || (g.minRole === "manager" ? isManager : isOwner));

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <div className="bg-brand-soft rounded-[22px] p-5">
        <p className="text-brand text-xs font-bold">הגדרות</p>
        <h1 className="text-ink mt-1 text-2xl font-black">הגדרות וניהול</h1>
        <p className="text-muted mt-1 text-sm">כל ההגדרות והחיבורים במקום אחד — לפי מה שרלוונטי לתפקיד שלך.</p>
      </div>

      {visible.map((g) => (
        <div key={g.title}>
          <p className="text-ink mb-2 text-sm font-extrabold">{g.title}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((it) => (
              <Link key={it.href} href={it.href} className="bg-card border-line hover:border-brand/30 flex items-center gap-3 rounded-[16px] border p-3 transition-colors">
                <IconSurface name={it.icon} tier="s" accent="brand" className="shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-sm font-bold">{it.label}</span>
                  <span className="text-muted block truncate text-[11px]">{it.desc}</span>
                </span>
                <Icon name="ChevronLeft" size={16} className="text-muted" />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
