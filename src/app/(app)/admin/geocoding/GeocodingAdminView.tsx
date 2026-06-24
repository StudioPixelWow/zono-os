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
import { geocodeMissingAction, type GeocodeEntity, type GeocodeRunResult } from "@/lib/maps/geocoding-actions";
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
