"use client";
// ============================================================================
// 💬 ZONO OS — Batch 6.6A · PERSONAL WhatsApp (Beta) — client view.
// Business API is shown as the recommended option; Personal is explicitly Beta.
// Flow: choose transport → acknowledge risk disclosure → connect → render QR →
// poll state → reconnect / disconnect / revoke. Renders only client-safe data
// (state + QR image). No tokens, credentials, endpoints or Evolution details.
// ============================================================================
import { useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  personalConnectAction, personalRefreshQrAction, personalReconnectAction, personalStatusAction,
  personalDisconnectAction, personalDeleteAction, personalAcknowledgeAction, personalSetTransportAction,
} from "@/lib/whatsapp/provider/personal/actions";
import type { WaConnectionSnapshot, WaConnState } from "@/lib/whatsapp/provider/types";
import type { PersonalHealth } from "@/lib/whatsapp/provider/personal/health";
import type { TransportPreference } from "@/lib/whatsapp/provider/personal/transport";

const STATE_HE: Record<WaConnState, { label: string; tone: string }> = {
  connected: { label: "מחובר", tone: "text-emerald-600" },
  waiting_qr: { label: "ממתין לסריקת QR", tone: "text-brand" },
  qr_expired: { label: "ה-QR פג — רענן", tone: "text-amber-600" },
  scanning: { label: "סורק…", tone: "text-brand" },
  connecting: { label: "מתחבר…", tone: "text-brand" },
  disconnected: { label: "מנותק", tone: "text-muted" },
  error: { label: "שגיאה", tone: "text-amber-600" },
  unavailable: { label: "לא זמין", tone: "text-muted" },
};

type Snap = WaConnectionSnapshot | { error: string };
const isErr = (s: Snap): s is { error: string } => "error" in s;

