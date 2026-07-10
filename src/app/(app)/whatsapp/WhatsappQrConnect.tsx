"use client";
// ============================================================================
// 📘 ZONO — WhatsApp QR connect screen (client, TEMPORARY phase).
// Per-broker personal WhatsApp connection via a large auto-refreshing QR. Polls
// the provider status every few seconds and advances the state machine:
//   waiting_qr → scanning → connecting → connected (→ opens existing Inbox)
// Also: qr_expired (auto new QR), disconnected, error, unavailable. Includes a
// ToS/ban consent notice (personal WhatsApp session tech is temporary). The QR
// image + status come from the server provider; no secrets reach the client.
// ============================================================================
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Spinner } from "@/components/ui/Button";
import { waConnectAction, waStatusAction, waRefreshQrAction, waDisconnectAction, waDeleteSessionAction } from "@/lib/whatsapp/provider/actions";
import type { WaConnectionSnapshot, WaConnState } from "@/lib/whatsapp/provider/types";

const WA = "linear-gradient(135deg,#25D366,#128C7E)";

const STATE_LABEL: Record<WaConnState, string> = {
  disconnected: "לא מחובר",
  waiting_qr: "ממתין לסריקה",
  qr_expired: "ה-QR פג — מרענן…",
  scanning: "סורק…",
  connecting: "מתחבר…",
  connected: "מחובר",
  error: "שגיאה",
  unavailable: "השירות אינו פעיל בשרת",
};

