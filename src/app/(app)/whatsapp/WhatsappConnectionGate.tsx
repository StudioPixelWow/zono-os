"use client";
// ============================================================================
// 📘 ZONO — WhatsApp connection gate (client). State-driven, honest, premium.
// Renders ONLY when NOT in the full active dashboard state. Never shows an
// empty dashboard with zeros. States:
//   not_configured           → internal setup card (missing server env)
//   configured_not_connected → connect / setup wizard (activate account)
//   webhook_pending          → webhook verification status + next steps
//   connected_empty          → beautiful empty inbox ("ready — waiting")
// Manual/assisted mode is always available (link to ?mode=manual).
// Uses the WhatsApp Business Cloud API — NOT an unofficial QR scanner. Tokens
// are never shown; nothing sends here.
// ============================================================================
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Spinner } from "@/components/ui/Button";
import { connectWhatsappAction } from "@/lib/whatsapp/actions";
import type { WhatsappConnection } from "@/lib/whatsapp/connection";

const WA = "linear-gradient(135deg,#25D366,#128C7E)";

const CAPABILITIES: { icon: string; title: string; body: string }[] = [
  { icon: "Phone", title: "חיבור מספר WhatsApp Business", body: "מספר עסקי רשמי דרך WhatsApp Business Cloud API." },
  { icon: "Shield", title: "Webhook מאובטח", body: "אימות חתימה (App Secret) לכל הודעה נכנסת." },
  { icon: "MessageCircle", title: "הודעות נכנסות", body: "כל שיחה נכנסת מגיעה ישירות ל-Inbox." },
  { icon: "Check", title: "טיוטות תגובה לאישור", body: "AI מכין תשובה — אתה מאשר לפני שליחה." },
  { icon: "FileText", title: "תבניות", body: "תבניות Meta מאושרות לפתיחת שיחה." },
  { icon: "Globe", title: "מדיה", body: "קבלת תמונות, מסמכים והקלטות קוליות." },
  { icon: "Users", title: "שיוך לידים", body: "כל שיחה מקושרת לליד / קונה / מוכר ב-CRM." },
  { icon: "Sparkles", title: "AI Conversation Brain", body: "זיהוי כוונה, דחיפות ותשובה מוצעת." },
];

