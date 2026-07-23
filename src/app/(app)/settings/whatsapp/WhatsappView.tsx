"use client";
// ============================================================================
// 💬 Message Center — WhatsApp Business (client). Batch 6.6, Part 7.
// Connected business/phone, connection status + health, last webhook/message,
// scopes, reconnect/disconnect, select phone number (when pending), send test.
// Connect/reconnect navigate to the server OAuth route; mutations call server
// actions that re-check manager role. No tokens here.
// ============================================================================
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectPhoneNumberAction, sendTestMessageAction } from "@/lib/whatsapp/business/actions";
import type { WhatsappOverview } from "@/lib/whatsapp/business/account";
import type { WaHealth } from "@/lib/whatsapp/business/types";

const HEALTH_HE: Record<WaHealth, { label: string; tone: string }> = {
  healthy: { label: "תקין", tone: "text-emerald-600" },
  syncing: { label: "מסנכרן", tone: "text-brand" },
  pending_number: { label: "ממתין לחיבור מספר", tone: "text-amber-600" },
  needs_reconnect: { label: "נדרש חיבור מחדש", tone: "text-amber-600" },
  permission_missing: { label: "חסרות הרשאות", tone: "text-amber-600" },
  not_connected: { label: "לא מחובר", tone: "text-muted" },
};

const dt = (v: string | null) => (v ? new Date(v).toLocaleString("he-IL") : "—");

export function WhatsappView({ overview, notice }: { overview: WhatsappOverview; notice: string | null }) {
  const router = useRouter();
  const { connection: c, config, phoneNumbers, templates } = overview;
  const [msg, setMsg] = useState<string | null>(null);
  const [to, setTo] = useState("");
  const [text, setText] = useState("הודעת בדיקה מ-ZONO ✅");
  const [pending, start] = useTransition();
  const health = HEALTH_HE[c.health];

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => { const r = await fn(); setMsg(r.ok ? ok : (r.error ?? "שגיאה")); router.refresh(); });
  const connect = () => { window.location.href = "/api/whatsapp/oauth"; };
  const disconnect = () => start(async () => { const r = await fetch("/api/whatsapp/disconnect", { method: "POST" }); setMsg(r.ok ? "החיבור נותק." : "ניתוק נכשל."); router.refresh(); });

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-ink text-xl font-black">WhatsApp Business</h1>
        <p className="text-muted text-[12px]">חיבור חשבון WhatsApp Business (WABA) — שליחה, קבלה, תבניות ומדיה — במרכז התקשורת.</p>
      </header>

      {notice === "connected" ? <p className="text-emerald-600 text-[12px] font-bold">חשבון WhatsApp Business חובר בהצלחה.</p> : null}
      {notice?.startsWith("error:") ? <p className="text-amber-600 text-[12px] font-bold">החיבור לא הושלם ({notice.slice(6)}).</p> : null}
      {msg ? <p className="text-brand text-[12px] font-bold">{msg}</p> : null}

      <section className="bg-card border-line flex flex-col gap-4 rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <span className="text-lg">💬</span>
              <h3 className="text-ink text-sm font-black">WhatsApp Business Platform</h3>
              <span className={`text-[11px] font-black ${health.tone}`}>· {health.label}</span>
            </div>
            <p className="text-muted text-[11px]">Cloud API · תבניות · מדיה · כפתורים אינטראקטיביים</p>
          </div>
          <div className="flex gap-2">
            {c.connected || c.status === "pending_number" ? (
              <>
                <button type="button" onClick={connect} disabled={pending} className="border-line rounded-full border px-3 py-1.5 text-[12px] font-bold">חיבור מחדש</button>
                <button type="button" onClick={disconnect} disabled={pending} className="text-muted rounded-full border border-[var(--line)] px-3 py-1.5 text-[12px] font-bold">ניתוק</button>
              </>
            ) : (
              <button type="button" onClick={connect} disabled={!config.ready} className="bg-brand rounded-full px-4 py-1.5 text-[12px] font-black text-white disabled:opacity-50">
                {c.health === "needs_reconnect" ? "חיבור מחדש" : "חיבור WhatsApp"}
              </button>
            )}
          </div>
        </div>

        {!config.ready ? (
          <p className="text-amber-600 text-[11px]">{config.configured ? "החיבור מוגדר אך אינו מופעל (WHATSAPP_OAUTH_ENABLED)." : `נדרשת הגדרת סביבה: ${config.missing.join(", ")}.`}</p>
        ) : null}

        {c.connected || c.status === "pending_number" ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="עסק (Business)" value={c.businessId ?? "—"} />
            <Field label="WABA" value={c.wabaId ?? "—"} />
            <Field label="מספר טלפון עסקי" value={c.displayPhoneNumber ?? (c.status === "pending_number" ? "טרם חובר" : "—")} />
            <Field label="שם מאומת" value={c.verifiedName ?? "—"} />
            <Field label="Webhook אחרון" value={dt(c.lastWebhookAt)} />
            <Field label="הודעה אחרונה" value={dt(c.lastMessageAt)} />
          </div>
        ) : (
          <p className="text-muted text-[12px]">לא מחובר. חיבור WhatsApp Business מאפשר שליחה וקבלה של הודעות, תבניות ומדיה ישירות במרכז התקשורת.</p>
        )}

        {c.status === "pending_number" && phoneNumbers.length > 0 ? (
          <div className="flex flex-col gap-1">
            <span className="text-amber-600 text-[11px] font-bold">בחר/י מספר טלפון עסקי להפעלה:</span>
            <div className="flex flex-wrap gap-2">
              {phoneNumbers.map((p) => (
                <button key={p.id} type="button" disabled={pending} onClick={() => run(() => selectPhoneNumberAction(p.id), "המספר הופעל.")} className="border-line rounded-full border px-3 py-1.5 text-[12px] font-bold">
                  {p.displayPhoneNumber ?? p.id}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {c.connected ? (
        <section className="bg-card border-line flex flex-col gap-3 rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
          <h3 className="text-ink text-sm font-black">שליחת הודעת בדיקה</h3>
          <div className="flex flex-wrap gap-2">
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="מספר יעד (05...)" className="border-line rounded-full border px-3 py-1.5 text-[12px]" />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="טקסט" className="border-line grow rounded-full border px-3 py-1.5 text-[12px]" />
            <button type="button" disabled={pending} onClick={() => run(() => sendTestMessageAction(to, text), "נשלח.")} className="bg-brand rounded-full px-4 py-1.5 text-[12px] font-black text-white">שליחה</button>
          </div>
          <p className="text-muted text-[10px]">הערה: מחוץ לחלון 24 השעות נדרש שליחה עם תבנית מאושרת.</p>
        </section>
      ) : null}

      {templates.length > 0 ? (
        <section className="bg-card border-line flex flex-col gap-3 rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
          <h3 className="text-ink text-sm font-black">תבניות ({templates.length})</h3>
          <ul className="flex flex-col gap-1.5">
            {templates.slice(0, 20).map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-[10px] border border-[var(--line)] px-3 py-2 text-[12px]">
                <span className="text-ink font-bold">{t.name} <span className="text-muted font-normal">· {t.language} · {t.variableCount} משתנים</span></span>
                <span className={t.status === "APPROVED" ? "text-emerald-600" : "text-amber-600"}>{t.status}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