export function PersonalWhatsappView({
  health, acknowledged, transport, disclosureVersion,
}: {
  health: PersonalHealth | null; acknowledged: boolean; transport: TransportPreference; disclosureVersion: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [ack, setAck] = useState(acknowledged);
  const [agree, setAgree] = useState(false);
  const [pref, setPref] = useState<TransportPreference>(transport);
  const [snap, setSnap] = useState<WaConnectionSnapshot | null>(null);

  const enabled = !!health?.enabled;
  const state: WaConnState = snap?.state ?? health?.state ?? "disconnected";
  const st = STATE_HE[state];

  const applySnap = (s: Snap) => { if (isErr(s)) setMsg(s.error); else { setSnap(s); setMsg(null); } };

  // Poll live state while pairing/connecting.
  const poll = useCallback(() => { personalStatusAction().then((s) => { if (!isErr(s)) setSnap(s); }); }, []);
  useEffect(() => {
    if (!enabled) return;
    if (state === "waiting_qr" || state === "connecting" || state === "scanning") {
      const t = setInterval(poll, 4000);
      return () => clearInterval(t);
    }
  }, [enabled, state, poll]);

  const connect = () => start(async () => applySnap(await personalConnectAction()));
  const refresh = () => start(async () => applySnap(await personalRefreshQrAction()));
  const reconnect = () => start(async () => applySnap(await personalReconnectAction()));
  const disconnect = () => start(async () => { await personalDisconnectAction(); setSnap(null); setMsg("החיבור נותק."); router.refresh(); });
  const revoke = () => start(async () => { await personalDeleteAction(); setSnap(null); setMsg("ההתחברות בוטלה."); router.refresh(); });
  const acknowledge = () => start(async () => { const r = await personalAcknowledgeAction("settings/whatsapp/personal"); if (r.ok) { setAck(true); setMsg(null); } else setMsg(r.error ?? "שגיאה"); });
  const choose = (p: TransportPreference) => start(async () => { const r = await personalSetTransportAction(p); if (r.ok) setPref(p); else setMsg(r.error ?? "שגיאה"); });

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-ink text-xl font-black">WhatsApp אישי</h1>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">BETA</span>
        </div>
        <p className="text-muted text-[12px]">
          חיבור אישי דרך WhatsApp Web (QR) — אופציונלי, לסוכן בודד. הדרך המומלצת והרשמית היא WhatsApp Business API.
        </p>
      </header>

      {!enabled ? (
        <p className="rounded-[12px] border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] font-bold text-amber-700">
          WhatsApp האישי אינו זמין כרגע.
        </p>
      ) : null}
      {msg ? <p className="text-brand text-[12px] font-bold">{msg}</p> : null}

      {/* Transport selection — Business recommended, Personal Beta. */}
      <section className="bg-card border-line flex flex-col gap-3 rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
        <h3 className="text-ink text-sm font-black">ערוץ שליחה</h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => choose("business")}
            className={`rounded-full px-4 py-1.5 text-[12px] font-black ${pref === "business" ? "bg-brand text-white" : "border-line border"}`}>
            WhatsApp Business (מומלץ)
          </button>
          <button type="button" disabled={pending} onClick={() => choose("personal")}
            className={`rounded-full px-4 py-1.5 text-[12px] font-black ${pref === "personal" ? "bg-brand text-white" : "border-line border"}`}>
            WhatsApp אישי (Beta)
          </button>
        </div>
        <p className="text-muted text-[10px]">מעבר בין ערוצים אינו משנה שיחות, קשרי CRM או היסטוריית AI — רק דרך השליחה מתעדכנת.</p>
      </section>

      {/* Disclosure gate — must acknowledge before pairing. */}
      {!ack ? (
        <section className="bg-card border-line flex flex-col gap-3 rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
          <h3 className="text-ink text-sm font-black">הצהרה לפני חיבור (Beta)</h3>
          <ul className="text-muted flex list-disc flex-col gap-1 pr-4 text-[11px]">
            <li>החיבור מבוסס על סשן אישי בסגנון WhatsApp Web.</li>
            <li>זוהי יכולת בשלב Beta ועשויה להתנתק ולדרוש סריקת QR מחדש.</li>
            <li>זהו אינו ה-WhatsApp Business Cloud API הרשמי.</li>
            <li>אוטומציה על חשבון אישי עשויה לשאת סיכון מדיניות/מגבלות חשבון.</li>
            <li>שיווק המוני או אוטומציה אגרסיבית אסורים בערוץ זה.</li>
          </ul>
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span className="text-ink font-bold">קראתי והבנתי את הסיכונים.</span>
          </label>
          <div>
            <button type="button" disabled={!agree || pending} onClick={acknowledge}
              className="bg-brand rounded-full px-4 py-1.5 text-[12px] font-black text-white disabled:opacity-50">
              אני מאשר/ת ({disclosureVersion})
            </button>
          </div>
        </section>
      ) : null}

      {/* Connection card. */}
      <section className="bg-card border-line flex flex-col gap-4 rounded-[20px] border p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center gap-2">
          <span className="text-lg">📱</span>
          <h3 className="text-ink text-sm font-black">חיבור אישי</h3>
          <span className={`text-[11px] font-black ${st.tone}`}>· {st.label}</span>
        </div>

        {enabled && ack && state === "waiting_qr" && snap?.qr?.image ? (
          <div className="flex flex-col items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={snap.qr.image} alt="QR" width={220} height={220} className="rounded-[12px] border border-[var(--line)]" />
            <p className="text-muted text-[11px]">סרוק/י את הקוד ב-WhatsApp ← מכשירים מקושרים.</p>
          </div>
        ) : null}

        {health ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="מצב" value={st.label} />
            <Field label="חובר לאחרונה" value={health.lastConnectedAt ? new Date(health.lastConnectedAt).toLocaleString("he-IL") : "—"} />
            <Field label="שם" value={snap?.displayName ?? health.displayName ?? "—"} />
            <Field label="דורש חיבור מחדש" value={health.repairRequired ? "כן" : "לא"} />
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={!enabled || !ack || pending} onClick={connect} className="bg-brand rounded-full px-4 py-1.5 text-[12px] font-black text-white disabled:opacity-50">חיבור</button>
          <button type="button" disabled={!enabled || !ack || pending} onClick={refresh} className="border-line rounded-full border px-3 py-1.5 text-[12px] font-bold disabled:opacity-50">רענון QR</button>
          <button type="button" disabled={!enabled || !ack || pending} onClick={reconnect} className="border-line rounded-full border px-3 py-1.5 text-[12px] font-bold disabled:opacity-50">חיבור מחדש</button>
          <button type="button" disabled={pending} onClick={disconnect} className="border-line rounded-full border px-3 py-1.5 text-[12px] font-bold">ניתוק</button>
          <button type="button" disabled={pending} onClick={revoke} className="text-muted rounded-full border border-[var(--line)] px-3 py-1.5 text-[12px] font-bold">ביטול/מחיקה</button>
        </div>
        <p className="text-muted text-[10px]">שליחה בערוץ האישי מחייבת אישור אנושי ומוגבלת בקצב — אין שליחה אוטומטית/המונית.</p>
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
