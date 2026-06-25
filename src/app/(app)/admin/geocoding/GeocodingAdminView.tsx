"use client";
// ============================================================================
// ZONO — Admin "Geocode missing locations" tool (Phase 24).
// Runs real geocoding for rows that lack coordinates and logs honest stats
// (success / failed / skipped / low-confidence). No fake coordinates.
// ============================================================================
import { useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { geocodeMissingAction, checkGeocodeKeyAction, type GeocodeEntity, type GeocodeRunResult, type GeocodeKeyCheck } from "@/lib/maps/geocoding-actions";
import type { GeoCoverageRow } from "@/lib/maps/geo-coverage";

const ENTITIES: { key: GeocodeEntity; label: string; hint: string }[] = [
  { key: "properties", label: "נכסים", hint: "נכסים עם כתובת וללא קואורדינטות" },
  { key: "external_listings", label: "מודעות חיצוניות", hint: "מודעות שיובאו עם כתובת בלבד" },
  { key: "property_transactions", label: "עסקאות", hint: "עסקאות עם כתובת וללא קואורדינטות" },
  { key: "neighborhoods", label: "מרכזי שכונות", hint: "השלמת מרכז (centroid) לשכונות ללא קואורדינטות" },
];

export function GeocodingAdminView({ coverage = [] }: { coverage?: GeoCoverageRow[] }) {
  const runner = useActionRunner();
  const [results, setResults] = useState<Record<string, GeocodeRunResult>>({});
  const [keyCheck, setKeyCheck] = useState<GeocodeKeyCheck | null>(null);

  const checkKey = () => runner.run(async () => {
    const r = await checkGeocodeKeyAction();
    setKeyCheck(r);
    return { ok: r.ok, message: r.ok ? "המפתח עובד ✓" : "המפתח לא עובד — ראה פירוט" };
  }, { id: "geo-key-check", pendingMessage: "בודק מפתח…", success: (r) => r.message });

  const run = (entity: GeocodeEntity, mode: "missing" | "failed" = "missing") => runner.run(async () => {
    const r = await geocodeMissingAction(entity, 50, mode);
    setResults((m) => ({ ...m, [entity]: r }));
    return { ok: r.ok, message: r.message };
  }, { id: `geo-${entity}-${mode}`, pendingMessage: mode === "failed" ? "מנסה שוב כשלים…" : "מריץ גאוקודינג…", success: (r) => r.message ?? null });

  return (
    <main dir="rtl" className="mx-auto w-full max-w-4xl px-4 py-8">
      <header className="mb-6 flex items-center gap-3">
        <span className="zono-gradient-glow grid h-11 w-11 place-items-center rounded-2xl text-white"><Icon name="MapPin" size={22} /></span>
        <div>
          <h1 className="text-ink text-2xl font-black">מרכז מודיעין גאוגרפי</h1>
          <p className="text-muted text-sm">כיסוי קואורדינטות אמיתי לכל ישות, והשלמת מיקומים חסרים. ZONO לעולם לא ממציא מיקום.</p>
        </div>
      </header>

      {/* Key health check — surfaces which key the SERVER uses + a live test. */}
      <div className="border-line bg-card mb-6 rounded-2xl border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-ink text-sm font-black">בדיקת מפתח גיאוקודינג</p>
            <p className="text-muted text-xs">בודק איזה מפתח השרת באמת משתמש בו + קריאה חיה לגוגל. לא חושף את המפתח.</p>
          </div>
          <Button size="sm" onClick={checkKey} loading={runner.busyId === "geo-key-check"}>
            <Icon name="ShieldCheck" size={14} className="ms-1" /> בדוק מפתח
          </Button>
        </div>
        {keyCheck && (
          <div className={`mt-3 rounded-xl border p-3 text-xs ${keyCheck.ok ? "border-emerald-300/40 bg-emerald-500/10" : "border-rose-300/40 bg-rose-500/10"}`}>
            <p className={`font-black ${keyCheck.ok ? "text-success" : "text-danger"}`}>{keyCheck.ok ? "✓ המפתח עובד" : "✗ המפתח לא עובד"}</p>
            <p className="text-ink mt-1.5">משתנה בשימוש: <b dir="ltr">{keyCheck.key.source === "geocode" ? "GOOGLE_MAPS_GEOCODE_API_KEY" : keyCheck.key.source === "public" ? "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (fallback!)" : "אין מפתח"}</b></p>
            {keyCheck.key.present && (
              <p className="text-muted mt-0.5" dir="ltr">
                key: {keyCheck.key.prefix}…{keyCheck.key.suffix} · length {keyCheck.key.length}
                {!keyCheck.key.startsWithAIza && " · ⚠ doesn't start with AIza"}
                {keyCheck.key.hadWhitespace && " · ⚠ whitespace detected"}
              </p>
            )}
            <p className="text-ink mt-1.5">תגובת גוגל: <b dir="ltr">{keyCheck.liveStatus}</b></p>
            <p className="text-muted mt-1.5">{keyCheck.message}</p>
            <p className="text-muted mt-2 text-[11px]">השווה את ה‑prefix/suffix/length למפתח &quot;ZONO Server Geocoder&quot; שעבד בדפדפן. אם שונה → הערך ב‑Vercel לא נכון. אם זהה אך עדיין נכשל → לא נעשה Redeploy.</p>
          </div>
        )}
      </div>

      {/* Coverage % per entity — real counts (located vs total). */}
      {coverage.length > 0 && (
        <div className="mb-6">
          <p className="text-ink mb-2 text-sm font-black">כיסוי גאוגרפי</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {coverage.map((c) => (
              <div key={c.key} className="border-line bg-card rounded-2xl border p-3 shadow-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ink truncate text-xs font-bold">{c.label}</span>
                  <span className={`text-sm font-black ${c.pct >= 80 ? "text-success" : c.pct >= 40 ? "text-warning" : "text-danger"}`}>{c.pct}%</span>
                </div>
                <div className="bg-surface mt-2 h-1.5 w-full overflow-hidden rounded-full">
                  <div className="bg-brand h-1.5 rounded-full" style={{ width: `${c.pct}%` }} />
                </div>
                <p className="text-muted mt-1.5 text-[11px]">{c.located}/{c.total} ממוקמים{c.missing ? ` · ${c.missing} חסרים` : ""}{c.lowConfidence ? ` · ${c.lowConfidence} ביטחון נמוך` : ""}{c.failed ? ` · ${c.failed} נכשלו` : ""}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(runner.note || runner.error) && (
        <div className={`mb-4 rounded-xl border px-4 py-2 text-sm font-semibold ${runner.error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
          {runner.error ?? runner.note}
        </div>
      )}

      <div className="grid gap-4">
        {ENTITIES.map((e) => {
          const r = results[e.key];
          return (
            <div key={e.key} className="border-line bg-card rounded-2xl border p-5 shadow-card">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-ink font-black">{e.label}</p>
                  <p className="text-muted text-xs">{e.hint}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost" onClick={() => run(e.key, "failed")} loading={runner.busyId === `geo-${e.key}-failed`}>
                    נסה שוב כשלים
                  </Button>
                  <Button size="sm" onClick={() => run(e.key, "missing")} loading={runner.busyId === `geo-${e.key}-missing`}>
                    <Icon name="MapPin" size={14} className="ms-1" /> גאוקד חוסרים
                  </Button>
                </div>
              </div>
              {r?.stats && (
                <div className="mt-4 grid grid-cols-4 gap-2 text-center">
                  <div className="bg-surface rounded-xl p-2"><p className="text-muted text-[11px] font-bold">מועמדים</p><p className="text-ink text-lg font-black">{r.candidates}</p></div>
                  <div className="bg-surface rounded-xl p-2"><p className="text-muted text-[11px] font-bold">הצליחו</p><p className="text-success text-lg font-black">{r.stats.success}</p></div>
                  <div className="bg-surface rounded-xl p-2"><p className="text-muted text-[11px] font-bold">נכשלו/דולגו</p><p className="text-ink text-lg font-black">{r.stats.failed + r.stats.skipped}</p></div>
                  <div className="bg-surface rounded-xl p-2"><p className="text-muted text-[11px] font-bold">ביטחון נמוך</p><p className="text-warning text-lg font-black">{r.stats.lowConfidence}</p></div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-muted mt-6 text-xs">דורש מפתח גאוקודינג בשרת (GOOGLE_MAPS_GEOCODE_API_KEY) או את מפתח המפה הציבורי. כל ריצה מטפלת עד 50 רשומות.</p>
    </main>
  );
}
