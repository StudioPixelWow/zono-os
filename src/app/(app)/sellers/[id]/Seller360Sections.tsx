import Link from "next/link";
import { formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import {
  CONTACT_METHOD_OPTIONS,
  DECISION_STYLE_OPTIONS,
  MOTIVATION_OPTIONS,
  SELLER_TYPE_OPTIONS,
  URGENCY_OPTIONS,
} from "@/lib/sellers/types";
import type { OwnedProperty } from "@/lib/sellers/service360";
import type { Database } from "@/lib/supabase/types";

type SellerRow = Database["public"]["Tables"]["sellers"]["Row"];
const opt = (arr: { value: string; label: string }[], v: string | null) => (v ? (arr.find((o) => o.value === v)?.label ?? v) : "—");

function Card({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-4 flex items-center gap-2">
        <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name={icon} size={16} /></span>
        <h3 className="text-ink text-sm font-extrabold">{title}</h3>
      </div>
      {children}
    </div>
  );
}
function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="border-line flex items-center justify-between border-b py-2 last:border-0"><span className="text-muted text-sm">{k}</span><span className="text-ink text-sm font-semibold">{v}</span></div>;
}
function Bar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-muted flex items-center justify-between text-xs"><span>{label}</span><span className="text-brand-strong font-bold">{value}</span></div>
      <div className="bg-surface mt-1 h-2 w-full overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full" style={{ width: `${value}%` }} /></div>
    </div>
  );
}

const REL_LABELS: Record<string, string> = { owner: "בעלים", co_owner: "בעלים שותף", decision_maker: "מקבל החלטות", representative: "נציג", power_of_attorney: "מיופה כוח", lawyer: "עו״ד", family_member: "בן משפחה", investor: "משקיע", other: "אחר" };
export function Seller360Sections({ seller: s, properties }: { seller: SellerRow; properties: OwnedProperty[] }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="זהות מוכר" icon="UserCheck">
          <Row k="סוג מוכר" v={opt(SELLER_TYPE_OPTIONS, s.seller_type)} />
          <Row k="טלפון" v={s.phone ?? "—"} />
          <Row k="טלפון נוסף" v={s.secondary_phone ?? "—"} />
          <Row k="אימייל" v={s.email ?? "—"} />
          <Row k="עיר" v={s.city ?? "—"} />
          <Row k="אמצעי קשר מועדף" v={opt(CONTACT_METHOD_OPTIONS, s.preferred_contact_method)} />
        </Card>

        <Card title="בעלויות הנכס" icon="Building2">
          {properties.length === 0 ? <p className="text-muted text-sm">אין נכסים מקושרים.</p> : (
            <ul className="flex flex-col gap-2">
              {properties.map((p) => (
                <li key={p.linkId} className="border-line flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0">
                  <Link href={`/properties/${p.propertyId}`} className="text-ink hover:text-brand text-sm font-bold">{p.title}</Link>
                  <span className="flex flex-wrap items-center gap-1 text-[11px]">
                    <span className="text-muted">{REL_LABELS[p.relationshipType] ?? p.relationshipType}{p.ownershipPercentage != null ? ` · ${p.ownershipPercentage}%` : ""}</span>
                    {p.isPrimary && <Badge tone="brand" size="sm">ראשי</Badge>}
                    {p.isDecisionMaker && <Badge tone="accent" size="sm">מקבל החלטות</Badge>}
                    {p.canSign && <Badge tone="success" size="sm">חתימה</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="מוטיבציה ודחיפות" icon="Flame">
          <Row k="סיבת מכירה" v={opt(MOTIVATION_OPTIONS, s.motivation_type)} />
          <Row k="דחיפות" v={opt(URGENCY_OPTIONS, s.urgency_level)} />
          <Row k="תאריך יעד" v={s.target_sale_date ?? "—"} />
          <Row k="חייב למכור עד" v={s.must_sell_by ?? "—"} />
          {s.motivation_notes && <p className="text-muted mt-2 text-sm">{s.motivation_notes}</p>}
        </Card>

        <Card title="הקשר פיננסי" icon="BarChart3">
          <Row k="מחיר רצוי" v={s.desired_price ? formatShekels(s.desired_price) : "—"} />
          <Row k="מחיר מינימום" v={s.minimum_price ? formatShekels(s.minimum_price) : "—"} />
          <Row k="מחיר חלום" v={s.dream_price ? formatShekels(s.dream_price) : "—"} />
          <Row k="משכנתא" v={s.mortgage_exists ? `כן${s.mortgage_balance ? ` · ${formatShekels(s.mortgage_balance)}` : ""}` : "—"} />
          {s.financial_notes && <p className="text-muted mt-2 text-sm">{s.financial_notes}</p>}
        </Card>

        <Card title="פסיכולוגיה ומשא ומתן" icon="TrendingUp">
          <Row k="סגנון החלטה" v={opt(DECISION_STYLE_OPTIONS, s.decision_style)} />
          {s.main_objection && <Row k="התנגדות עיקרית" v={s.main_objection} />}
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Bar label="רגישות מחיר" value={s.price_sensitivity_score} />
            <Bar label="רגישות זמן" value={s.time_sensitivity_score} />
            <Bar label="רגישות אמון" value={s.trust_sensitivity_score} />
            <Bar label="פתיחות לשיווק" value={s.marketing_openness_score} />
            <Bar label="גמישות במו״מ" value={s.negotiation_flexibility_score} />
            <Bar label="שיתוף פעולה" value={s.cooperation_score} />
          </div>
        </Card>

        <Card title="מוכנות מסמכים" icon="Presentation">
          <div className="mb-3 flex flex-wrap gap-2">
            {s.has_signed_agreement ? <Badge tone="success" size="sm">הסכם חתום</Badge> : <Badge tone="warning" size="sm">אין הסכם חתום</Badge>}
            {s.allows_marketing ? <Badge tone="success" size="sm">מאשר שיווק</Badge> : <Badge tone="danger" size="sm">לא מאשר שיווק</Badge>}
            {s.allows_exclusive && <Badge tone="brand" size="sm">בלעדיות</Badge>}
          </div>
          <p className="text-muted text-[12px] leading-relaxed">
            המסמכים המשפטיים של המוכר מנוהלים בלשונית <span className="text-ink font-bold">מסמכים</span> — שם ניתן ליצור, לערוך ולעקוב אחר סטטוס החתימה.
          </p>
        </Card>
      </div>
    </div>
  );
}
