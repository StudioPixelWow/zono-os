// ============================================================================
// 🏠 הנכסים שלי — My Properties (inventory command table). Server-paginated:
// the page reads URL params, calls queryInventory (server-side scope + KPIs +
// attention + filter + sort + pagination), and ships ONLY ONE PAGE to the client
// PropertiesCommandTable. No more "load the entire org inventory into the client".
// Real data only; all filter/sort/page/view state lives in the URL.
// ============================================================================
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { queryInventory } from "@/lib/properties/inventory-query";
import { isSortKey, type AttentionKey, type SortKey } from "@/lib/properties/inventory-center";
import { Icon } from "@/components/dashboard/Icon";
import { PropertiesCommandTable } from "./PropertiesCommandTable";
import type { ListingKind, PropertyStatus, PropertyType } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const num = (v: string | undefined): number | null => { if (!v) return null; const n = Number(v); return Number.isNaN(n) ? null : n; };
const ATTN: readonly string[] = ["no_image", "no_price", "unpublished", "missing_details", "stale", "any"];

const KPI_TONE_BG: Record<string, string> = {
  neutral: "bg-surface text-muted", success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning", brand: "bg-brand-soft text-brand-strong", accent: "bg-brand-soft text-brand-strong",
};

export default async function MyPropertiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const str = (k: string): string | undefined => { const v = sp[k]; return typeof v === "string" && v.trim() ? v.trim() : undefined; };

  const { user } = await getSessionContext();
  const currentUserId = user?.id ?? null;

  let canManage = false;
  const supabase = await createClient();
  try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); canManage = data === true; } catch { /* agent */ }

  const attRaw = str("attention");
  const params = {
    tab: "mine" as const,
    q: str("q"),
    status: (str("status") as PropertyStatus | undefined) ?? null,
    type: (str("type") as PropertyType | undefined) ?? null,
    kind: (str("kind") as ListingKind | undefined) ?? null,
    city: str("city") ?? null,
    minPrice: num(str("minPrice")), maxPrice: num(str("maxPrice")), minRooms: num(str("minRooms")),
    attention: (ATTN.includes(attRaw ?? "") ? attRaw : null) as AttentionKey | "any" | null,
    sort: (isSortKey(str("sort")) ? str("sort") : "recent") as SortKey,
    page: num(str("page")) ?? 1,
    pageSize: num(str("pageSize")) ?? 25,
  };
  const view = str("view") === "grid" ? "grid" : "table";

  let data;
  let loadError = false;
  try { data = await queryInventory(params, currentUserId); }
  catch (e) { console.error("[my-properties] query failed:", e); loadError = true; }

  // Assignable agents (managers reassign) — org users with an active seat.
  const agentOptions: { id: string; name: string; avatarUrl: string | null }[] = [];
  if (canManage) {
    try {
      const { data: us } = await supabase.from("users").select("id,full_name,avatar_url,status").eq("status", "active").order("full_name");
      for (const u of (us ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[]) {
        agentOptions.push({ id: u.id, name: u.full_name || "סוכן", avatarUrl: u.avatar_url });
      }
    } catch { /* best-effort */ }
  }

  const kpiHref = (key: string) => {
    const p = new URLSearchParams();
    if (key === "attention") p.set("attention", "any");
    else if (key === "no_image") p.set("attention", "no_image");
    else if (key === "no_price") p.set("attention", "no_price");
    else if (key === "draft") p.set("status", "draft");
    // "all" / "active" → clear to the base list
    return `/my-properties${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <div dir="rtl" className="flex w-full flex-col gap-4 pb-10">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-black leading-tight">הנכסים שלי</h1>
          <p className="text-muted mt-0.5 text-[13px]">ניהול מלאי, שיווק, התאמות ופעילות בנכסים{data ? ` · ${data.total} נכסים` : ""}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href="/properties/new" className="bg-brand inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-[12.5px] font-black text-white transition hover:opacity-95"><Icon name="Plus" size={14} />הוסף נכס</Link>
          <Link href="/office-inventory" className="border-line text-ink hover:border-brand-light bg-card inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold transition"><Icon name="Building2" size={14} />מלאי המשרד</Link>
        </div>
      </header>

      {loadError || !data ? (
        <div className="border-line bg-card text-danger rounded-2xl border p-8 text-center text-[13px] font-bold">שגיאה בטעינת הנכסים — נסה לרענן</div>
      ) : (
        <>
          {/* KPI status strip (clickable filters) — hidden for a brand-new (0-property)
              office so the first-run "add your first property" state is the focus, not
              a dominant row of 0s. */}
          {data.total > 0 && (
          <div className="border-line bg-card shadow-[var(--shadow-soft)] flex flex-wrap items-stretch divide-x divide-x-reverse divide-[var(--line)] overflow-hidden rounded-2xl max-md:overflow-x-auto md:flex-nowrap">
            {data.kpis.map((k) => (
              <Link key={k.key} href={kpiHref(k.key)} className={`hover:bg-brand-soft/30 flex min-w-[130px] flex-1 items-center gap-2.5 px-4 py-2.5 transition ${k.value === 0 && k.key !== "all" && k.key !== "active" ? "opacity-60" : ""}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${KPI_TONE_BG[k.tone] ?? KPI_TONE_BG.neutral}`}>
                  <Icon name={k.key === "attention" || k.key === "no_price" ? "AlertTriangle" : k.key === "no_image" ? "ImageOff" : k.key === "draft" ? "FileText" : k.key === "active" ? "CheckCircle" : "Building2"} size={16} />
                </span>
                <div className="min-w-0"><div className="text-ink text-[17px] font-black leading-none tabular-nums">{k.value}</div><div className="text-muted mt-0.5 truncate text-[11px] font-semibold">{k.label}</div></div>
              </Link>
            ))}
          </div>
          )}

          {/* One ZI/attention insight — evidence-gated (real counts only) */}
          {data.brief[0] && (
            <Link href={data.brief[0].href} className="border-brand-light rounded-2xl border bg-gradient-to-l from-[var(--color-brand-soft)] to-card p-3.5">
              <p className="text-brand-strong mb-0.5 flex items-center gap-1.5 text-[12px] font-black"><Icon name="Sparkles" size={13} />ZI מזהה</p>
              <p className="text-ink text-[13px] font-bold">{data.brief[0].text}</p>
              <span className="text-brand-strong mt-0.5 inline-block text-[11.5px] font-bold">טפל עכשיו →</span>
            </Link>
          )}

          <PropertiesCommandTable data={data} view={view} canManage={canManage} agentOptions={agentOptions} />
        </>
      )}
    </div>
  );
}
