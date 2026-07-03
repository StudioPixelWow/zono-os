"use client";
// ============================================================================
// 🔌 ZONO — Developer Center (Platform API UI). 31.0. Part 8.
// API keys (create/revoke, secret shown once), Webhook manager, audit log,
// Integration Hub connectors, and OpenAPI/docs link. Value constants imported
// from the pure /types + /connectors submodules only (no server-only leak).
// ============================================================================
import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { createApiKeyAction, listApiKeysAction, revokeApiKeyAction, listAuditAction, registerWebhookAction, listWebhooksAction, deleteWebhookAction, testWebhookAction } from "@/lib/platform-api/actions";
import type { ApiKeyRecord, AuditEntry, WebhookRecord, Scope, WebhookEvent } from "@/lib/platform-api/types";
import { ALL_SCOPES, SCOPE_HE, WEBHOOK_EVENTS, API_BASE } from "@/lib/platform-api/types";
import { CONNECTORS } from "@/lib/platform-api/connectors";

export default function DeveloperCenter() {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [webhooks, setWebhooks] = useState<WebhookRecord[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [migration, setMigration] = useState(false);
  const [created, setCreated] = useState<{ name: string; plaintext: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // New key form.
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["read:buyers", "read:missions", "read:ai"]);
  const [rate, setRate] = useState(120);
  // New webhook form.
  const [hookUrl, setHookUrl] = useState("");
  const [hookEvents, setHookEvents] = useState<WebhookEvent[]>(["mission.created"]);

  const refresh = useCallback(async () => {
    const [k, w, a] = await Promise.all([listApiKeysAction(), listWebhooksAction(), listAuditAction()]);
    if (k.ok) { setKeys(k.result ?? []); if (k.migrationRequired) setMigration(true); }
    if (w.ok) setWebhooks(w.result ?? []);
    if (a.ok) setAudit(a.result ?? []);
  }, []);
  // Initial load — setState happens after awaits (not synchronously in the effect).
  useEffect(() => {
    let alive = true;
    (async () => {
      const [k, w, a] = await Promise.all([listApiKeysAction(), listWebhooksAction(), listAuditAction()]);
      if (!alive) return;
      if (k.ok) { setKeys(k.result ?? []); if (k.migrationRequired) setMigration(true); }
      if (w.ok) setWebhooks(w.result ?? []);
      if (a.ok) setAudit(a.result ?? []);
    })();
    return () => { alive = false; };
  }, []);

  const createKey = async () => {
    setErr(null); setCreated(null);
    const r = await createApiKeyAction(name, "organization", scopes, rate);
    if (r.ok && r.result) { setCreated({ name: r.result.name, plaintext: r.result.plaintext }); setName(""); await refresh(); }
    else { if (r.migrationRequired) setMigration(true); setErr(r.error ?? "נכשל"); }
  };
  const revoke = async (id: string) => { await revokeApiKeyAction(id); await refresh(); };
  const addHook = async () => { setErr(null); const r = await registerWebhookAction(hookUrl, hookEvents); if (r.ok) { setHookUrl(""); await refresh(); } else { if (r.migrationRequired) setMigration(true); setErr(r.error ?? "נכשל"); } };
  const delHook = async (id: string) => { await deleteWebhookAction(id); await refresh(); };
  const testHook = async (id: string) => { const r = await testWebhookAction(id); setErr(r.ok ? `בדיקה נשלחה · סטטוס ${r.status}` : (r.error ?? "נכשל")); await refresh(); };

  const toggle = <T,>(list: T[], v: T, set: (x: T[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <div dir="rtl" className="mx-auto flex max-w-5xl flex-col gap-5 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-black text-ink">🔌 מרכז המפתחים של ZONO</h1>
        <p className="text-muted text-[13px]">גישה מאובטחת ל-ZONO דרך Platform API — קריאה בלבד ופעולות מאושרות (משימות/טיוטות/תהליכים נוצרים כממתינים לאישור). כל קריאה נאכפת ע״י מפתח, הרשאות, הגבלת קצב ויומן ביקורת. אין ביצוע אוטומטי.</p>
        <p className="text-muted mt-1 text-[11px]">בסיס API: <code className="rounded bg-slate-100 px-1">{API_BASE}</code> · תיעוד OpenAPI: <a href="/api/platform/openapi.json" className="font-bold text-sky-700 underline" target="_blank" rel="noreferrer">/api/platform/openapi.json</a> · אימות: <code className="rounded bg-slate-100 px-1">Authorization: Bearer zk_…</code></p>
      </header>
      {migration && <p className="rounded-xl border border-amber-300 bg-amber-50/60 p-3 text-[12px] font-semibold text-amber-800">טבלאות ה-API חסרות — יש להריץ מיגרציית 31.0 (zono_api_keys / zono_api_audit / zono_webhooks).</p>}
      {err && <p className="text-[12px] font-semibold text-rose-700">{err}</p>}

      {created && (
        <div className="rounded-xl border-2 border-emerald-400 bg-emerald-50/60 p-3 text-[12px]">
          <p className="font-bold text-emerald-800">🔑 מפתח ״{created.name}״ נוצר — יוצג פעם אחת בלבד, העתק ושמור:</p>
          <code className="mt-1 block break-all rounded bg-white px-2 py-1 font-mono text-[12px]">{created.plaintext}</code>
        </div>
      )}

      {/* API keys */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-ink mb-2 text-sm font-black">מפתחות API</h2>
        <div className="grid gap-2 sm:grid-cols-[1fr_120px_auto] sm:items-end">
          <label className="flex flex-col gap-1 text-[12px]"><span className="text-muted">שם המפתח</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="למשל: אינטגרציית Zapier" className="rounded-lg border border-line bg-surface px-2 py-1.5" /></label>
          <label className="flex flex-col gap-1 text-[12px]"><span className="text-muted">קצב/דקה</span><input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value))} className="rounded-lg border border-line bg-surface px-2 py-1.5" /></label>
          <button onClick={createKey} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white">צור מפתח</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {ALL_SCOPES.map((sc) => <button key={sc} onClick={() => toggle(scopes, sc, setScopes)} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", scopes.includes(sc) ? "bg-sky-700 text-white" : "border border-sky-300 text-sky-800")}>{SCOPE_HE[sc] ?? sc}</button>)}
        </div>
        <div className="mt-3 flex flex-col gap-1">
          {keys.length === 0 ? <p className="text-muted text-[11px]">אין מפתחות עדיין.</p> : keys.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5 text-[11px]">
              <span><b>{k.name}</b> <code className="rounded bg-slate-100 px-1">{k.prefix}…</code> · {k.scopes.length} הרשאות · {k.rateLimitPerMin}/דק׳{k.revokedAt ? " · מבוטל" : ""}{k.lastUsedAt ? ` · שימוש אחרון ${new Date(k.lastUsedAt).toLocaleDateString("he-IL")}` : ""}</span>
              {!k.revokedAt && <button onClick={() => revoke(k.id)} className="rounded border border-rose-300 px-2 py-0.5 font-bold text-rose-700">בטל</button>}
            </div>
          ))}
        </div>
      </section>

      {/* Webhooks */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-ink mb-2 text-sm font-black">Webhooks</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-[12px]"><span className="text-muted">כתובת (https)</span><input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://example.com/zono-hook" className="rounded-lg border border-line bg-surface px-2 py-1.5" /></label>
          <button onClick={addHook} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-bold text-white">רשום</button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {WEBHOOK_EVENTS.map((ev) => <button key={ev} onClick={() => toggle(hookEvents, ev, setHookEvents)} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", hookEvents.includes(ev) ? "bg-sky-700 text-white" : "border border-sky-300 text-sky-800")}>{ev}</button>)}
        </div>
        <div className="mt-3 flex flex-col gap-1">
          {webhooks.length === 0 ? <p className="text-muted text-[11px]">אין Webhooks.</p> : webhooks.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-1.5 text-[11px]">
              <span className="break-all"><b>{w.url}</b> · {w.events.join(", ")}{w.lastStatus != null ? ` · סטטוס אחרון ${w.lastStatus}` : ""}</span>
              <span className="flex gap-1">
                <button onClick={() => testHook(w.id)} className="rounded border border-sky-300 px-2 py-0.5 font-bold text-sky-700">בדוק</button>
                <button onClick={() => delHook(w.id)} className="rounded border border-rose-300 px-2 py-0.5 font-bold text-rose-700">מחק</button>
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Integration Hub */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-ink mb-2 text-sm font-black">Integration Hub</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {CONNECTORS.map((c) => (
            <div key={c.id} className="rounded-xl border border-line px-3 py-2 text-[11px]">
              <div className="flex items-center justify-between"><span className="text-ink font-bold">{c.name}</span><span className={cn("rounded-full px-2 py-0.5 text-[9px] font-bold", c.status === "available" ? "bg-green-100 text-green-800" : c.status === "beta" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600")}>{c.status === "available" ? "זמין" : c.status === "beta" ? "בטא" : "מתוכנן"}</span></div>
              <p className="text-muted mt-0.5">{c.description}</p>
              <p className="text-muted mt-0.5 text-[10px]">{c.category} · {c.authType} · {c.capabilities.join(", ")}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Audit log */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-ink mb-2 text-sm font-black">יומן ביקורת ({audit.length})</h2>
        {audit.length === 0 ? <p className="text-muted text-[11px]">אין קריאות עדיין.</p> : (
          <div className="flex flex-col gap-0.5 text-[11px]">
            {audit.slice(0, 40).map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-muted">
                <span><span className={cn("font-bold", a.status < 300 ? "text-emerald-700" : a.status < 500 ? "text-amber-700" : "text-rose-700")}>{a.status}</span> {a.method} {a.path}{a.scope ? ` · ${a.scope}` : ""}</span>
                <span className="text-[10px]">{a.keyName ?? "—"} · {new Date(a.at).toLocaleString("he-IL")}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