export function WhatsappConnectionGate({ connection }: { connection: WhatsappConnection }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);

  const activate = () => { setErr(null); start(async () => { const r = await connectWhatsappAction(); if (r.ok) router.refresh(); else setErr(r.error ?? "ההפעלה נכשלה. נסה שוב."); }); };

  const s = connection.state;
  const title =
    s === "not_configured" ? "חבר את WhatsApp Business כדי להתחיל"
    : s === "configured_not_connected" ? "השרת מוכן — נותר להפעיל את החשבון"
    : s === "webhook_pending" ? "ממתין לאימות Webhook מול Meta"
    : "החיבור פעיל — ממתין להודעה הראשונה";

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
      {/* Hero */}
      <section className="bg-card border-line relative overflow-hidden rounded-[28px] border p-6 shadow-[var(--shadow-card)] sm:p-9">
        <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(37,211,102,0.18),transparent_70%)] blur-2xl" />
        <div className="relative flex flex-col items-center gap-5 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-3xl text-white shadow-[0_10px_30px_rgba(18,140,126,0.45)]" style={{ background: WA }}><Icon name="MessageCircle" size={30} /></span>
          <div>
            <h1 className="text-ink text-2xl font-black sm:text-4xl">{title}</h1>
            <p className="text-muted mx-auto mt-2 max-w-xl text-sm leading-relaxed sm:text-base">
              ZONO משתמש ב-WhatsApp Business Cloud API הרשמי — יציב, מאובטח ותואם מדיניות. עד להשלמת החיבור לא מוצג דשבורד ריק.
            </p>
          </div>

          {/* Primary action per state */}
          {s === "not_configured" && (
            <div className="bg-warning-soft/60 border-warning/30 w-full max-w-md rounded-2xl border p-3.5 text-center">
              <p className="text-ink text-[13px] font-black">חיבור WhatsApp עדיין לא הוגדר בסביבת השרת</p>
              <p className="text-muted mt-0.5 text-[12px] leading-relaxed">
                יש להגדיר בשרת: {connection.missingEnv.join(", ")}. עד אז ניתן לעבוד במצב ידני / הדגמה.
              </p>
            </div>
          )}
          {s === "configured_not_connected" && (
            <button onClick={activate} disabled={pending} className="btn-zono-primary zono-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-base font-black text-white shadow-[var(--shadow-lift)] disabled:opacity-60">
              {pending ? <Spinner size={18} /> : <Icon name="Send" size={18} />} הפעל את חשבון ה-WhatsApp
            </button>
          )}
          {s === "webhook_pending" && (
            <div className="bg-brand-soft/50 border-brand/20 w-full max-w-md rounded-2xl border p-3.5 text-center">
              <p className="text-ink text-[13px] font-black">אמת את ה-Webhook בלוח הבקרה של Meta</p>
              <p className="text-muted mt-0.5 text-[12px] leading-relaxed">
                הזן את כתובת ה-Webhook ואת ה-Verify Token, ואז שלח הודעת בדיקה. ברגע שתתקבל הודעה — הסטטוס יתעדכן אוטומטית.
              </p>
            </div>
          )}
          {s === "connected_empty" && (
            <div className="bg-success-soft/60 border-success/25 w-full max-w-md rounded-2xl border p-4 text-center">
              <span className="bg-success-soft text-success mx-auto grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Check" size={24} /></span>
              <p className="text-ink mt-2 text-sm font-black">החיבור פעיל. ברגע שתיכנס הודעה היא תופיע כאן.</p>
              <p className="text-muted mt-0.5 text-[12px]">אין צורך לרענן — ה-Inbox מתעדכן אוטומטית.</p>
            </div>
          )}
          {err && <p className="text-danger text-[12px] font-bold">{err}</p>}

          {/* Manual fallback — always available */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link href="/whatsapp?mode=manual" className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-2xl border px-5 py-3 text-sm font-bold transition"><Icon name="MessageCircle" size={15} /> המשך במצב ידני / מסייע</Link>
            {(s === "webhook_pending" || s === "connected_empty") && (
              <Link href="/whatsapp/inbox" className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-2xl border px-5 py-3 text-sm font-bold transition"><Icon name="MessageCircle" size={15} /> פתח Inbox</Link>
            )}
          </div>
          <p className="text-muted text-[12px]">חיבור מאובטח דרך Meta Cloud API. לא שומרים סיסמאות, לא מבצעים scraping, לא שולחים אוטומטית — כל תגובה מאושרת ידנית.</p>
        </div>
      </section>

      {/* Connection wizard / health checklist */}
      <section className="bg-card border-line rounded-[22px] border p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-ink text-lg font-black">סטטוס חיבור</h2>
          <HealthBadge health={connection.health} />
        </div>
        <div className="flex flex-col gap-2">
          <CheckRow icon="Phone" label="WhatsApp Business Account" value={connection.wabaStatus ? statusHe(connection.wabaStatus) : "לא מחובר"} ok={connection.wabaStatus === "connected"} pending={connection.wabaStatus === "sandbox"} />
          <CheckRow icon="Phone" label="Phone Number ID" value={connection.phoneNumberId ?? "—"} ok={!!connection.phoneNumberId} />
          <CheckRow icon="Phone" label="מספר תצוגה" value={connection.displayPhoneNumber ?? "—"} ok={!!connection.displayPhoneNumber} />
          <CheckRow icon="Shield" label="אימות Webhook" value={connection.webhookVerified ? "מאומת" : "ממתין"} ok={connection.webhookVerified} pending={!connection.webhookVerified && connection.configured} />
          <CheckRow icon="Bell" label="Webhook אחרון שהתקבל" value={connection.lastWebhookAt ? new Date(connection.lastWebhookAt).toLocaleString("he-IL") : "טרם התקבל"} ok={!!connection.lastWebhookAt} />
          <CheckRow icon="FileText" label="תבניות" value={connection.templatesStatus === "synced" ? `${connection.templatesCount} תבניות` : "לא סונכרנו"} ok={connection.templatesStatus === "synced"} pending={connection.templatesStatus === "none" && connection.configured} />
          <CheckRow icon="Globe" label="מדיה (אימות חתימה)" value={connection.appSecretConfigured ? "פעיל" : "לא מוגדר App Secret"} ok={connection.appSecretConfigured} />
          <CheckRow icon="Activity" label="בריאות חיבור" value={healthHe(connection.health)} ok={connection.health === "healthy"} pending={connection.health === "pending"} />
        </div>
      </section>

      {/* What you get */}
      <section className="bg-card border-line rounded-[22px] border p-5 sm:p-6">
        <h2 className="text-ink mb-4 text-lg font-black">מה נקבל לאחר החיבור</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <div key={c.title} className="border-line flex items-start gap-3 rounded-2xl border p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white" style={{ background: WA }}><Icon name={c.icon} size={19} /></span>
              <div className="min-w-0"><p className="text-ink text-sm font-black">{c.title}</p><p className="text-muted mt-0.5 text-[13px] leading-relaxed">{c.body}</p></div>
            </div>
          ))}
        </div>
      </section>

      {/* QR explanation */}
      <section className="bg-card border-line rounded-[22px] border p-5 sm:p-6">
        <button onClick={() => setShowQr((v) => !v)} className="flex w-full items-center justify-between gap-2 text-right">
          <span className="text-ink inline-flex items-center gap-2 text-sm font-black"><Icon name="Lock" size={16} /> מדוע אין סריקת QR של WhatsApp אישי?</span>
          <Icon name={showQr ? "Check" : "Sparkles"} size={15} className="text-muted" />
        </button>
        {showQr && (
          <p className="text-muted mt-3 text-[13px] leading-relaxed">
            סריקת QR של WhatsApp אישי אינה נתמכת במצב production. ZONO משתמש ב-WhatsApp Business Cloud API כדי לשמור על יציבות, אבטחה ועמידה במדיניות.
          </p>
        )}
      </section>
    </div>
  );
}

