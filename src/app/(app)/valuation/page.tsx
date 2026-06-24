import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { listValuations, type ValuationListItem } from "@/lib/valuation/service";
import { CONFIDENCE_LABEL } from "@/lib/valuation/types";

export const dynamic = "force-dynamic";

const ils = (n: number | null) => (n == null ? "—" : `₪${Math.round(n).toLocaleString("he-IL")}`);

const SCAN_STEPS = [
  { icon: "Building2", label: "עסקאות שֶׁבוצעו" },
  { icon: "Megaphone", label: "מודעות פעילות" },
  { icon: "Handshake", label: "נכסים שמכרת" },
  { icon: "Sparkles", label: "בינה מלאכותית" },
];

export default async function ValuationLandingPage() {
  let recent: ValuationListItem[] = [];
  try { recent = await listValuations(); } catch (e) { console.error("[valuation] list failed:", e); }

  return (
    <main dir="rtl" className="mx-auto w-full max-w-5xl px-4 py-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-[28px] border border-line bg-gradient-to-br from-brand/95 to-[#3b1d6e] p-8 text-white shadow-card sm:p-12">
        <div className="zono-gradient-glow pointer-events-none absolute -left-16 -top-16 h-64 w-64 rounded-full opacity-30 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold backdrop-blur">
            <Icon name="Sparkles" size={13} /> ZONO Price Intelligence
          </span>
          <h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">הערכת שווי חכמה לנכס</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/85 sm:text-base">
            מנוע תמחור מבוסס עסקאות, מודעות פעילות, נכסים שמכרת באזור ובינה מלאכותית.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/valuation/new" className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-black text-brand-strong shadow-lg transition hover:bg-white/90">
              <Icon name="Plus" size={16} /> התחל הערכת שווי
            </Link>
            <Link href="/properties" className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20">
              <Icon name="Building2" size={16} /> העלה נכס קיים
            </Link>
          </div>
          <div className="mt-7 flex flex-wrap gap-2">
            {SCAN_STEPS.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur">
                <Icon name={s.icon} size={13} /> {s.label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Recent valuations */}
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-ink text-lg font-black">הערכות אחרונות</h2>
          {recent.length > 0 && <Link href="/valuation/new" className="text-brand text-sm font-bold">הערכה חדשה +</Link>}
        </div>

        {recent.length === 0 ? (
          <div className="border-line bg-card grid place-items-center rounded-card border border-dashed p-12 text-center shadow-card">
            <span className="zono-gradient-glow mb-3 grid h-12 w-12 place-items-center rounded-2xl text-white"><Icon name="Calculator" size={22} /></span>
            <p className="text-ink font-bold">עדיין לא ביצעת הערכות שווי</p>
            <p className="text-muted mt-1 max-w-md text-sm">צור הערכת שווי ראשונה — תקבל שווי מוערך, אסטרטגיית תמחור ודוח מותג לבעל הנכס.</p>
            <Link href="/valuation/new" className="btn-zono-primary zono-focus-ring mt-4 inline-flex h-10 items-center gap-2 rounded-lg px-5 text-sm font-semibold">
              <Icon name="Plus" size={15} /> התחל עכשיו
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((v) => (
              <Link key={v.id} href={`/valuation/${v.id}`} className="border-line bg-card group rounded-card border p-4 shadow-card transition hover:shadow-lg">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-ink truncate font-bold">{[v.street, v.neighborhood, v.city].filter(Boolean).join(", ") || "נכס"}</p>
                  <Icon name="ChevronLeft" size={16} className="text-muted group-hover:text-brand" />
                </div>
                <p className="text-brand-strong mt-2 text-2xl font-black">{ils(v.estimatedValue)}</p>
                <div className="text-muted mt-2 flex items-center gap-2 text-xs">
                  <span className={`rounded-full px-2 py-0.5 font-bold ${v.status === "completed" ? "bg-emerald-50 text-emerald-700" : "bg-line/60 text-ink"}`}>
                    {v.status === "completed" ? "הושלם" : v.status === "draft" ? "טיוטה" : "בעיבוד"}
                  </span>
                  {v.confidenceLevel && <span>ביטחון: {CONFIDENCE_LABEL[v.confidenceLevel as keyof typeof CONFIDENCE_LABEL] ?? v.confidenceLevel}</span>}
                  <span>· {new Date(v.createdAt).toLocaleDateString("he-IL")}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
