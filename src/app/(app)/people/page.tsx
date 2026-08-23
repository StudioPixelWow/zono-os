// ============================================================================
// 👥 אנשים — People directory (relationship command center). Server-paginated:
// the page reads URL params, calls queryPeopleDirectory (bounded scope fetch →
// unify → KPIs → attention → filter → sort → pagination) and ships ONLY ONE
// PAGE to the client PeopleDirectory. One human = one identity (deduped by
// phone/email across buyers/sellers/leads). Real data only; all filter/sort/
// page/view state lives in the URL.
// ============================================================================
import Link from "next/link";
import { getSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { queryPeopleDirectory } from "@/lib/people/directory-query";
import { isPeopleSortKey, type PeopleAttentionKey, type PeopleSortKey } from "@/lib/people/directory";
import { Icon } from "@/components/dashboard/Icon";
import { PeopleDirectory } from "./PeopleDirectory";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;
const num = (v: string | undefined): number | null => { if (!v) return null; const n = Number(v); return Number.isNaN(n) ? null : n; };
const ROLES: readonly string[] = ["buyer", "seller", "lead", "multi"];
const ATTN: readonly string[] = ["uncontactable", "unassigned", "stale", "any"];

const KPI_TONE_BG: Record<string, string> = {
  neutral: "bg-surface text-muted", success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger", warning: "bg-warning-soft text-warning",
  brand: "bg-brand-soft text-brand-strong", accent: "bg-brand-soft text-brand-strong",
};
const KPI_ICON: Record<string, string> = {
  all: "Users", buyer: "Users", seller: "UserCheck", lead: "Sparkles",
  multi: "UserCheck", unassigned: "UserPlus", stale: "Clock",
};

export default async function PeoplePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const str = (k: string): string | undefined => { const v = sp[k]; return typeof v === "string" && v.trim() ? v.trim() : undefined; };

  const { user, profile } = await getSessionContext();
  const supabase = await createClient();
  let canManage = false;
  if (user && profile?.org_id) {
    try { const { data } = await supabase.rpc("has_min_role", { p_min: "manager" }); canManage = data === true; } catch { /* agent */ }
  }

  const roleRaw = str("role");
  const attRaw = str("attention");
  const params = {
    q: str("q"),
    role: (ROLES.includes(roleRaw ?? "") ? roleRaw : null) as string | null,
    attention: (ATTN.includes(attRaw ?? "") ? attRaw : null) as PeopleAttentionKey | "any" | null,
    sort: (isPeopleSortKey(str("sort")) ? str("sort") : "activity") as PeopleSortKey,
    page: num(str("page")) ?? 1,
    pageSize: num(str("pageSize")) ?? 25,
  };
  const view = str("view") === "grid" ? "grid" : "table";

  let data;
  let loadError = false;
  try { data = await queryPeopleDirectory(params); }
  catch (e) { console.error("[people] query failed:", e); loadError = true; }

  // Assignable agents (managers reassign) — org users with an active seat.
  const agentOptions: { id: string; name: string; avatarUrl: string | null }[] = [];
  if (canManage && profile?.org_id) {
    try {
      const { data: us } = await supabase.from("users").select("id,full_name,avatar_url,status").eq("org_id", profile.org_id).eq("status", "active").order("full_name");
      for (const u of (us ?? []) as { id: string; full_name: string | null; avatar_url: string | null }[]) {
        agentOptions.push({ id: u.id, name: u.full_name || "סוכן", avatarUrl: u.avatar_url });
      }
    } catch { /* best-effort */ }
  }

  const kpiHref = (key: string) => {
    const p = new URLSearchParams();
    if (key === "buyer" || key === "seller" || key === "lead" || key === "multi") p.set("role", key);
    else if (key === "unassigned") p.set("attention", "unassigned");
    else if (key === "stale") p.set("attention", "stale");
    return `/people${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <div dir="rtl" className="flex w-full flex-col gap-4 pb-10">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Users" size={18} /></span>
            <h1 className="text-ink text-2xl font-black leading-tight">אנשים</h1>
          </div>
          <p className="text-muted mt-0.5 text-[13px]">זהות אחת לכל איש קשר — מאחדת קונה / מוכר / ליד לפי טלפון או אימייל{data ? ` · ${data.total} אנשים` : ""}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link href="/team" className="border-line text-ink hover:border-brand-light bg-card inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold transition"><Icon name="UserCheck" size={14} />צוות וסוכנים</Link>
        </div>
      </header>

      {loadError || !data ? (
        <div className="border-line bg-card text-danger rounded-2xl border p-8 text-center text-[13px] font-bold">שגיאה בטעינת אנשי הקשר — נסה לרענן</div>
      ) : (
        <>
          {/* KPI strip (clickable filters) */}
          <div className="border-line bg-card shadow-[var(--shadow-soft)] flex flex-wrap items-stretch divide-x divide-x-reverse divide-[var(--line)] overflow-hidden rounded-2xl max-md:overflow-x-auto md:flex-nowrap">
            {data.kpis.map((k) => (
              <Link key={k.key} href={kpiHref(k.key)} className={`hover:bg-brand-soft/30 flex min-w-[120px] flex-1 items-center gap-2.5 px-4 py-2.5 transition ${k.value === 0 && k.key !== "all" ? "opacity-60" : ""}`}>
                <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl ${KPI_TONE_BG[k.tone] ?? KPI_TONE_BG.neutral}`}>
                  <Icon name={KPI_ICON[k.key] ?? "Users"} size={16} />
                </span>
                <div className="min-w-0"><div className="text-ink text-[17px] font-black leading-none tabular-nums">{k.value}</div><div className="text-muted mt-0.5 truncate text-[11px] font-semibold">{k.label}</div></div>
              </Link>
            ))}
          </div>

          {/* One evidence-gated ZI insight (real counts only) */}
          {data.brief[0] && (
            <Link href={data.brief[0].href} className="border-brand-light rounded-2xl border bg-gradient-to-l from-[var(--color-brand-soft)] to-card p-3.5">
              <p className="text-brand-strong mb-0.5 flex items-center gap-1.5 text-[12px] font-black"><Icon name="Sparkles" size={13} />ZI מזהה</p>
              <p className="text-ink text-[13px] font-bold">{data.brief[0].text}</p>
              <span className="text-brand-strong mt-0.5 inline-block text-[11.5px] font-bold">טפל עכשיו →</span>
            </Link>
          )}

          <PeopleDirectory data={data} view={view} canManage={canManage} agentOptions={agentOptions} />
        </>
      )}
    </div>
  );
}
