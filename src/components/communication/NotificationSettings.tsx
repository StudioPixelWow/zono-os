"use client";
// ============================================================================
// ZONO — Notification settings UI. Understandable in under 30 seconds: how ZONO
// updates you, per channel. RTL, Hebrew, no engineering terms. Saves each toggle
// immediately; a "send test email" button proves the real Resend path to your
// own inbox.
// ============================================================================
import { useState, useTransition } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { saveNotificationPreferencesAction, sendTestNotificationAction } from "@/lib/communication/preferences-actions";

type Prefs = { whatsapp: boolean; email: boolean; morningEmail: boolean; urgentWhatsapp: boolean; meetingReminders: boolean };

function Toggle({ on, onClick, label, hint }: { on: boolean; onClick: () => void; label: string; hint?: string }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between gap-3 py-2.5 text-right">
      <span className="min-w-0">
        <span className="text-ink block text-sm font-bold">{label}</span>
        {hint && <span className="text-muted block text-xs">{hint}</span>}
      </span>
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${on ? "bg-brand-strong" : "bg-surface"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-0.5" : "right-0.5"}`} />
      </span>
    </button>
  );
}

export function NotificationSettings({ initial }: { initial: Prefs }) {
  const [p, setP] = useState<Prefs>(initial);
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const set = (k: keyof Prefs) => {
    const next = { ...p, [k]: !p[k] };
    setP(next);
    start(() => { void saveNotificationPreferencesAction({ [k]: next[k] }); });
  };

  const test = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await sendTestNotificationAction();
      setMsg(r.ok ? "נשלח אימייל בדיקה — בדוק/י את תיבת הדואר ✓" : "השליחה נכשלה או שאין כתובת אימייל בפרופיל.");
    } catch { setMsg("השליחה נכשלה."); }
    finally { setBusy(false); }
  };

  return (
    <div dir="rtl" className="mx-auto flex max-w-2xl flex-col gap-5 p-4 sm:p-6">
      <header className="flex items-center gap-3">
        <span className="bg-surface text-brand-strong grid h-11 w-11 place-items-center rounded-2xl"><Icon name="Bell" size={22} /></span>
        <div>
          <h1 className="text-ink text-lg font-black">איך ZONO מעדכנת אותי</h1>
          <p className="text-muted text-xs">בחר/י אילו עדכונים לקבל ובאיזה ערוץ. אפשר לשנות בכל רגע.</p>
        </div>
      </header>

      <section className="bg-card border-line rounded-2xl border p-4">
        <div className="mb-1 flex items-center gap-2"><Icon name="MessageCircle" size={16} className="text-brand-strong" /><h2 className="text-ink text-sm font-black">WhatsApp</h2></div>
        <p className="text-muted mb-2 text-xs">רק דברים דחופים באמת — לא הצפה.</p>
        <Toggle on={p.whatsapp} onClick={() => set("whatsapp")} label="קבלת עדכונים ב-WhatsApp" />
        <Toggle on={p.urgentWhatsapp} onClick={() => set("urgentWhatsapp")} label="התראות דחופות בלבד" hint="ליד חדש מעבר ל-SLA, כשל פרסום, בעיית תשלום" />
      </section>

      <section className="bg-card border-line rounded-2xl border p-4">
        <div className="mb-1 flex items-center gap-2"><Icon name="Mail" size={16} className="text-brand-strong" /><h2 className="text-ink text-sm font-black">אימייל</h2></div>
        <Toggle on={p.email} onClick={() => set("email")} label="קבלת עדכונים באימייל" hint="תמיכה, חשבון ותשלומים, סיכומים" />
        <Toggle on={p.morningEmail} onClick={() => set("morningEmail")} label="סיכום הבוקר" hint="מה שכדאי לטפל בו היום, בימי עבודה" />
        <div className="mt-3 flex items-center gap-2">
          <button onClick={test} disabled={busy} className="bg-brand-strong rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
            {busy ? "שולח…" : "שליחת אימייל בדיקה"}
          </button>
          {msg && <span className="text-muted text-xs">{msg}</span>}
        </div>
      </section>

      <section className="bg-card border-line rounded-2xl border p-4">
        <div className="mb-1 flex items-center gap-2"><Icon name="Calendar" size={16} className="text-brand-strong" /><h2 className="text-ink text-sm font-black">פגישות</h2></div>
        <Toggle on={p.meetingReminders} onClick={() => set("meetingReminders")} label="תזכורת לפני פגישה" />
      </section>

      <p className="text-muted text-center text-[11px]">התראות בתוך המערכת תמיד פעילות. עדכוני חשבון, תשלומים ואבטחה נשלחים תמיד.</p>
    </div>
  );
}
