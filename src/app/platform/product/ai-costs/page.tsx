// ZONO — Platform · AI Cost Tracking (P5.11). A FINISHED instrumentation-status
// screen — NOT "coming soon". AI cost attribution does not exist in the schema
// (no token/cost columns), so this page opens and states that honestly: what AI
// systems were detected, what attribution is available/missing, and what is
// required to activate cost tracking. NO fabricated cost. Cap: platform.ai.read.
import { authorizePlatform } from "@/lib/platform-admin/server/auth";
import { getAiCostStatus } from "@/lib/platform-admin/server/intel";
import { PlatformDenied } from "@/components/platform-admin/PlatformDenied";
import { PageHeader, PanelCard } from "@/components/platform-admin/ui";
import { Icon } from "@/components/dashboard/Icon";

export const dynamic = "force-dynamic";

function AttrRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center gap-3 px-1 py-2">
      <span className="text-ink text-[13px] font-semibold">{label}</span>
      <span className={"ms-auto rounded-md px-2 py-0.5 text-[11px] font-bold " + (ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>{ok ? "זמין" : "חסר"}</span>
    </li>
  );
}

export default async function Page() {
  const operator = await authorizePlatform("platform.ai.read");
  if (!operator) return <PlatformDenied />;
  const s = await getAiCostStatus();

  return (
    <div className="space-y-5">
      <PageHeader eyebrow="מוצר" title="ניטור עלויות AI" description="מצב אינסטרומנטציה לניטור עלויות AI חוצה-ארגונים. ללא נתוני עלות מפוברקים." icon="Sparkles" />

      {/* Headline status */}
      <div className="border-warning-soft bg-warning-soft/40 flex items-start gap-3 rounded-2xl border px-5 py-4">
        <span className="text-warning mt-0.5"><Icon name="AlertCircle" size={18} /></span>
        <div>
          <div className="text-ink text-[15px] font-black">ניטור עלויות AI טרם הוגדר</div>
          <div className="text-muted mt-1 text-[13px]">סטטוס: <span className="bg-danger-soft text-danger rounded px-1.5 py-0.5 text-[11px] font-bold">NOT CONFIGURED</span> — {s.reason}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PanelCard title="מערכות AI שזוהו" icon="Sparkles">
          <div className="flex flex-wrap gap-2 px-1 py-1">
            {s.presentFeatures.map((f) => <span key={f} className="border-line bg-surface text-ink rounded-lg border px-2.5 py-1 font-mono text-[11px]" dir="ltr">{f}</span>)}
          </div>
          <p className="text-muted mt-3 px-1 text-[11px]">תשתית פיצ׳רי AI קיימת (יצירת תוכן, קופיילוט, סוכני שיחה), אך ללא מדידת שימוש/עלות.</p>
        </PanelCard>

        <PanelCard title="מצב ייחוס (Attribution)" icon="ShieldCheck">
          <ul className="divide-line divide-y">
            <AttrRow label="מעקב Tokens" ok={false} />
            <AttrRow label="מעקב עלות (USD/₪)" ok={false} />
            <AttrRow label="ייחוס לפי ארגון" ok={false} />
            <AttrRow label="ייחוס לפי משתמש" ok={false} />
            <AttrRow label="ייחוס לפי מודל/ספק" ok={false} />
          </ul>
        </PanelCard>
      </div>

      <PanelCard title="מה נדרש להפעלת מעקב עלויות" icon="Info">
        <div className="px-1 py-1 text-[13px] leading-relaxed text-ink">
          <p>{s.gap}</p>
          <p className="text-muted mt-3 text-[12px]">מיגרציה אדיטיבית מוצעת (לא הוחלה): טבלת <span className="font-mono" dir="ltr">ai_usage_costs</span> עם עמודות org_id, user_id, feature, provider, model, prompt_tokens, completion_tokens, cost_usd, occurred_at — עם RLS פלטפורמה בלבד. יש לכתוב לה מכל קריאת AI. דורש אישור נפרד לפני החלה.</p>
        </div>
      </PanelCard>
    </div>
  );
}
