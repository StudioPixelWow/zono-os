import { resolveSmartLink } from "@/lib/whatsapp/service";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  property: "נכס", project: "פרויקט", campaign: "קמפיין", buyer: "קונה", seller: "מוכר",
  valuation: "הערכת שווי", portal: "פורטל אישי", recommendation: "המלצות מותאמות",
};

export default async function SmartLinkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const link = await resolveSmartLink(slug).catch(() => null);

  if (!link) {
    return (
      <main dir="rtl" className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-6 text-center">
        <h1 className="text-ink text-2xl font-black">הקישור אינו פעיל</h1>
        <p className="text-muted mt-2 text-sm">ייתכן שהקישור פג תוקף או הוסר. פנה/י לסוכן/ת שלך לקבלת קישור מעודכן.</p>
      </main>
    );
  }

  return (
    <main dir="rtl" className="mx-auto w-full max-w-md px-5 py-10">
      <header className="rounded-[24px] bg-gradient-to-bl from-[#7C3AED] to-[#5B21B6] p-7 text-white shadow-[0_12px_40px_rgba(124,58,237,0.3)]">
        <p className="text-[12px] font-bold opacity-80">{TYPE_LABEL[link.link_type] ?? "קישור חכם"} · ZONO</p>
        <h1 className="mt-1 text-2xl font-black">{link.title ?? "ברוכים הבאים"}</h1>
        <p className="mt-2 text-sm opacity-90">תודה שהתעניינת. הסוכן/ת שלך יחזור/תחזור אליך בהקדם עם כל הפרטים.</p>
      </header>
      <div className="mt-5 rounded-2xl border border-line bg-card p-5 text-center shadow-sm">
        <p className="text-ink text-sm font-bold">רוצה לקבל פרטים מלאים בוואטסאפ?</p>
        <p className="text-muted mt-1 text-[13px]">השאר/י הודעה לסוכן/ת והפרטים יישלחו אליך ישירות. אנו מכבדים את פרטיותך ולא שולחים הודעות ללא הסכמה.</p>
      </div>
      <footer className="text-muted mt-8 text-center text-[11px]">מופעל על ידי ZONO · המידע מסופק לנוחותך ואינו מהווה ייעוץ.</footer>
    </main>
  );
}
