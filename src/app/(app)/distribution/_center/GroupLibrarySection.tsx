"use client";

import { useMemo, useState } from "react";
import type { CenterGroup } from "@/lib/distribution/center-data";
import { createGroupAction, updateGroupStatusAction, deleteGroupAction } from "@/lib/distribution/center-actions";
import type { DistGroupStatus } from "@/lib/distribution/db-types";
import { cn } from "@/lib/utils";
import { Glass, SectionHeading, ScoreBar, EmptyState, Icon, compact } from "./shared";
import type { RunAction } from "./DistributionCenterView";

const STATUS_LABEL: Record<string, string> = {
  active: "פעילה", inactive: "לא פעילה", blocked: "חסומה", pending: "ממתינה",
};
const STATUS_TONE: Record<string, string> = {
  active: "bg-success-soft text-success", inactive: "bg-line/70 text-muted",
  blocked: "bg-danger-soft text-danger", pending: "bg-warning-soft text-warning",
};
const STATUS_CYCLE: Record<string, DistGroupStatus> = {
  active: "inactive", inactive: "active", blocked: "active", pending: "active",
};

type SortKey = "members" | "performance" | "name";

// ── Bulk import parser ───────────────────────────────────────────────────────
// Accepts pasted lines. A comma line is treated as CSV
// (name,url,city,area,category,propertyType,notes); otherwise a bare URL or name.
// Shared folder/city/property-type from the form fill the gaps. No scraping —
// this only records what the agent pasted, reusing createGroupAction.
type ParsedGroup = { name: string; url?: string; city?: string; area?: string; category?: string; propertyType?: string; notes?: string };
function deriveName(url: string): string {
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    const seg = u.pathname.split("/").filter(Boolean).pop();
    return decodeURIComponent(seg || u.hostname).replace(/[-_]/g, " ").slice(0, 80) || url;
  } catch { return url.slice(0, 80); }
}
function parseBulk(text: string, shared: { city?: string; category?: string; propertyType?: string }): ParsedGroup[] {
  const out: ParsedGroup[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.includes(",")) {
      const [name, url, city, area, category, propertyType, notes] = line.split(",").map((c) => c.trim());
      const n = name || (url ? deriveName(url) : "");
      if (!n) continue;
      out.push({ name: n, url: url || undefined, city: city || shared.city, area: area || undefined, category: category || shared.category, propertyType: propertyType || shared.propertyType, notes: notes || undefined });
    } else {
      const isUrl = /^(https?:\/\/|www\.|facebook\.com|fb\.com)/i.test(line);
      out.push({ name: isUrl ? deriveName(line) : line, url: isUrl ? line : undefined, city: shared.city, category: shared.category, propertyType: shared.propertyType });
    }
  }
  return out;
}

