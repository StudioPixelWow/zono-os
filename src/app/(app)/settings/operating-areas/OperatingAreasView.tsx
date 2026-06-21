"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { searchLocalities, type LocalityOption } from "@/lib/localities/search";
import {
  addOperatingAreaAction, disableOperatingAreaAction, enableOperatingAreaAction,
  setPrimaryOperatingAreaAction, syncOperatingAreaAction, updateOperatingAreaAction,
} from "@/lib/operating-areas/actions";
import type { OperatingArea } from "@/lib/operating-areas/service";

const TOGGLES: { key: "useForLeads" | "useForProperties" | "useForTransactions" | "useForExternalListings" | "useForRecommendations"; field: "useForLeads" | "useForProperties" | "useForTransactions" | "useForExternalListings" | "useForRecommendations"; label: string }[] = [
  { key: "useForLeads", field: "useForLeads", label: "לידים" },
  { key: "useForProperties", field: "useForProperties", label: "נכסים" },
  { key: "useForTransactions", field: "useForTransactions", label: "עסקאות" },
  { key: "useForExternalListings", field: "useForExternalListings", label: "נכסים חיצוניים" },
  { key: "useForRecommendations", field: "useForRecommendations", label: "המלצות" },
];

const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

export function OperatingAreasView({ areas, canManageOthers }: { areas: OperatingArea[]; canManageOthers: boolean }) {
  const runner = useActionRunner();
  const { pending, busyId } = runner;

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Settings · Operating Areas</p>
          <h1 className="text-ink mt-1 text-2xl font-black">אזורי פעילות</h1>
          <p className="text-muted mt-1 text-sm">נהל את ערי וה­שכונות שבהן אתה פעיל. הוסף עיר חדשה בכל שלב — הנתונים הקיימים נשמרים. כל עיר יכולה להזין לידים, נכסים, עסקאות, נכסים חיצוניים והמלצות בנפרד.</p>
        </div>
        <Link href="/" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />דשבורד</Link>
      </div>

      <AddCity runner={runner} />
      <ActionFeedback runner={runner} />

      {areas.length === 0 ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-14 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="MapPin" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">לא הוגדרו אזורי פעילות</p>
          <p className="text-muted max-w-sm text-sm">הוסף עיר כדי למשוך עסקאות, נכסים והמלצות עבורה.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-ink text-sm font-extrabold">הערים הפעילות שלי ({areas.length})</p>
          {areas.map((a) => (
            <AreaCard key={a.id} area={a} runner={runner} pending={pending} busyId={busyId} />
          ))}
        </div>
      )}

      {canManageOthers && (
        <p className="text-muted bg-surface rounded-xl px-3 py-2 text-[12px]">ניהול: כמנהל/ת אפשר לערוך גם אזורי פעילות של סוכנים בארגון (דרך כרטיס הסוכן).</p>
      )}
    </div>
  );
}

