"use client";

import { useMemo, useState } from "react";
import type { DistributionBoard } from "@/lib/distribution/service";
import { Glass, SectionHeading, ScoreBar, EmptyState, Icon, compact } from "./shared";

type Community = DistributionBoard["communities"][number];

const CATEGORY_LABEL: Record<string, string> = {
  real_estate: "נדל״ן", projects: "פרויקטים", commercial: "מסחרי", luxury: "יוקרה", community: "קהילתי", general: "כללי",
};
const STATUS_LABEL: Record<string, string> = {
  approved_for_distribution: "מאושרת להפצה", approved_for_analysis: "מאושרת לניתוח", suggested: "ממתינה", discovered: "זוהתה", rejected: "נדחתה", active: "פעילה", inactive: "לא פעילה",
};
const STATUS_TONE: Record<string, string> = {
  approved_for_distribution: "bg-success-soft text-success", approved_for_analysis: "bg-brand-soft text-brand-strong",
  suggested: "bg-warning-soft text-warning", discovered: "bg-line/70 text-muted", rejected: "bg-danger-soft text-danger",
};

type SortKey = "members" | "performance" | "name";

export function GroupLibrarySection({ board }: { board: DistributionBoard }) {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState<SortKey>("performance");

  const cities = useMemo(() => {
    const s = new Set<string>();
    for (const c of board.communities) if (c.city) s.add(c.city);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "he"));
  }, [board.communities]);

  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    return board.communities
      .filter((c) => {
        if (ql && !`${c.name} ${c.city ?? ""} ${c.platform}`.toLowerCase().includes(ql)) return false;
        if (city && c.city !== city) return false;
        if (category && c.community_type !== category) return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === "members") return (b.members_count ?? 0) - (a.members_count ?? 0);
        if (sort === "name") return a.name.localeCompare(b.name, "he");
        return (b.intel?.community_health_score ?? 0) - (a.intel?.community_health_score ?? 0);
      });
  }, [board.communities, q, city, category, sort]);

  const field = "bg-card/70 border-line text-ink focus:border-brand-light h-10 rounded-xl border px-3 text-sm outline-none transition";

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="ספריית קבוצות" subtitle="כל קהילות הפייסבוק שלך, מדורגות לפי ביצועים" icon="Users"
        action={<span className="text-muted text-sm font-semibold tabular-nums">{rows.length} קבוצות</span>} />

      <Glass className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <span className="text-muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"><Icon name="Search" size={16} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש קבוצה, עיר או פלטפורמה..." className={`${field} w-full pr-10`} />
        </div>
        <select value={city} onChange={(e) => setCity(e.target.value)} className={field}>
          <option value="">כל הערים</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
          <option value="">כל הקטגוריות</option>
          {Object.entries(CATEGORY_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={field}>
          <option value="performance">מיון: ביצועים</option>
          <option value="members">מיון: חברים</option>
          <option value="name">מיון: שם</option>
        </select>
      </Glass>

      {rows.length === 0 ? (
        <EmptyState icon="Users" title="לא נמצאו קבוצות" body="אין קהילות שתואמות לסינון, או שעדיין לא אושרו קהילות להפצה. אשר קהילות בעמוד מודיעין הקהילות." />
      ) : (
        <Glass className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-start text-sm">
              <thead className="text-muted border-line bg-white/40 border-b text-xs">
                <tr>{["שם הקבוצה", "קטגוריה", "עיר", "חברים", "סטטוס", "ציון ביצועים", "עדכון אחרון"].map((h) => <th key={h} className="px-4 py-3 text-start font-bold whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((c: Community) => (
                  <tr key={c.id} className="border-line hover:bg-white/40 border-b transition-colors last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="bg-brand-soft text-brand-strong grid h-8 w-8 shrink-0 place-items-center rounded-lg"><Icon name={c.platform === "facebook" ? "Facebook" : "Users"} size={15} /></span>
                        <span className="text-ink font-bold">{c.name}</span>
                      </div>
                    </td>
                    <td className="text-muted px-4 py-3">{CATEGORY_LABEL[c.community_type] ?? c.community_type ?? "—"}</td>
                    <td className="text-muted px-4 py-3">{c.city ?? "—"}</td>
                    <td className="text-ink px-4 py-3 font-bold tabular-nums">{compact(c.members_count)}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[c.approval_status] ?? "bg-line/70 text-muted"}`}>{STATUS_LABEL[c.approval_status] ?? c.approval_status}</span></td>
                    <td className="px-4 py-3"><ScoreBar value={c.intel?.community_health_score ?? 0} /></td>
                    <td className="text-muted px-4 py-3 text-xs whitespace-nowrap">{c.intel?.last_calculated_at ? new Date(c.intel.last_calculated_at).toLocaleDateString("he-IL") : c.updated_at ? new Date(c.updated_at).toLocaleDateString("he-IL") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Glass>
      )}
    </div>
  );
}
