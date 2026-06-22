import { getCoverage } from "@/lib/whatsapp/service";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { built: "מוטמע", partial: "חלקי", provider_dependent: "תלוי ספק" };
const STATUS_TONE: Record<string, string> = {
  built: "bg-success-soft text-success", partial: "bg-warning-soft text-warning", provider_dependent: "bg-surface text-muted",
};

export default async function WhatsappCoveragePage() {
  let features: Awaited<ReturnType<typeof getCoverage>>["features"] = [];
  let stats = { total: 0, built: 0, partial: 0, provider: 0 };
  try { const c = await getCoverage(); features = c.features; stats = c.stats; } catch (e) { console.error("[whatsapp coverage]", e); }

  const layers = Array.from(new Set(features.map((f) => f.layer)));

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="bg-brand text-white grid h-9 w-9 place-items-center rounded-xl"><Icon name="MessageCircle" size={18} /></span>
          <h1 className="text-ink text-2xl font-black">WhatsApp OS — מטריצת 86 הפיצ׳רים</h1>
        </div>
        <p className="text-muted text-sm">״WeBot Killer״ — מיפוי מלא של 86 היכולות לשכבות ZONO. סטטוס אמיתי: מה מוטמע דטרמיניסטית, מה חלקי, ומה תלוי ב-Meta/WhatsApp API רשמי.</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="סה״כ פיצ׳רים" value={stats.total} tone="text-ink" />
        <Stat label="מוטמע" value={stats.built} tone="text-success" />
        <Stat label="חלקי" value={stats.partial} tone="text-warning" />
        <Stat label="תלוי ספק" value={stats.provider} tone="text-muted" />
      </div>

      {layers.map((layer) => (
        <section key={layer} className="flex flex-col gap-2">
          <h2 className="text-ink text-sm font-black">{layer}</h2>
          <div className="overflow-hidden rounded-2xl border border-line">
            <table className="w-full text-right text-[13px]">
              <tbody>
                {features.filter((f) => f.layer === layer).map((f) => (
                  <tr key={f.num} className="border-line border-b last:border-0">
                    <td className="text-muted w-8 px-3 py-2 font-mono text-[11px]">{f.num}</td>
                    <td className="text-ink px-2 py-2 font-bold">{f.name}</td>
                    <td className="text-muted px-2 py-2 text-[12px]">{f.module}</td>
                    <td className="px-3 py-2 text-left"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[f.status]}`}>{STATUS_LABEL[f.status]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="text-muted text-[12px]">״תלוי ספק״ = יכולות הדורשות WhatsApp Business / Meta Cloud API רשמי (שליחה אוטומטית, תמלול הקלטות, אישורי קריאה). ZONO לא משתמש באוטומציה לא רשמית, לא סורק ולא שומר אסימונים — עד לחיבור רשמי, היכולות הללו פועלות במצב ידני.</p>
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return <div className="bg-card border-line flex flex-col gap-0.5 rounded-2xl border p-3 shadow-sm"><span className="text-muted text-[11px] font-bold">{label}</span><span className={`text-2xl font-black ${tone}`}>{value}</span></div>;
}
