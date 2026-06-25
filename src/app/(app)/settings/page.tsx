import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

const GROUPS: { title: string; items: { label: string; href: string; icon: string; desc: string }[] }[] = [
  {
    title: "מותג וזהות",
    items: [
      { label: "מותג וזהות", href: "/settings/brand", icon: "Presentation", desc: "פרופיל, לוגו, צבעי מותג וסגנון — מקור האמת לכל העיצובים" },
    ],
  },
  {
    title: "אזור ופעילות",
    items: [
      { label: "אזורי פעילות", href: "/settings/operating-areas", icon: "MapPin", desc: "ניהול ערי ושכונות הפעילות שלך" },
      { label: "סנכרון נכסים אוטומטי", href: "/settings/property-radar", icon: "Radar", desc: "Property Radar — סריקת יד2/מדלן, התראות וקרדיטים" },
      { label: "העשרת שכונות (AI)", href: "/admin/neighborhood-enrichment", icon: "Sparkles", desc: "העלאת קובץ ערים ויצירת שכונות אוטומטית" },
      { label: "גאוקודינג מיקומים", href: "/admin/geocoding", icon: "MapPin", desc: "השלמת קואורדינטות אמיתיות לנכסים/מודעות/עסקאות להצגה על המפה" },
    ],
  },
  {
    title: "ניהול מערכת",
    items: [
      { label: "מנועי חישוב", href: "/admin/system-health", icon: "Settings", desc: "סטטוס ורענון של כל המנועים" },
      { label: "איכות דאטה", href: "/admin/data-quality", icon: "Shield", desc: "זיהוי דאטה שבורה לפי קטגוריה" },
      { label: "מרכז תצורה", href: "/admin/configuration", icon: "Settings", desc: "סטטוס אינטגרציות (ללא סודות)" },
      { label: "מטריצת הרשאות", href: "/admin/permissions", icon: "UserCheck", desc: "תפקיד מינימלי לכל פעולה" },
      { label: "יומן ביקורת", href: "/admin/audit-log", icon: "Clock", desc: "תיעוד פעולות רגישות" },
      { label: "רישום Mock", href: "/admin/mock-registry", icon: "Eye", desc: "שקיפות נתוני הדגמה" },
    ],
  },
  {
    title: "גילוי וניווט",
    items: [
      { label: "מודיעין המלצות", href: "/recommendations", icon: "Sparkles", desc: "המלצות מוסברות לכל הישויות" },
      { label: "מרכז התראות", href: "/notifications", icon: "Bell", desc: "כל הסיגנלים במקום אחד" },
      { label: "מדריך מודולים", href: "/search/modules", icon: "Search", desc: "כל המודולים במערכת" },
    ],
  },
];

export default function SettingsHubPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft rounded-[22px] p-5">
        <p className="text-brand text-xs font-bold">Settings</p>
        <h1 className="text-ink mt-1 text-2xl font-black">הגדרות וניהול</h1>
        <p className="text-muted mt-1 text-sm">כל ההגדרות, כלי הניהול והאדמין במקום אחד.</p>
      </div>

      {GROUPS.map((g) => (
        <div key={g.title}>
          <p className="text-ink mb-2 text-sm font-extrabold">{g.title}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {g.items.map((it) => (
              <Link key={it.href} href={it.href} className="bg-card border-line hover:border-brand/30 flex items-center gap-3 rounded-[16px] border p-3 transition-colors">
                <span className="bg-brand-soft text-brand grid h-10 w-10 shrink-0 place-items-center rounded-xl"><Icon name={it.icon} size={20} /></span>
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
