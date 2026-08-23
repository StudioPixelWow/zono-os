// ============================================================================
// 🎯 לידים — Leads (server-paginated command table). Reads URL params, calls
// queryLeadsBoard (bounded scope + follow-up intelligence + KPIs + attention +
// filter + sort + pagination) and ships ONLY ONE PAGE to the client
// LeadsCommandTable. Real data only; all filter/sort/page state lives in the URL.
// ============================================================================
import Link from "next/link";
import { queryLeadsBoard } from "@/lib/leads/board-query";
import { isLeadSortKey, LEAD_BOARD_STAGES, type LeadAttentionKey, type LeadSortKey } from "@/lib/leads/board";
import { Icon } from "@/components/dashboard/Icon";
import { ZonoEmptyState } from "@/components/zono/ZonoEmptyState";
import { LeadsCommandTable } from "./LeadsCommandTable";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const num = (v: string | undefined): number | null => { if (!v) return null; const n = Number(v); return Number.isNaN(n) ? null : n; };
const ATTN: readonly string[] = ["overdue", "unassigned", "waiting", "needs_action", "any"];

const KPI_TONE_BG: Record<string, string> = {
  neutral: "bg-surface text-muted", success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", brand: "bg-brand-soft text-brand-strong",
};
const KPI_ICON: Record<string, string> = { all: "UserPlus", new: "Sparkles", qualified: "CheckCircle", nurturing: "Clock", unassigned: "AlertTriangle", overdue: "AlertTriangle" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const str = (k: string): string | undefined => { const v = sp[k]; return typeof v === "string" && v.trim() ? v.trim() : undefined; };

  const stageRaw = str("stage");
  const attRaw = str("attention");
  const params = {
    q: str("q"),
    stage: (stageRaw && (LEAD_BOARD_STAGES as readonly string[]).includes(stageRaw) ? stageRaw : null) as string | null,
    attention: (ATTN.includes(attRaw ?? "") ? attRaw : null) as LeadAttentionKey | "any" | null,
    sort: (isLeadSortKey(str("sort")) ? str("sort") : "urgency") as LeadSortKey,
    page: num(str("page")) ?? 1,
    pageSize: num(str("pageSize")) ?? 25,
  };

  let data;
  let loadError = false;
  try { data = await queryLeadsBoard(params); }
  catch (e) { console.error("[leads] board failed:", e); loadError = true; }

  const kpiHref = (key: string) => {
    const p = new URLSearchParams();
    if (key === "new" || key === "qualified" || key === "nurturing") p.set("stage", key);
    else if (key === "unassigned") p.set("attention", "unassigned");
    else if (key === "overdue") p.set("attention", "overdue");
    return `/leads${p.toString() ? `?${p}` : ""}`;
  };

  const isEmpty = data && data.total === 0 && !params.q && !params.stage && !params.attention;

  return (
    <div dir="rtl" className="flex w-full flex-col gap-4 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="UserPlus" size={18} /></span>
            <h1 className="text-ink text-2xl font-black leading-tight">לידים</h1>
          </div>
          <p className="text-muted mt-0.5 text-[13px]">כל הלידים — סינון לפי שלב, דחיפות ומצב פולואפ, בחירה מרובה ופעולות באצווה{data ? ` · ${data.total} לידים` : ""}</p>
        </div>
      </header>

      {loadError || !data ? (
        <div className="border-line bg-card text-danger rounded-2xl border p-8 text-center text-[13px] font-bold">שגיאה בטעינת הלידים — נסה לרענן</div>
      ) : isEmpty ? (
        <ZonoEmptyState
          title="הלקוח הראשון עוד לא כאן"
          description="זונו מוכנה לנהל את הדרך שלו מהרגע הראשון ועד העסקה — הוסיפו ליד ונתחיל לעבוד."
          actions={[{ label: "הוסף ליד ראשון", event: "zono:new-lead", primary: true }, { label: "הוסף קונה", href: "/buyers/new" }]}
        />
      ) : (
        <>
          <div className="border-line bg-card shadow-[var(--shadow-soft)] flex flex-wrap items-stretch divide-x divide-x-reverse divide-[var(--line)] overflow-hidden rounded-2xl max-md:overflow-x-auto md:flex-nowrap">
            {data.kpis.map((k) => (
              <Link key={k.key} href={kpiHref(k.key)} className={`hover:bg-brand-soft/30 flex min-w-[120px] flex-1 items-center gap-2.5 px-4 py-2.5 transition ${k.value === 0 && k.key !== "all" ? "opacity-60" : ""}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${KPI_TONE_BG[k.tone] ?? KPI_TONE_BG.neutral}`}><Icon name={KPI_ICON[k.key] ?? "UserPlus"} size={16} /></span>
                <div className="min-w-0"><div className="text-ink text-[17px] font-black leading-none tabular-nums">{k.value}</div><div className="text-muted mt-0.5 truncate text-[11px] font-semibold">{k.label}</div></div>
              </Link>
            ))}
          </div>

          {data.brief[0] && (
            <Link href={data.brief[0].href} className="border-brand-light rounded-2xl border bg-gradient-to-l from-[var(--color-brand-soft)] to-card p-3.5">
              <p className="text-brand-strong mb-0.5 flex items-center gap-1.5 text-[12px] font-black"><Icon name="Sparkles" size={13} />ZI מזהה</p>
              <p className="text-ink text-[13px] font-bold">{data.brief[0].text}</p>
              <span className="text-brand-strong mt-0.5 inline-block text-[11.5px] font-bold">טפל עכשיו →</span>
            </Link>
          )}

          {data.truncated && <div className="bg-warning-soft text-warning rounded-xl px-3 py-2 text-[12.5px] font-bold">מוצגים {data.total} הלידים העדכניים ביותר. צמצם עם סינון כדי לראות אחרים.</div>}

          <LeadsCommandTable data={data} />
        </>
      )}
    </div>
  );
}