function HealthBadge({ health }: { health: WhatsappConnection["health"] }) {
  const map: Record<WhatsappConnection["health"], { cls: string; label: string }> = {
    healthy: { cls: "bg-success-soft text-success", label: "תקין" },
    degraded: { cls: "bg-warning-soft text-warning", label: "חלקי" },
    pending: { cls: "bg-brand-soft text-brand", label: "בהמתנה" },
    down: { cls: "bg-danger-soft text-danger", label: "לא מוגדר" },
  };
  const m = map[health];
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-black ${m.cls}`}><Icon name="Activity" size={13} /> {m.label}</span>;
}

function CheckRow({ icon, label, value, ok, pending }: { icon: string; label: string; value: string; ok: boolean; pending?: boolean }) {
  const tone = ok ? "bg-success-soft text-success" : pending ? "bg-warning-soft text-warning" : "bg-surface text-muted";
  return (
    <div className="border-line flex items-center gap-3 rounded-2xl border p-3.5">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${tone}`}><Icon name={icon} size={16} /></span>
      <span className="text-ink flex-1 text-sm font-bold">{label}</span>
      <span className="text-muted max-w-[45%] truncate text-[12px] font-semibold">{value}</span>
      {ok ? <Icon name="Check" size={16} className="text-success shrink-0" /> : pending ? <Icon name="RefreshCw" size={15} className="text-warning shrink-0" /> : <Icon name="AlertTriangle" size={15} className="text-muted shrink-0" />}
    </div>
  );
}

function statusHe(s: string): string {
  return s === "connected" ? "מחובר" : s === "sandbox" ? "מצב בדיקה" : s === "expired" ? "פג תוקף" : s === "missing_permissions" ? "חסרות הרשאות" : "לא מוגדר";
}
function healthHe(h: WhatsappConnection["health"]): string {
  return h === "healthy" ? "תקין" : h === "degraded" ? "חלקי — חסר App Secret" : h === "pending" ? "בהמתנה לאימות" : "לא מוגדר בשרת";
}
