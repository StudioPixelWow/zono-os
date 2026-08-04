"use client";
import { useState, useTransition } from "react";
import { bulkGenerateAction } from "../actions";
import type { LabSession, BulkResult } from "../shared";

interface World { session: LabSession; orgName: string | null; properties: { id: string; title: string; city: string; price: number; valid: boolean }[] }

export function BulkView({ world }: { world: World }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(world.properties.filter((p) => p.valid).map((p) => p.id)));
  const [kind, setKind] = useState("property_ad_post");
  const [result, setResult] = useState<BulkResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const signedIn = Boolean(world.session.orgId && world.session.active);

  function toggle(id: string) {
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function runBulk() {
    setErr(null);
    start(async () => {
      const r = await bulkGenerateAction({ propertyIds: [...selected], kind, concurrency: 4 });
      if (r.ok) setResult(r); else setErr(r.error ?? "bulk failed");
    });
  }

  return (
    <main className="flex flex-col gap-4" data-testid="bulk">
      <section className="rounded-2xl border border-line bg-card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-ink text-sm font-black">מחולל נכסים בכמות</h2>
          <span className="text-[11px] text-muted">{world.orgName ?? "לא מחובר"}</span>
        </div>
        {!signedIn ? (
          <p data-testid="bulk-signin-hint" className="rounded-xl bg-surface px-3 py-6 text-center text-sm text-muted">התחבר כמשתמש בדיקה כדי להריץ ייצור בכמות.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col gap-1" data-testid="property-list">
              {world.properties.map((p) => (
                <li key={p.id} data-testid={`prop-${p.id}`} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs">
                  <input type="checkbox" data-testid={`select-${p.id}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  <span className="font-bold">{p.title || "(ללא כותרת)"}</span>
                  <span className="text-muted">{p.city || "—"}</span>
                  {!p.valid && <span data-testid={`invalid-${p.id}`} className="rounded bg-red-100 px-2 py-0.5 font-bold text-red-700">חסר מידע</span>}
                  <span className="mr-auto text-muted">{p.price ? `₪${p.price.toLocaleString("he-IL")}` : "—"}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-center gap-2">
              <select data-testid="bulk-kind" value={kind} onChange={(e) => setKind(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1 text-xs">
                <option value="property_ad_post">מודעת נכס</option>
                <option value="sold_post">נמכר</option>
                <option value="market_stat">נתון שוק</option>
              </select>
              <button type="button" data-testid="run-bulk" disabled={pending || selected.size === 0} onClick={runBulk}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-black text-white disabled:opacity-50">
                {pending ? "מייצר…" : `ייצר ${selected.size} נכסים`}
              </button>
              {result && (
                <button type="button" data-testid="rerun-bulk" disabled={pending} onClick={runBulk}
                  className="rounded-xl border border-line px-4 py-2 text-sm font-bold text-ink disabled:opacity-50">הרץ שוב (המשך/דילוג כפילויות)</button>
              )}
            </div>
          </div>
        )}
        {err && <p data-testid="bulk-err" className="mt-2 text-xs font-bold text-red-600">{err}</p>}
      </section>

      {result && (
        <section className="rounded-2xl border border-line bg-card p-4" data-testid="bulk-result">
          <p className="mb-2 text-xs font-black text-ink">
            סה&quot;כ <span data-testid="bulk-total">{result.total}</span> · הצליחו <span data-testid="bulk-succeeded" className="text-emerald-600">{result.succeeded}</span> · נכשלו <span data-testid="bulk-failed" className="text-red-600">{result.failed}</span>
          </p>
          <ul className="flex flex-col gap-1">
            {result.rows.map((r) => (
              <li key={r.propertyId} data-testid={`row-${r.propertyId}`} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs">
                <span className="font-mono text-[11px]">{r.propertyId}</span>
                {r.ok ? (
                  <span className="rounded bg-emerald-100 px-2 py-0.5 font-bold text-emerald-700" data-testid={`row-ok-${r.propertyId}`}>
                    {r.deduped ? "קיים (דילוג)" : "נוצר"} · {r.outputId}
                  </span>
                ) : (
                  <span className="rounded bg-red-100 px-2 py-0.5 font-bold text-red-700" data-testid={`row-fail-${r.propertyId}`}>{r.error}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