function AddCity({ runner }: { runner: ReturnType<typeof useActionRunner> }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<LocalityOption[]>([]);
  const [open, setOpen] = useState(false);
  const tid = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChange = (value: string) => {
    setQ(value);
    if (tid.current) clearTimeout(tid.current);
    const term = value.trim();
    if (!term) { setResults([]); setOpen(false); return; }
    tid.current = setTimeout(async () => {
      try { const r = await searchLocalities(term, 8); setResults(r); setOpen(true); } catch { setResults([]); }
    }, 250);
  };

  const add = (loc: LocalityOption) => {
    setQ(""); setResults([]); setOpen(false);
    runner.run(() => addOperatingAreaAction(loc.id), {
      id: "add", pendingMessage: `מוסיף את ${loc.name_he} ומגלה שכונות…`,
      success: (r) => `נוספה עיר: ${r.cityName}. לחץ ״הרץ סנכרון״ בכרטיס כדי למשוך עסקאות.`,
    });
  };

  return (
    <div className="bg-card border-line rounded-[20px] border p-4">
      <p className="text-ink mb-2 text-sm font-extrabold">הוסף עיר</p>
      <div className="relative">
        <input
          value={q}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          placeholder="חפש עיר (למשל: חיפה)…"
          className="border-line w-full rounded-xl border px-3 py-2 text-sm"
        />
        {open && results.length > 0 && (
          <div className="bg-card border-line absolute z-10 mt-1 w-full overflow-hidden rounded-xl border shadow-[var(--shadow-soft)]">
            {results.map((loc) => (
              <button key={loc.id} disabled={runner.pending} onClick={() => add(loc)}
                className="hover:bg-brand-soft flex w-full items-center justify-between px-3 py-2 text-right text-sm disabled:opacity-50">
                <span className="text-ink font-semibold">{loc.name_he}</span>
                <span className="text-muted text-[11px]">{loc.subdistrict ?? ""}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="text-muted mt-2 text-[11px]">ברירת מחדל: העיר פעילה ומשמשת לכל סוגי המודיעין. שכונות מתגלות אוטומטית (OSM + AI).</p>
    </div>
  );
}

function AreaCard({ area, runner, pending, busyId }: { area: OperatingArea; runner: ReturnType<typeof useActionRunner>; pending: boolean; busyId: string | null }) {
  const [editHoods, setEditHoods] = useState(false);
  const [hoodText, setHoodText] = useState(area.neighborhoods.join("\n"));

  const toggle = (field: typeof TOGGLES[number]["field"], value: boolean) =>
    runner.run(() => updateOperatingAreaAction(area.id, { [field]: value }), { id: `${area.id}:${field}`, refresh: true });

  const setPrimary = () => runner.run(() => setPrimaryOperatingAreaAction(area.id), {
    id: `${area.id}:primary`, pendingMessage: `מגדיר את ${area.cityName} כעיר ראשית…`, successMessage: `${area.cityName} הוגדרה כעיר הראשית.`,
  });
  const toggleActive = () => runner.run(() => (area.isActive ? disableOperatingAreaAction(area.id) : enableOperatingAreaAction(area.id)), {
    id: `${area.id}:active`, successMessage: area.isActive ? `${area.cityName} כובתה (הנתונים נשמרו).` : `${area.cityName} הופעלה.`,
  });
  const sync = () => runner.run(() => syncOperatingAreaAction(area.id), {
    id: `${area.id}:sync`, pendingMessage: `מסנכרן את ${area.cityName} (שכונות + כיסוי עסקאות)…`,
    success: (r) => `${area.cityName}: ${r.note}`,
  });
  const saveHoods = () => {
    const list = hoodText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    runner.run(() => updateOperatingAreaAction(area.id, { neighborhoods: list }), {
      id: `${area.id}:hoods`, successMessage: `נשמרו ${list.length} שכונות עבור ${area.cityName}.`,
    });
    setEditHoods(false);
  };

  return (
    <div className={cn("bg-card border-line rounded-[18px] border p-4", !area.isActive && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-ink text-base font-extrabold">{area.cityName}</p>
            {area.isPrimary && <span className="bg-brand text-[10px] font-black text-white rounded-md px-1.5 py-0.5">ראשית</span>}
            <span className={cn("text-[10px] font-black rounded-md px-1.5 py-0.5", area.isActive ? "bg-success-soft text-success" : "bg-surface text-muted")}>{area.isActive ? "פעילה" : "כבויה"}</span>
          </div>
          <p className="text-muted mt-0.5 text-[11px]">{area.neighborhoodsCount} שכונות · סנכרון אחרון {fmt(area.lastSyncAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!area.isPrimary && area.isActive && <button disabled={pending} onClick={setPrimary} className="text-brand-strong inline-flex items-center gap-1 text-[11px] font-bold disabled:opacity-50">{busyId === `${area.id}:primary` ? "מגדיר…" : "קבע כראשית"}</button>}
          <button disabled={pending} onClick={() => setEditHoods((v) => !v)} className="text-muted text-[11px] font-bold disabled:opacity-50">ערוך שכונות</button>
          <button disabled={pending} onClick={toggleActive} className={cn("text-[11px] font-bold disabled:opacity-50", area.isActive ? "text-danger" : "text-success")}>{area.isActive ? "כבה" : "הפעל"}</button>
          <Button size="sm" variant="secondary" onClick={sync} loading={busyId === `${area.id}:sync`} disabled={pending} leadingIcon={<Icon name="Clock" size={14} />}>הרץ סנכרון</Button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {TOGGLES.map((t) => {
          const on = area[t.key];
          return (
            <button key={t.key} disabled={pending} onClick={() => toggle(t.field, !on)}
              className={cn("rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-50",
                on ? "bg-brand-soft text-brand-strong border-brand/30" : "bg-surface text-muted border-line")}>
              {on ? "✓ " : "○ "}{t.label}
            </button>
          );
        })}
      </div>

      {editHoods && (
        <div className="border-line mt-3 flex flex-col gap-2 rounded-xl border p-3">
          <p className="text-muted text-[11px] font-bold">שכונות (שורה או פסיק בין שכונה לשכונה). שכונות שתוסיף ידנית מסומנות כלא-מאומתות עד שאימות הגאו יאשר אותן.</p>
          <textarea value={hoodText} onChange={(e) => setHoodText(e.target.value)} rows={4} className="border-line rounded-xl border px-3 py-2 text-sm" placeholder="גבעת הרקפות&#10;צבעוני&#10;נווה גנים" />
          <div className="flex gap-2">
            <Button size="sm" onClick={saveHoods} loading={busyId === `${area.id}:hoods`} disabled={pending}>שמור שכונות</Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditHoods(false); setHoodText(area.neighborhoods.join("\n")); }} disabled={pending}>ביטול</Button>
          </div>
        </div>
      )}
    </div>
  );
}