export function GroupLibrarySection({
  groups,
  runAction,
  pending,
}: {
  groups: CenterGroup[];
  runAction: RunAction;
  pending: boolean;
}) {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [sort, setSort] = useState<SortKey>("performance");
  const [showForm, setShowForm] = useState(false);
  // Single add
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [formCity, setFormCity] = useState("");
  const [area, setArea] = useState("");
  const [category, setCategory] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [notes, setNotes] = useState("");
  // Bulk import
  const [showBulk, setShowBulk] = useState(false);
  const [bulk, setBulk] = useState("");
  const [importing, setImporting] = useState(false);

  const cities = useMemo(() => {
    const s = new Set<string>();
    for (const g of groups) if (g.city) s.add(g.city);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "he"));
  }, [groups]);

  const rows = useMemo(() => {
    const ql = q.toLowerCase();
    return groups
      .filter((g) => {
        if (ql && !`${g.name} ${g.city ?? ""} ${g.area ?? ""}`.toLowerCase().includes(ql)) return false;
        if (city && g.city !== city) return false;
        return true;
      })
      .sort((a, b) => {
        if (sort === "members") return b.membersCount - a.membersCount;
        if (sort === "name") return a.name.localeCompare(b.name, "he");
        return b.performanceScore - a.performanceScore;
      });
  }, [groups, q, city, sort]);

  const field = "bg-card/70 border-line text-ink focus:border-brand-light h-10 rounded-xl border px-3 text-sm outline-none transition";

  function submit() {
    if (!name.trim()) return;
    runAction(() => createGroupAction({
      name, url: url || undefined, city: formCity || undefined, area: area || undefined,
      category: category || undefined, propertyType: propertyType || undefined, notes: notes || undefined,
    }), "הקבוצה נוצרה");
    setName(""); setUrl(""); setFormCity(""); setArea(""); setCategory(""); setPropertyType(""); setNotes(""); setShowForm(false);
  }

  const bulkPreview = useMemo(() => parseBulk(bulk, { city: formCity, category, propertyType }), [bulk, formCity, category, propertyType]);

  async function importBulk() {
    const items = bulkPreview.slice(0, 100); // safety cap per import
    if (items.length === 0) return;
    setImporting(true);
    let okc = 0;
    for (const it of items) {
      const res = await createGroupAction(it);
      if (!res.error) okc += 1;
    }
    setImporting(false);
    setBulk("");
    setShowBulk(false);
    // Single refresh + toast via the parent runner (reuses its router.refresh).
    runAction(async () => ({}), `${okc} קבוצות יובאו לספרייה`);
  }

  const busy = pending || importing;

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="ספריית קבוצות" subtitle="כל קבוצות הפייסבוק שלך, מדורגות לפי ביצועים" icon="Users"
        action={
          <div className="flex gap-2">
            <button type="button" onClick={() => { setShowBulk((s) => !s); setShowForm(false); }} className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-bold transition">
              <Icon name="Copy" size={16} /> ייבוא בכמות
            </button>
            <button type="button" onClick={() => { setShowForm((s) => !s); setShowBulk(false); }} className="btn-zono-primary inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-bold text-white">
              <Icon name="Plus" size={16} /> קבוצה חדשה
            </button>
          </div>
        } />

      {/* Single add — full field set */}
      {showForm && (
        <Glass className="flex flex-col gap-3 p-5">
          <p className="text-ink text-sm font-extrabold">הוספת קבוצה</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הקבוצה *" className={field} />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="קישור לקבוצה (אופציונלי)" className={field} dir="ltr" />
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="תיקייה / קטגוריה" className={field} list="group-categories" />
            <datalist id="group-categories"><option value="נדל״ן" /><option value="שכונתי" /><option value="יד שנייה" /><option value="השקעות" /><option value="שכירות" /></datalist>
            <input value={formCity} onChange={(e) => setFormCity(e.target.value)} placeholder="עיר" className={field} />
            <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="שכונה / אזור" className={field} />
            <input value={propertyType} onChange={(e) => setPropertyType(e.target.value)} placeholder="סוג נכס (דירה / וילה / מסחרי)" className={field} />
          </div>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הערות / כללי הקבוצה (אופציונלי)" rows={2} className="bg-card/70 border-line text-ink focus:border-brand-light rounded-xl border px-3 py-2 text-sm outline-none transition" />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !name.trim()} onClick={submit} className="btn-zono-primary rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50">שמור קבוצה</button>
            <button type="button" onClick={() => setShowForm(false)} className="text-muted rounded-xl px-4 py-2 text-sm font-bold">ביטול</button>
          </div>
        </Glass>
      )}

      {/* Bulk import — paste many links / CSV lines */}
      {showBulk && (
        <Glass className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <span className="bg-brand-soft text-brand-strong grid h-8 w-8 place-items-center rounded-xl"><Icon name="Copy" size={16} /></span>
            <p className="text-ink text-sm font-extrabold">ייבוא קבוצות בכמות</p>
          </div>
          <p className="text-muted text-[12px] leading-relaxed">
            הדבק קישור לכל שורה, או שורת CSV: <span dir="ltr" className="font-mono text-[11px]">name,url,city,area,category,propertyType,notes</span>.
            עיר / תיקייה / סוג נכס שתמלא למטה יחולו על שורות שחסר בהן מידע.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input value={formCity} onChange={(e) => setFormCity(e.target.value)} placeholder="עיר משותפת (אופציונלי)" className={field} />
            <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="תיקייה משותפת" className={field} />
            <input value={propertyType} onChange={(e) => setPropertyType(e.target.value)} placeholder="סוג נכס משותף" className={field} />
          </div>
          <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={6} dir="ltr" placeholder={"https://facebook.com/groups/123\nנדל״ן קריות, https://facebook.com/groups/456, קרית ביאליק"} className="bg-card/70 border-line text-ink focus:border-brand-light rounded-xl border px-3 py-2 text-sm outline-none transition" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy || bulkPreview.length === 0} onClick={importBulk} className="btn-zono-primary inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              <Icon name="Plus" size={15} /> {importing ? "מייבא..." : `ייבא ${bulkPreview.length} קבוצות`}
            </button>
            <button type="button" onClick={() => setShowBulk(false)} className="text-muted rounded-xl px-4 py-2 text-sm font-bold">ביטול</button>
            {bulkPreview.length > 100 && <span className="text-warning text-[11px] font-bold">עד 100 קבוצות בייבוא אחד — השאר יבוצע בייבוא נוסף.</span>}
          </div>
        </Glass>
      )}

      <Glass className="flex flex-wrap items-center gap-2 p-3">
        <div className="relative min-w-[200px] flex-1">
          <span className="text-muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"><Icon name="Search" size={16} /></span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש קבוצה, עיר או אזור..." className={`${field} w-full pr-10`} />
        </div>
        <select value={city} onChange={(e) => setCity(e.target.value)} className={field}>
          <option value="">כל הערים</option>
          {cities.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={field}>
          <option value="performance">מיון: ביצועים</option>
          <option value="members">מיון: חברים</option>
          <option value="name">מיון: שם</option>
        </select>
        <span className="text-muted px-2 text-sm font-semibold tabular-nums">{rows.length} קבוצות</span>
      </Glass>

      {groups.length === 0 ? (
        <EmptyState icon="Users" title="אין עדיין קבוצות" body="חבר פייסבוק או הוסף קבוצות ידנית כדי לבנות ספריית הפצה. אפשר להוסיף קבוצה בודדת או להדביק כמה קישורים בבת אחת — וZONO ידרג אותן לפי ביצועים."
          action={
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <button type="button" onClick={() => { setShowForm(true); setShowBulk(false); }} className="btn-zono-primary rounded-xl px-4 py-2 text-sm font-bold text-white">הוסף קבוצה ראשונה</button>
              <button type="button" onClick={() => { setShowBulk(true); setShowForm(false); }} className="bg-card border-line text-ink hover:border-brand-light rounded-xl border px-4 py-2 text-sm font-bold transition">ייבוא בכמות</button>
            </div>
          } />
      ) : rows.length === 0 ? (
        <EmptyState icon="Search" title="לא נמצאו קבוצות" body="אין קבוצות שתואמות לסינון. נסה לשנות את החיפוש או הפילטרים." />
      ) : (
        <Glass className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-start text-sm">
              <thead className="text-muted border-line bg-white/40 border-b text-xs">
                <tr>{["שם הקבוצה", "אזור", "חברים", "סטטוס", "ציון ביצועים", "פעולות"].map((h) => <th key={h} className="px-4 py-3 text-start font-bold whitespace-nowrap">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.id} className="border-line hover:bg-white/40 border-b transition-colors last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="bg-brand-soft text-brand-strong grid h-8 w-8 shrink-0 place-items-center rounded-lg"><Icon name="Users" size={15} /></span>
                        {g.url ? (
                          <a href={g.url} target="_blank" rel="noopener" className="text-ink font-bold hover:text-brand-strong">{g.name}</a>
                        ) : (
                          <span className="text-ink font-bold">{g.name}</span>
                        )}
                      </div>
                    </td>
                    <td className="text-muted px-4 py-3">{[g.area, g.city].filter(Boolean).join(", ") || "—"}</td>
                    <td className="text-ink px-4 py-3 font-bold tabular-nums">{compact(g.membersCount)}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[g.status] ?? "bg-line/70 text-muted"}`}>{STATUS_LABEL[g.status] ?? g.status}</span></td>
                    <td className="px-4 py-3"><ScoreBar value={g.performanceScore} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <button type="button" disabled={busy} title="החלף סטטוס"
                          onClick={() => runAction(() => updateGroupStatusAction({ id: g.id, status: STATUS_CYCLE[g.status] ?? "active" }), "סטטוס הקבוצה עודכן")}
                          className={cn("grid h-8 w-8 place-items-center rounded-lg transition disabled:opacity-50", "bg-brand-soft text-brand-strong hover:brightness-95")}>
                          <Icon name="RefreshCw" size={14} />
                        </button>
                        <button type="button" disabled={busy} title="מחק קבוצה"
                          onClick={() => runAction(() => deleteGroupAction({ id: g.id }), "הקבוצה נמחקה")}
                          className="bg-danger-soft text-danger grid h-8 w-8 place-items-center rounded-lg transition hover:brightness-95 disabled:opacity-50">
                          <Icon name="Trash2" size={14} />
                        </button>
                      </div>
                    </td>
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