export function WhatsappQrConnect({ initial }: { initial: WaConnectionSnapshot }) {
  const router = useRouter();
  const [snap, setSnap] = useState<WaConnectionSnapshot>(initial);
  const [busy, setBusy] = useState(false);
  const [consented, setConsented] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };

  // When connected, open the existing Inbox (no new inbox is built here).
  useEffect(() => {
    if (snap.state === "connected") { stopPoll(); const t = setTimeout(() => router.refresh(), 900); return () => clearTimeout(t); }
  }, [snap.state, router]);

  const poll = useCallback(async () => {
    try {
      const next = await waStatusAction();
      setSnap(next);
      // Auto-generate a fresh QR when the current one expires.
      if (next.state === "qr_expired") { const q = await waRefreshQrAction(); setSnap(q); }
    } catch { /* keep last snapshot */ }
  }, []);

  const startPolling = useCallback(() => {
    stopPoll();
    pollRef.current = setInterval(poll, 3500);
  }, [poll]);

  useEffect(() => () => stopPoll(), []);

  const beginConnect = async () => {
    setBusy(true);
    try { const s = await waConnectAction(); setSnap(s); startPolling(); }
    finally { setBusy(false); }
  };

  const refreshQr = async () => { setBusy(true); try { setSnap(await waRefreshQrAction()); } finally { setBusy(false); } };
  const disconnect = async () => { setBusy(true); try { await waDisconnectAction(); stopPoll(); setSnap(await waStatusAction()); } finally { setBusy(false); } };
  const deleteSession = async () => { setBusy(true); try { await waDeleteSessionAction(); stopPoll(); setSnap(await waStatusAction()); } finally { setBusy(false); } };

  const s = snap.state;
  const showQr = (s === "waiting_qr" || s === "qr_expired") && !!snap.qr;
  const inProgress = s === "scanning" || s === "connecting";

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">
      {/* Hero */}
      <section className="bg-card border-line relative overflow-hidden rounded-[28px] border p-6 shadow-[var(--shadow-card)] sm:p-9">
        <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(37,211,102,0.18),transparent_70%)] blur-2xl" />
        <div className="relative flex flex-col items-center gap-5 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-3xl text-white shadow-[0_10px_30px_rgba(18,140,126,0.45)]" style={{ background: WA }}><Icon name="MessageCircle" size={30} /></span>
          <div>
            <h1 className="text-ink text-2xl font-black sm:text-4xl">חבר את ה-WhatsApp האישי שלך</h1>
            <p className="text-muted mx-auto mt-2 max-w-xl text-sm leading-relaxed sm:text-base">כל סוכן מחבר את החשבון שלו בסריקת QR. לאחר החיבור השיחות מגיעות ל-Inbox הקיים, עם ה-AI, ה-Timeline, שיוך ה-CRM וזרימת האישורים — ללא שינוי.</p>
          </div>

          {/* Live status pill */}
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[12px] font-black ${s === "connected" ? "bg-success-soft text-success" : s === "error" || s === "unavailable" ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand"}`}>
            {inProgress || s === "qr_expired" ? <Spinner size={13} /> : <Icon name={s === "connected" ? "Check" : "Activity"} size={13} />} {STATE_LABEL[s]}
          </span>

          {/* Consent gate before first connect */}
          {s !== "connected" && (
            <label className="bg-warning-soft/50 border-warning/30 flex w-full max-w-md items-start gap-2.5 rounded-2xl border p-3 text-right">
              <input type="checkbox" checked={consented} onChange={(e) => setConsented(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="text-ink text-[12px] leading-relaxed font-semibold">
                שלב זמני: החיבור משתמש בטכנולוגיית WhatsApp Web אישית. השימוש כפוף לתנאי Meta ועלול לחשוף את המספר לחסימה. אני מאשר/ת ומחבר/ת את החשבון האישי שלי בלבד. בעתיד נעבור ל-WhatsApp Business Cloud API הרשמי ללא שינוי ב-Inbox.
              </span>
            </label>
          )}

          {/* Primary action */}
          {s === "unavailable" ? (
            <div className="bg-danger-soft/40 border-danger/20 w-full max-w-md rounded-2xl border p-3.5 text-center">
              <p className="text-ink text-[13px] font-black">שירות ה-WhatsApp אינו פעיל בשרת</p>
              <p className="text-muted mt-0.5 text-[12px] leading-relaxed">נדרש להפעיל את שירות הגשר (WHATSAPP_BRIDGE_URL / WHATSAPP_BRIDGE_TOKEN). עד אז ניתן לעבוד במצב ידני.</p>
            </div>
          ) : s === "connected" ? (
            <div className="bg-success-soft/60 border-success/25 w-full max-w-md rounded-2xl border p-4 text-center">
              <span className="bg-success-soft text-success mx-auto grid h-12 w-12 place-items-center rounded-2xl"><Icon name="Check" size={24} /></span>
              <p className="text-ink mt-2 text-sm font-black">{snap.displayName ? `מחובר כ-${snap.displayName}` : "החיבור פעיל"}. פותח את ה-Inbox…</p>
            </div>
          ) : showQr ? (
            <QrCard snap={snap} onRefresh={refreshQr} busy={busy} />
          ) : inProgress ? (
            <div className="border-line flex w-full max-w-md flex-col items-center gap-2 rounded-2xl border p-8">
              <Spinner size={28} />
              <p className="text-ink text-sm font-black">{STATE_LABEL[s]}</p>
              <p className="text-muted text-[12px]">אל תסגור את המסך — מסיים חיבור.</p>
            </div>
          ) : (
            <button onClick={beginConnect} disabled={busy || !consented} className="btn-zono-primary zono-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-base font-black text-white shadow-[var(--shadow-lift)] disabled:opacity-50">
              {busy ? <Spinner size={18} /> : <Icon name="MessageCircle" size={18} />} צור QR לחיבור
            </button>
          )}

          {snap.error && s !== "unavailable" && <p className="text-danger text-[12px] font-bold">{snap.error}</p>}

          {/* Secondary actions */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link href="/whatsapp?mode=manual" className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-2xl border px-5 py-3 text-sm font-bold transition"><Icon name="MessageCircle" size={15} /> מצב ידני / מסייע</Link>
            {(s === "waiting_qr" || s === "qr_expired" || s === "scanning" || s === "connecting") && (
              <button onClick={disconnect} disabled={busy} className="text-muted text-[12px] font-bold underline-offset-2 hover:underline">בטל חיבור</button>
            )}
            {(s === "error" || s === "disconnected") && (
              <button onClick={deleteSession} disabled={busy} className="text-muted text-[12px] font-bold underline-offset-2 hover:underline">מחק הפעלה וצור QR חדש</button>
            )}
          </div>
          <p className="text-muted text-[12px]">חיבור אישי לכל סוכן. אין הפעלות משותפות. שום הודעה לא נשלחת אוטומטית — כל תגובה עוברת אישור.</p>
        </div>
      </section>

      {/* What stays the same */}
      <section className="bg-card border-line rounded-[22px] border p-5 sm:p-6">
        <h2 className="text-ink mb-3 text-lg font-black">מה עובד מיד לאחר החיבור</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            ["Inbox", "כל שיחה נכנסת ל-Inbox הקיים"],
            ["AI Conversation Brain", "זיהוי כוונה, דחיפות ותשובה מוצעת"],
            ["Timeline", "ציר הזמן המלא של הלקוח"],
            ["CRM", "שיוך לקונה / מוכר / ליד"],
            ["טיוטות", "תשובות מוכנות לאישור"],
            ["אישורים", "שליחה רק לאחר אישור ידני"],
          ].map(([t, b]) => (
            <div key={t} className="border-line flex items-start gap-2.5 rounded-2xl border p-3">
              <span className="text-success mt-0.5 shrink-0"><Icon name="Check" size={15} /></span>
              <div className="min-w-0"><p className="text-ink text-[13px] font-black">{t}</p><p className="text-muted text-[12px]">{b}</p></div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function QrCard({ snap, onRefresh, busy }: { snap: WaConnectionSnapshot; onRefresh: () => void; busy: boolean }) {
  const expired = snap.state === "qr_expired";
  return (
    <div className="border-line flex w-full max-w-md flex-col items-center gap-3 rounded-3xl border p-6">
      <div className="relative grid h-64 w-64 place-items-center rounded-2xl bg-white p-3 shadow-[var(--shadow-card)]">
        {snap.qr?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={snap.qr.image} alt="WhatsApp QR" className={`h-full w-full ${expired ? "opacity-30 blur-[1px]" : ""}`} />
        ) : (
          <div className="text-muted text-center text-[12px] font-bold">{snap.qr?.raw ? "QR מוכן — סרוק באפליקציית WhatsApp" : "מכין QR…"}</div>
        )}
        {expired && <button onClick={onRefresh} disabled={busy} className="btn-zono-primary absolute inset-x-8 bottom-1/2 translate-y-1/2 rounded-xl px-3 py-2 text-[12px] font-black text-white">רענן QR</button>}
      </div>
      <p className="text-ink text-sm font-black">פתח WhatsApp → מכשירים מקושרים → קשר מכשיר → סרוק</p>
      <p className="text-muted text-[12px]">ה-QR מתחדש אוטומטית. אין צורך לרענן ידנית.</p>
    </div>
  );
}
