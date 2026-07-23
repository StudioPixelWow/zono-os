"use client";
// ============================================================================
// 🟦 Integration Center — Google Workspace card (client). Batch 6.5, Part 8.
// Shows connected account, scopes/permissions, last sync, health, and
// reconnect/disconnect. Connect/reconnect navigate to the server OAuth route;
// disconnect POSTs to the server (which revokes at Google). No tokens here.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GoogleConnectionPublic, GoogleHealth } from "@/lib/google/types";

interface SyncHealth { calendarId: string; lastSyncAt: string | null; lastStatus: string | null; hasToken: boolean }
interface Props {
  google: GoogleConnectionPublic;
  config: { configured: boolean; enabled: boolean; ready: boolean; missing: string[] };
  sync: SyncHealth[];
  notice: string | null;
}

const HEALTH_HE: Record<GoogleHealth, { label: string; tone: string }> = {
  healthy: { label: "תקין", tone: "text-emerald-600" },
  syncing: { label: "מסנכרן", tone: "text-brand" },
  needs_reconnect: { label: "נדרש חיבור מחדש", tone: "text-amber-600" },
  permission_missing: { label: "חסרות הרשאות", tone: "text-amber-600" },
  not_connected: { label: "לא מחובר", tone: "text-muted" },
};

const SCOPE_HE: { match: string; label: string }[] = [
  { match: "calendar", label: "יומן Google (קריאה ועריכה)" },
  { match: "gmail.send", label: "שליחת דוא״ל" },
  { match: "gmail.modify", label: "עדכון סטטוס דוא״ל" },
  { match: "gmail", label: "קריאת Gmail" },
  { match: "contacts", label: "אנשי קשר (קריאה בלבד)" },
  { match: "meet", label: "Google Meet" },
  { match: "email", label: "כתובת דוא״ל" },
  { match: "profile", label: "פרופיל בסיסי" },
];

function scopeLabels(scopes: string[]): string[] {
  const out = new Set<string>();
  for (const s of scopes) { const hit = SCOPE_HE.find((x) => s.includes(x.match)); if (hit) out.add(hit.label); }
  return [...out];
}

export function IntegrationsView({ google, config, sync, notice }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const health = HEALTH_HE[google.health];

  const connect = () => { window.location.href = "/api/google/oauth"; };
  const disconnect = () =>
    start(async () => {
      const r = await fetch("/api/google/disconnect", { method: "POST" });
      setMsg(r.ok ? "החיבור נותק." : "ניתוק נכשל.");
      router.refresh();
    });

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-ink text-xl font-black">מרכז החיבורים</h1>
        <p className="text-muted text-[12px]">חיבור חשבונות חיצוניים לפלטפורמה. החיבור הוא אישי — לכל משתמש חשבון Google משלו.</p>
      </header>

      {notice === "connected" ? <p className="text-emerald-600 text-[12px] font-bold">חשבון Google חובר בהצלחה.</p> : null}
      {notice?.startsWith("error:") ? <p className="text-amber-600 text-[12px] font-bold">חיבור Google לא הושלם ({notice.slice(6)}).</p> : null}
      {msg ? <p className="text-brand text-[12px] font-bold">{msg}</p> : null}

      <section className="bg-card border-line flex flex-col gap-4 rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-lg">🟦</span>
              <h3 className="text-ink text-sm font-black">Google Workspace</h3>
              <span className={`text-[11px] font-black ${health.tone}`}>· {health.label}</span>
            </div>
            <p className="text-muted text-[11px]">יומן, Gmail, אנשי קשר ו-Meet — במקום אחד.</p>
          </div>
          <div className="flex gap-2">
            {google.connected ? (
              <>
                <button type="button" onClick={connect} disabled={pending} className="border-line rounded-full border px-3 py-1.5 text-[12px] font-bold">חיבור מחדש</button>
                <button type="button" onClick={disconnect} disabled={pending} className="text-muted rounded-full border border-[var(--line)] px-3 py-1.5 text-[12px] font-bold">ניתוק</button>
              </>
            ) : (
              <button type="button" onClick={connect} disabled={!config.ready} className="bg-brand rounded-full px-4 py-1.5 text-[12px] font-black text-white disabled:opacity-50">
                {google.health === "needs_reconnect" ? "חיבור מחדש" : "חיבור Google"}
              </button>
            )}
          </div>
        </div>

        {!config.ready ? (
          <p className="text-amber-600 text-[11px]">
            {config.configured ? "החיבור מוגדר אך אינו מופעל עדיין (GOOGLE_OAUTH_ENABLED)." : `נדרשת הגדרת סביבה: ${config.missing.join(", ")}.`}
          </p>
        ) : null}

        {google.connected ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="חשבון מחובר" value={google.email ?? google.displayName ?? "—"} />
            <Field label="סנכרון אחרון" value={google.lastSyncAt ? new Date(google.lastSyncAt).toLocaleString("he-IL") : "—"} />
            <div className="sm:col-span-2 flex flex-col gap-1">
              <span className="text-muted text-[10px] font-bold">הרשאות שניתנו</span>
              <div className="flex flex-wrap gap-1.5">
                {scopeLabels(google.scopes).map((s) => (
                  <span key={s} className="border-line rounded-full border px-2 py-0.5 text-[11px] font-bold">{s}</span>
                ))}
                {google.scopes.length === 0 ? <span className="text-muted text-[11px]">—</span> : null}
              </div>
            </div>
            {sync.length > 0 ? (
              <div className="sm:col-span-2 flex flex-col gap-1">
                <span className="text-muted text-[10px] font-bold">בריאות סנכרון יומנים</span>
                <ul className="flex flex-col gap-1">
                  {sync.map((s) => (
                    <li key={s.calendarId} className="flex items-center justify-between rounded-[8px] border border-[var(--line)] px-2 py-1 text-[11px]">
                      <span className="text-ink font-bold">{s.calendarId}</span>
                      <span className="text-muted">{s.lastStatus ?? "—"}{s.hasToken ? " · מצטבר" : ""} · {s.lastSyncAt ? new Date(s.lastSyncAt).toLocaleDateString("he-IL") : "—"}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-muted text-[12px]">לא מחובר. חיבור Google מאפשר סנכרון יומן דו-כיווני, קריאה ושליחה ב-Gmail, ויבוא אנשי קשר (בכפוף לאישור מפורש).</p>
        )}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-[10px] border border-[var(--line)] px-3 py-2">
      <span className="text-ink text-[13px] font-black break-all">{value}</span>
      <span className="text-muted text-[10px] font-bold">{label}</span>
    </div>
  );
}
