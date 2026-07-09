// ============================================================================
// 📘 ZONO — Facebook Onboarding Gate (server, premium). Shown on /facebook
// whenever there is NO live Meta API connection. Never renders the dashboard,
// stats, groups or publishing before connection. The primary CTA starts the
// REAL connection flow (settings → Meta OAuth / assisted). Honest about Meta
// App Review; nothing here is faked to "connected", nothing auto-publishes.
// ============================================================================
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";

const RETURN_TO = "/facebook";
const CONNECT_HREF = `/settings/distribution-connections?return=${encodeURIComponent(RETURN_TO)}`;

// What ZONO discovers/imports AFTER a successful Meta connection.
const IMPORTS: { icon: string; title: string; body: string }[] = [
  { icon: "Building2", title: "עמודי Facebook", body: "כל העמודים שבניהולך — לפרסום ומעקב ביצועים." },
  { icon: "Users", title: "קבוצות", body: "הקבוצות שבהן אתה חבר/מנהל — תבחר אילו לייבא." },
  { icon: "Layers", title: "Business Managers", body: "חשבונות ניהול העסקי המקושרים לפרופיל שלך." },
  { icon: "BarChart3", title: "חשבונות מודעות", body: "Ad Accounts — לתקצוב ומדידת קמפיינים." },
];

const STEPS: { n: number; label: string; hint: string; icon: string }[] = [
  { n: 1, label: "חבר את Facebook", hint: "התחברות רשמית דרך Meta / מצב מסייע", icon: "Send" },
  { n: 2, label: "גילוי אוטומטי", hint: "עמודים, קבוצות, Business Managers וחשבונות מודעות", icon: "Sparkles" },
  { n: 3, label: "בחירת קבוצות לייבוא", hint: "אתה בוחר אילו קבוצות ZONO תנהל", icon: "Users" },
  { n: 4, label: "מרכז ההפצה", hint: "רק אז נפתח הדשבורד עם הנתונים האמיתיים", icon: "Megaphone" },
];

export function FacebookOnboardingGate() {
  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8">
      {/* Hero */}
      <section className="bg-card border-line relative overflow-hidden rounded-[28px] border p-6 shadow-[var(--shadow-card)] sm:p-9">
        <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(59,89,152,0.18),transparent_70%)] blur-2xl" />
        <div className="relative flex flex-col items-center gap-5 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-3xl text-white shadow-[0_10px_30px_rgba(59,89,152,0.45)]" style={{ background: "linear-gradient(135deg,#3b5998,#5b7bd5)" }}>
            <Icon name="Megaphone" size={30} />
          </span>
          <div>
            <h1 className="text-ink text-3xl font-black sm:text-4xl">חבר את Facebook כדי להתחיל</h1>
            <p className="text-muted mx-auto mt-2 max-w-xl text-sm leading-relaxed sm:text-base">
              ZONO Distribution מתחיל בחיבור לחשבון ה-Facebook שלך. לאחר החיבור נזהה אוטומטית את העמודים, הקבוצות וחשבונות הניהול שלך — ותבחר בדיוק מה לייבא. עד אז לא מוצג דשבורד ריק.
            </p>
          </div>
          <Link href={CONNECT_HREF} className="btn-zono-primary zono-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-base font-black text-white shadow-[var(--shadow-lift)]">
            <Icon name="Send" size={18} /> התחבר עם Facebook
          </Link>
          <p className="text-muted text-[12px]">התחברות מאובטחת דרך Meta. אנחנו לא שומרים סיסמה ולא מבצעים scraping.</p>
        </div>
      </section>

      {/* What ZONO imports */}
      <section className="bg-card border-line rounded-[22px] border p-5 sm:p-6">
        <h2 className="text-ink mb-4 text-lg font-black">מה ZONO תייבא לאחר החיבור</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {IMPORTS.map((it) => (
            <div key={it.title} className="border-line flex items-start gap-3 rounded-2xl border p-4">
              <span className="bg-brand-soft text-brand grid h-11 w-11 shrink-0 place-items-center rounded-xl"><Icon name={it.icon} size={20} /></span>
              <div className="min-w-0"><p className="text-ink text-sm font-black">{it.title}</p><p className="text-muted mt-0.5 text-[13px] leading-relaxed">{it.body}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* Steps */}
      <section className="bg-card border-line rounded-[22px] border p-5 sm:p-6">
        <h2 className="text-ink mb-4 text-lg font-black">איך זה עובד</h2>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <div key={s.n} className="border-line bg-surface/40 relative flex flex-col gap-2 rounded-2xl border p-4">
              <div className="flex items-center gap-2">
                <span className="bg-brand grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[13px] font-black text-white">{s.n}</span>
                <span className="text-brand-strong"><Icon name={s.icon} size={16} /></span>
              </div>
              <p className="text-ink text-sm font-extrabold leading-tight">{s.label}</p>
              <p className="text-muted text-[11px] leading-snug">{s.hint}</p>
              {i < STEPS.length - 1 && <span className="text-muted/40 absolute -left-2 top-1/2 hidden -translate-y-1/2 lg:block">←</span>}
            </div>
          ))}
        </div>
      </section>

      {/* Honest fallback + compliance */}
      <section className="bg-card border-line rounded-[22px] border p-5 sm:p-6">
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <span className="bg-warning-soft text-warning grid h-9 w-9 shrink-0 place-items-center rounded-xl"><Icon name="ShieldCheck" size={18} /></span>
            <div>
              <p className="text-ink text-sm font-black">החיבור הרשמי דרך Meta בתהליך אישור</p>
              <p className="text-muted mt-0.5 text-[13px] leading-relaxed">עד השלמת אישור Meta, ניתן להתחבר במצב מסייע ולנהל את ספריית הקבוצות ידנית. הפרסום לקבוצות תמיד נשאר בשליטתך ובאישורך — שום דבר לא מתפרסם אוטומטית.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/distribution/groups" className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-bold transition"><Icon name="Users" size={15} /> בנה ספריית קבוצות ידנית</Link>
            <Link href={CONNECT_HREF} className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-bold transition"><Icon name="Send" size={15} /> הגדרות חיבורים</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
