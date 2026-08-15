"use client";
// ============================================================================
// 🏢 מודיעין משרדים — Office Intelligence command center (RTL, premium).
// Not a database table: a competitive-intelligence surface. Real evidence only —
// LOADING / PARTIAL / READY states so a new office never sees a blank screen.
// (P9.1E STEP 4/5/13/14/20/21). Numbers are OBSERVED, never market share.
// ============================================================================
import { useMemo, useState } from "react";
import Link from "next/link";
import type { OfficesIndex } from "@/lib/brokerage-data/office-profile";

const fmt = (n: number) => n.toLocaleString("he-IL");

export function OfficesIndexView({ index, city }: { index: OfficesIndex; city: string | null }) {
  const [q, setQ] = useState("");
  const [cityF, setCityF] = useState("");
  const [brand, setBrand] = useState("");

  const cityLabel = (city ?? "").trim() || "האזור שלך";
  const hasData = index.totals.offices > 0;
  const officesWithActivity = index.offices.filter((o) => o.listingCount > 0).length;

  // Real headline metrics only — a metric is shown ONLY when it has evidence (>0).
  const metrics = [
    { key: "offices", label: "משרדים שזוהו", value: index.totals.offices },
    { key: "brokers", label: "מתווכים ששויכו", value: index.totals.agents },
    { key: "listings", label: "מודעות שנצפו", value: index.totals.listings },
    { key: "active", label: "משרדים עם פעילות", value: officesWithActivity },
  ].filter((m) => m.value > 0);

  const filtered = useMemo(() => {
    const needle = q.trim();
    return index.offices.filter((o) =>
      (!cityF || o.city === cityF) && (!brand || o.brandNetwork === brand) &&
      (!needle || o.name.includes(needle) || (o.brandNetwork ?? "").includes(needle) || (o.city ?? "").includes(needle)));
  }, [index.offices, q, cityF, brand]);

  return (
    <div dir="rtl" className="mx-auto flex max-w-none flex-col gap-5 p-4 sm:p-6">
      <Link href="/brokerage-data" className="text-muted hover:text-ink w-fit text-[12px] font-bold">← דאטה משרדי תיווך</Link>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative isolate overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 px-6 py-8 text-white sm:px-9 sm:py-10">
        <div className="absolute -top-24 -left-16 -z-10 h-72 w-72 rounded-full bg-indigo-500/25 blur-3xl" />
        <div className="absolute inset-0 -z-10 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(#fff 1px, transparent 1.6px)", backgroundSize: "22px 22px" }} />
        <div className="mb-2 text-[12px] font-bold tracking-wide text-indigo-300">ZONO · מודיעין עסקי</div>
        <h1 className="text-3xl font-black leading-tight sm:text-4xl">מודיעין המשרדים ב{cityLabel}</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-slate-300">
          ZONO ממפה עבורך את המשרדים, המתווכים והפעילות התחרותית באזור שלך — על בסיס נתונים שנצפו בלבד.
        </p>

        {metrics.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            {metrics.map((m) => (
              <div key={m.key} className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 backdrop-blur-md">
                <div className="text-2xl font-black tabular-nums sm:text-3xl">{fmt(m.value)}</div>
                <div className="mt-0.5 text-[12px] font-semibold text-slate-300">{m.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {!hasData ? (
        <LoadingState cityLabel={cityLabel} />
      ) : (
        <>
          {/* Honest partial note — evidence-based intelligence keeps updating. */}
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] font-semibold text-amber-800">
            <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-400/20">◐</span>
            המפה מתעדכנת אוטומטית — משרדים ומתווכים נוספים מזוהים בכל סריקה.
          </div>

          {/* Filters */}
          <div className="border-line bg-card flex flex-wrap items-center gap-2 rounded-2xl border p-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי שם / מותג / עיר"
              className="border-line bg-surface text-ink min-w-[220px] flex-1 rounded-full border px-3 py-1.5 text-sm" />
            <select value={cityF} onChange={(e) => setCityF(e.target.value)} className="border-line bg-surface text-ink rounded-full border px-3 py-1.5 text-xs font-bold">
              <option value="">כל הערים</option>{index.cities.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className="border-line bg-surface text-ink rounded-full border px-3 py-1.5 text-xs font-bold">
              <option value="">כל המותגים</option>{index.brands.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="border-line bg-surface text-muted rounded-2xl border p-8 text-center text-sm">לא נמצאו משרדים בסינון הנוכחי.</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((o) => <OfficeCard key={o.id} o={o} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Premium office card ──────────────────────────────────────────────────────
function OfficeCard({ o }: { o: OfficesIndex["offices"][number] }) {
  const conf = Math.round(o.confidenceScore);
  const verified = conf >= 90 ? { label: "מאומת", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" }
    : conf >= 70 ? { label: "ודאות גבוהה", cls: "bg-indigo-50 text-indigo-700 ring-indigo-200" }
    : conf >= 50 ? { label: "זהות חלקית", cls: "bg-amber-50 text-amber-700 ring-amber-200" }
    : { label: "משרד טרם אומת", cls: "bg-slate-100 text-slate-600 ring-slate-200" };
  const initial = (o.name ?? "?").trim().slice(0, 1);
  return (
    <Link href={`/brokerage-data/office/${o.id}`}
      className="group border-line bg-card hover:border-brand/50 flex flex-col gap-3 rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-24px_rgba(15,23,42,0.35)]">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-slate-800 to-indigo-900 text-lg font-black text-white">{initial}</div>
        <div className="min-w-0 flex-1">
          <h2 className="text-ink truncate text-[16px] font-black">{o.name}</h2>
          <p className="text-muted truncate text-[12px]">{[o.brandNetwork, o.city].filter(Boolean).join(" · ") || "—"}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${verified.cls}`}>{verified.label}</span>
      </div>
      <div className="flex flex-wrap gap-2 text-[11.5px]">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700">{fmt(o.agentCount)} מתווכים</span>
        <span className="bg-surface text-muted rounded-full px-2.5 py-1 font-bold">{fmt(o.listingCount)} מודעות שנצפו</span>
        <span className="text-muted rounded-full px-2.5 py-1 font-bold tabular-nums">ודאות {conf}%</span>
      </div>
      <span className="text-brand-strong mt-auto text-[13px] font-bold opacity-0 transition group-hover:opacity-100">פתח מודיעין מלא ←</span>
    </Link>
  );
}

// ── LOADING state — never a blank page (P9.1E STEP 13/14). ────────────────────
function LoadingState({ cityLabel }: { cityLabel: string }) {
  const steps = [
    "סורקים את מודעות הנדל״ן ב" + cityLabel,
    "מזהים משרדים ומתווכים",
    "מקשרים מתווכים למשרדים",
    "בונים עבורך תמונת תחרות",
  ];
  return (
    <section className="border-line bg-card flex flex-col gap-5 rounded-3xl border p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="relative grid h-11 w-11 place-items-center rounded-full bg-indigo-50 text-indigo-600">
          <span className="absolute inset-0 animate-ping rounded-full bg-indigo-400/30" />
          <span className="relative text-lg">◈</span>
        </span>
        <div>
          <h2 className="text-ink text-[17px] font-black">אנחנו בונים את מפת התחרות שלך</h2>
          <p className="text-muted text-[13px]">ZONO ממפה עכשיו את שוק הנדל״ן ב{cityLabel}. התוצאות יופיעו כאן אוטומטית — אין צורך בכל פעולה.</p>
        </div>
      </div>
      <ol className="flex flex-col gap-2.5">
        {steps.map((s, i) => (
          <li key={i} className="flex items-center gap-3 text-[13.5px]">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-50 text-[11px] font-black text-indigo-600">{i + 1}</span>
            <span className="text-ink font-semibold">{s}</span>
          </li>
        ))}
      </ol>
      {/* Skeleton office cards — signals "building", not empty. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-line bg-surface animate-pulse rounded-2xl border p-5">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl bg-slate-200" />
              <div className="flex-1 space-y-2"><div className="h-3 w-2/3 rounded bg-slate-200" /><div className="h-2.5 w-1/2 rounded bg-slate-200" /></div>
            </div>
            <div className="mt-4 flex gap-2"><div className="h-5 w-20 rounded-full bg-slate-200" /><div className="h-5 w-24 rounded-full bg-slate-200" /></div>
          </div>
        ))}
      </div>
      <p className="text-muted text-[11.5px]">התצוגה מבוססת נתונים שנצפו בלבד. מודעה שנצפתה אינה מכירה, ומספר מודעות אינו נתח שוק.</p>
    </section>
  );
}
