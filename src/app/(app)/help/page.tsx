import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { generateReleaseNotes } from "@/lib/launch";
import { HelpView } from "./HelpView";

export const dynamic = "force-dynamic";

// Knowledge base + FAQ content (static, Hebrew). Context help / empty-state
// guidance live inside each module; this is the central reference.
const KB = [
  { q: "איך מתחילים לעבוד עם ZONO?", a: "פתח/י את 'תחילת עבודה' והשלם/י את הצ׳קליסט: אזורי פעילות, סריקת רדאר ראשונה, קונים ומסע אוטומציה.", tag: "התחלה", href: "/getting-started" },
  { q: "איך מגדירים אזורי פעילות?", a: "הגדרות → אזורי פעילות. בחר/י ערים ושכונות שברצונך לנטר; הרדאר והשוק יתעדכנו לפיהם.", tag: "התחלה", href: "/settings/operating-areas" },
  { q: "מה זה רדאר נכסים?", a: "מרכז פיקוד בזמן אמת: נכסים חדשים, ירידות מחיר, עסקאות חמות והתאמות קונים — מבוסס נתונים ציבוריים בלבד.", tag: "מודולים", href: "/property-radar" },
  { q: "האם ה‑AI מקבל החלטות?", a: "לא. כל הניקוד, ההתאמות וההחלטות דטרמיניסטיים. ה‑AI מסכם ומנסח בלבד — לעולם לא מנקד, מאשר או מפעיל.", tag: "אמון" },
  { q: "האם המידע שלי מבודד מארגונים אחרים?", a: "כן. כל טבלה מבודדת לפי ארגון (RLS). אין דליפת מידע בין משרדים.", tag: "אבטחה" },
  { q: "איך שולחים משוב או מדווחים על תקלה?", a: "לחצן 'משוב' הצף בכל מסך. נצרף אוטומטית דפדפן, גרסה, תפקיד ומזהה מעקב — ללא תוכן עסקי.", tag: "תמיכה" },
  { q: "מה ההבדל בין החבילות?", a: "הגדרות → חבילה. Starter/Professional/Office/Enterprise נפתחות בהדרגה לפי פיצ׳רים ומגבלות שימוש.", tag: "חבילות", href: "/settings/plan" },
  { q: "איפה בודקים את תקינות המערכת?", a: "מנהלי מערכת: דיאגנוסטיקה ולוח מוכנות להשקה מציגים סטטוס תשתית, ספקים, AI, תורים ועוד.", tag: "תמיכה", href: "/launch-readiness" },
];

export default function HelpRoute() {
  const notes = generateReleaseNotes().slice(0, 3);
  return (
    <div dir="rtl" className="mx-auto flex max-w-3xl flex-col gap-5 p-4 sm:p-6">
      <div className="bg-card border-line rounded-[20px] border p-5">
        <div className="flex items-center gap-3">
          <span className="bg-surface text-brand-strong grid h-11 w-11 place-items-center rounded-2xl"><Icon name="HelpCircle" size={22} /></span>
          <div>
            <h1 className="text-ink text-lg font-black">מרכז עזרה</h1>
            <p className="text-muted text-xs">מאגר ידע, שאלות נפוצות והכוונה</p>
          </div>
        </div>
      </div>

      <HelpView items={KB} />

      <div className="bg-card border-line rounded-2xl border p-4">
        <h2 className="text-ink mb-2 text-sm font-black">מה חדש</h2>
        <div className="flex flex-col gap-2">
          {notes.map((n) => (
            <div key={n.version} className="border-line border-b pb-2 last:border-0">
              <p className="text-ink text-sm font-bold">{n.title} <span className="text-muted font-mono text-xs">v{n.version}</span></p>
              <p className="text-muted text-xs">{n.highlights[0]}</p>
            </div>
          ))}
        </div>
        <Link href="/getting-started" className="text-brand-strong mt-3 inline-block text-sm font-bold">התחל/י כאן →</Link>
      </div>
    </div>
  );
}
