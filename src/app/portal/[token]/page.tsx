import { headers } from "next/headers";
import { getPublicPortalByToken, logPortalView, type PublicPortalSection } from "@/lib/client-portals/service";

export const dynamic = "force-dynamic";

const fmtMoney = (n: unknown) => typeof n === "number" && n > 0 ? `₪${n.toLocaleString("he-IL")}` : "—";
const str = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export default async function PublicPortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const portal = await getPublicPortalByToken(token).catch(() => null);

  // Best-effort view logging (hashed UA/referrer/IP — no raw PII stored).
  if (portal && portal !== "inactive") {
    try {
      const h = await headers();
      await logPortalView(token, { userAgent: h.get("user-agent") ?? undefined, referrer: h.get("referer") ?? undefined, ip: (h.get("x-forwarded-for") ?? "").split(",")[0] || undefined });
    } catch { /* never block render */ }
  }

  if (!portal) return <InactiveState title="קישור לא תקין" subtitle="הקישור שהזנת אינו קיים." />;
  if (portal === "inactive") return <InactiveState title="הקישור אינו פעיל" subtitle="ייתכן שהפורטל הושהה, בוטל או שתוקפו פג. פנה לסוכן/ת שלך לקבלת קישור מעודכן." />;

  return (
    <main dir="rtl" className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="mb-6 rounded-[24px] bg-gradient-to-bl from-[#7C3AED] to-[#5B21B6] p-6 text-white shadow-[0_12px_40px_rgba(124,58,237,0.3)]">
        <p className="text-[12px] font-bold opacity-80">פורטל אישי · ZONO</p>
        <h1 className="mt-1 text-2xl font-black">{portal.title ?? "הפורטל שלך"}</h1>
        {portal.clientName && <p className="mt-1 text-sm opacity-90">שלום {portal.clientName} 👋</p>}
        {portal.description && <p className="mt-2 text-sm opacity-90">{portal.description}</p>}
      </header>

      <div className="flex flex-col gap-4">
        {portal.sections.map((s, i) => <Section key={i} s={s} />)}
      </div>

      <footer className="text-muted mt-8 text-center text-[11px]">מופעל על ידי ZONO · המידע מסופק לנוחותך ואינו מהווה ייעוץ.</footer>
    </main>
  );
}

function InactiveState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <main dir="rtl" className="grid min-h-screen place-items-center px-4">
      <div className="bg-card border-line max-w-md rounded-[24px] border p-8 text-center shadow-sm">
        <div className="bg-surface mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl text-2xl">🔒</div>
        <h1 className="text-ink text-xl font-black">{title}</h1>
        <p className="text-muted mt-2 text-sm">{subtitle}</p>
      </div>
    </main>
  );
}

function Card({ title, children }: { title: string | null; children: React.ReactNode }) {
  return (
    <section className="bg-card border-line rounded-[20px] border p-5 shadow-sm">
      {title && <h2 className="text-ink mb-3 text-base font-extrabold">{title}</h2>}
      {children}
    </section>
  );
}

function Section({ s }: { s: PublicPortalSection }) {
  const c = s.content;
  switch (s.type) {
    case "summary":
      return (
        <Card title={s.title}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {c.budget_max != null && <Field label="תקציב" value={`${fmtMoney(c.budget_min)} – ${fmtMoney(c.budget_max)}`} />}
            {c.price != null && <Field label="מחיר" value={fmtMoney(c.price)} />}
            {c.rooms != null && <Field label="חדרים" value={str(c.rooms)} />}
            {c.area != null && <Field label='מ״ר' value={str(c.area)} />}
            {Array.isArray(c.areas) && c.areas.length > 0 && <Field label="אזורים" value={(c.areas as string[]).join(", ")} />}
            {Boolean(c.city || c.neighborhood) && <Field label="מיקום" value={`${str(c.city)}${c.neighborhood ? " · " + c.neighborhood : ""}`} />}
            {Boolean(c.status) && <Field label="סטטוס" value={str(c.status)} />}
          </dl>
        </Card>
      );
    case "recommended_properties":
      return (
        <Card title={s.title}>
          <div className="flex flex-col gap-3">
            {s.items.length === 0 ? <Empty /> : s.items.map((it, i) => (
              <div key={i} className="border-line rounded-[16px] border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-ink font-bold">{str(it.title)}</p>
                    <p className="text-muted text-[13px]">{str(it.data.neighborhood)}{it.data.city ? " · " + str(it.data.city) : ""}</p>
                  </div>
                  {typeof it.data.match_score === "number" && <span className="bg-brand-soft text-brand rounded-full px-2 py-0.5 text-[11px] font-bold">{it.data.match_score}% התאמה</span>}
                </div>
                <div className="text-ink mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="font-black">{fmtMoney(it.data.price)}</span>
                  {it.data.rooms != null && <span>{str(it.data.rooms)} חד׳</span>}
                  {it.data.area != null && <span>{str(it.data.area)} מ״ר</span>}
                </div>
                {Boolean(it.data.why) && <p className="text-brand-strong mt-1 text-[12px]">✓ {str(it.data.why)}</p>}
              </div>
            ))}
          </div>
        </Card>
      );
    case "similar_transactions":
      return (
        <Card title={s.title}>
          <p className="text-muted mb-2 text-[12px]">{str(c.note ?? "עסקאות שנמכרו באזור")}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="text-muted text-[11px] font-bold"><tr>{["מיקום", "חדרים", 'מ״ר', "מחיר"].map((h) => <th key={h} className="py-1">{h}</th>)}</tr></thead>
              <tbody>{s.items.map((it, i) => (
                <tr key={i} className="border-line border-t">
                  <td className="text-ink py-1.5 font-semibold">{str(it.title)}</td>
                  <td className="py-1.5">{str(it.data.rooms)}</td>
                  <td className="py-1.5">{str(it.data.area)}</td>
                  <td className="text-ink py-1.5 font-bold">{fmtMoney(it.data.price)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
      );
    case "pricing_analysis":
      return (
        <Card title={s.title}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {c.estimated_market_value != null && <Field label="הערכת שווי" value={fmtMoney(c.estimated_market_value)} />}
            {c.asking_price != null && <Field label="מחיר מבוקש" value={fmtMoney(c.asking_price)} />}
            {c.avg_price_sqm != null && <Field label='ממוצע מ״ר' value={fmtMoney(c.avg_price_sqm)} />}
            {Boolean(c.confidence) && <Field label="רמת ביטחון" value={str(c.confidence)} />}
          </dl>
          {Boolean(c.explanation) && <p className="text-muted mt-3 text-[13px]">{str(c.explanation)}</p>}
        </Card>
      );
    case "buyer_demand":
      return (
        <Card title={s.title}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Field label="קונים מתאימים" value={str(c.matching_buyers)} />
            <Field label="רמת ביקוש" value={str(c.demand)} />
          </dl>
        </Card>
      );
    case "neighborhood_insights":
    case "market_context":
      return (
        <Card title={s.title}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {Boolean(c.demand) && <Field label="ביקוש" value={str(c.demand)} />}
            {Boolean(c.supply) && <Field label="היצע" value={str(c.supply)} />}
            {Boolean(c.trend) && <Field label="מגמה" value={str(c.trend)} />}
            {c.avg_price_sqm != null && <Field label='ממוצע מ״ר' value={fmtMoney(c.avg_price_sqm)} />}
            {Boolean(c.confidence) && <Field label="ביטחון" value={str(c.confidence)} />}
          </dl>
        </Card>
      );
    case "deal_progress":
      return (
        <Card title={s.title}>
          <ol className="flex flex-col gap-2">{s.items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              <span className={`grid h-6 w-6 place-items-center rounded-full text-[12px] font-bold ${it.data.done ? "bg-success text-white" : "bg-surface text-muted"}`}>{it.data.done ? "✓" : i + 1}</span>
              <span className={it.data.done ? "text-ink font-semibold" : "text-muted"}>{str(it.title)}</span>
            </li>
          ))}</ol>
        </Card>
      );
    case "agent_contact":
      return (
        <Card title={s.title}>
          <div className="flex flex-col gap-1 text-sm">
            {Boolean(c.agent_name) && <p className="text-ink font-bold">{str(c.agent_name)}</p>}
            {Boolean(c.office_name) && <p className="text-muted">{str(c.office_name)}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {Boolean(c.agent_phone) && <a href={`tel:${str(c.agent_phone)}`} className="bg-brand rounded-xl px-4 py-2 text-sm font-bold text-white">📞 התקשר</a>}
              {Boolean(c.agent_email) && <a href={`mailto:${str(c.agent_email)}`} className="bg-surface text-ink rounded-xl px-4 py-2 text-sm font-bold">✉ אימייל</a>}
            </div>
          </div>
        </Card>
      );
    case "next_steps":
    default:
      return (
        <Card title={s.title}>
          {s.items.length === 0 ? <Empty /> : (
            <ul className="flex flex-col gap-2">{s.items.map((it, i) => (
              <li key={i} className="text-ink flex items-start gap-2 text-sm">
                <span className="text-brand mt-0.5">◆</span>
                <span><span className="font-semibold">{str(it.title)}</span>{it.description ? ` — ${it.description}` : ""}</span>
              </li>
            ))}</ul>
          )}
        </Card>
      );
  }
}

function Field({ label, value }: { label: string; value: string }) {
  return (<div><dt className="text-muted text-[11px] font-bold">{label}</dt><dd className="text-ink font-semibold">{value}</dd></div>);
}
function Empty() { return <p className="text-muted text-sm">—</p>; }
