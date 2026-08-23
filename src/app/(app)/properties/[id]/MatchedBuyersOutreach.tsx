"use client";
// ============================================================================
// ZONO — "קונים מתאימים" as an ACTION CENTER (client).
// The AI found the buyers → the broker selects them → ZONO contacts them
// (WhatsApp / email / both) → ZONO records everything. Multi-select, honest
// channel-availability indicators, filter/search, a sticky action bar, a
// confirmation composer, and a real per-recipient result summary.
//
// No sending logic lives here — it calls sendPropertyOutreachAction, which
// re-resolves matches, re-checks consent, and sends through the canonical
// transport server-side. WhatsApp uses the approved template (not editable);
// only the email body is broker-editable, because free-form business-initiated
// WhatsApp is rejected by Meta outside the session window.
// ============================================================================
import { useEffect, useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/dashboard/Icon";
import {
  getPropertyOutreachAction,
  sendPropertyOutreachAction,
} from "@/lib/customer-comm/property-outreach-actions";
import type { MatchedBuyersOutreach, OutreachBuyer, SendOutreachResult } from "@/lib/customer-comm/property-outreach";

type Filter = "all" | "s80" | "s60" | "unsent" | "wa" | "email";
const REASON_HE: Record<string, string> = {
  already_sent: "כבר קיבל את הנכס", no_phone: "אין טלפון", no_email: "אין אימייל",
  not_connected: "הערוץ אינו מחובר", not_consented: "אין הסכמה לתקשורת", send_failed: "השליחה נכשלה",
  no_detail: "אין פרטי קשר", email_not_configured: "מייל לא מוגדר",
};
const eligible = (b: OutreachBuyer) => b.whatsapp === "available" || b.email === "available";
const daysAgo = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null);

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function MatchedBuyersOutreach({ propertyId }: { propertyId: string }) {
  const [model, setModel] = useState<MatchedBuyersOutreach | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [composer, setComposer] = useState<null | { whatsapp: boolean; email: boolean }>(null);
  const [result, setResult] = useState<SendOutreachResult | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = () => {
    getPropertyOutreachAction(propertyId).then((r) => {
      if (r.ok) { setModel(r.data); setError(null); } else setError(r.error);
      setLoading(false);
    });
  };
  useEffect(() => {
    let alive = true;
    getPropertyOutreachAction(propertyId).then((r) => {
      if (!alive) return;
      if (r.ok) { setModel(r.data); setError(null); } else setError(r.error);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [propertyId]);

  const buyers = useMemo(() => model?.buyers ?? [], [model]);
  const filtered = useMemo(() => {
    const q = query.trim();
    return buyers.filter((b) => {
      if (q && !b.name.includes(q)) return false;
      switch (filter) {
        case "s80": return (b.score ?? 0) >= 80;
        case "s60": return (b.score ?? 0) >= 60;
        case "unsent": return !b.lastSentAt;
        case "wa": return b.whatsapp === "available";
        case "email": return b.email === "available";
        default: return true;
      }
    });
  }, [buyers, filter, query]);

  const eligibleFiltered = filtered.filter(eligible);
  const allEligibleSelected = eligibleFiltered.length > 0 && eligibleFiltered.every((b) => selected.has(b.buyerId));
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected((s) => {
    if (allEligibleSelected) { const n = new Set(s); eligibleFiltered.forEach((b) => n.delete(b.buyerId)); return n; }
    const n = new Set(s); eligibleFiltered.forEach((b) => n.add(b.buyerId)); return n;
  });
  const clear = () => setSelected(new Set());

  const selectedBuyers = buyers.filter((b) => selected.has(b.buyerId));

  if (loading) return <div className="text-muted py-6 text-center text-sm">טוען קונים מתאימים…</div>;
  if (error) return <div className="border-line rounded-2xl border p-5 text-center"><p className="text-ink text-sm font-bold">לא ניתן לטעון כרגע</p><p className="text-muted mt-1 text-xs">{error}</p></div>;
  if (!model) return null;

  if (buyers.length === 0) {
    return <div className="border-line rounded-2xl border p-6 text-center"><p className="text-ink text-sm font-black">אין כרגע קונים מתאימים לנכס</p><p className="text-muted mx-auto mt-1 max-w-sm text-xs">ניתן לעדכן דרישות קונים כדי לשפר התאמה.</p></div>;
  }

  const noChannels = buyers.every((b) => !eligible(b));

  return (
    <div className="flex flex-col gap-3">
      {!model.property.published && (
        <Banner tone="warn" text="יש לפרסם את עמוד הנכס לפני שליחה — לנכס עדיין אין עמוד ציבורי." />
      )}
      {model.property.published && !model.waConnected && !model.emailConfigured && (
        <Banner tone="warn" text="אין ערוץ תקשורת פעיל — חברו WhatsApp או הגדירו שליחת מייל כדי לשלוח." />
      )}
      {noChannels && model.property.published && (model.waConnected || model.emailConfigured) && (
        <Banner tone="muted" text="נמצאו קונים מתאימים, אבל אין להם ערוץ תקשורת זמין (טלפון/מייל או הסכמה)." />
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-ink flex cursor-pointer items-center gap-2 text-[13px] font-bold">
          <input type="checkbox" checked={allEligibleSelected} onChange={toggleAll} disabled={eligibleFiltered.length === 0}
            className="accent-brand h-4 w-4 rounded" />
          בחר הכל
        </label>
        {selected.size > 0 && <span className="text-muted text-[12px]">נבחרו {selected.size} מתוך {eligibleFiltered.length} זמינים</span>}
        <div className="ms-auto flex items-center gap-1.5">
          <div className="border-line flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5">
            <Icon name="Search" size={14} className="text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי שם"
              className="text-ink w-28 bg-transparent text-[12.5px] outline-none placeholder:text-muted" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1.5">
        {([["all", "הכל"], ["s80", "80%+"], ["s60", "60%+"], ["unsent", "לא קיבלו"], ["wa", "יש WhatsApp"], ["email", "יש מייל"]] as [Filter, string][]).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold transition ${filter === f ? "bg-brand text-white" : "border-line text-muted hover:text-ink border"}`}>{label}</button>
        ))}
      </div>

      {/* Rows */}
      <ul className="flex flex-col gap-2">
        {filtered.map((b) => {
          const can = eligible(b);
          const d = daysAgo(b.lastSentAt);
          return (
            <li key={b.buyerId}
              className={`border-line flex items-center gap-3 rounded-2xl border p-3 transition ${selected.has(b.buyerId) ? "border-brand bg-brand-soft/40" : ""} ${can ? "" : "opacity-60"}`}>
              <input type="checkbox" checked={selected.has(b.buyerId)} onChange={() => toggle(b.buyerId)} disabled={!can}
                className="accent-brand h-4 w-4 shrink-0 rounded" />
              <span className="bg-brand-soft text-brand grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-black">{initials(b.name)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <p className="text-ink truncate text-[13.5px] font-bold">{b.name}</p>
                  {b.score != null && <span className="text-brand text-[12px] font-black">התאמה {b.score}%</span>}
                </div>
                {b.reason && <p className="text-muted truncate text-[11.5px]">{b.reason}</p>}
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <ChannelChip on={b.whatsapp === "available"} icon="MessageCircle" label="WhatsApp" />
                  <ChannelChip on={b.email === "available"} icon="Mail" label="מייל" />
                  {d != null && <span className="text-[10.5px] font-bold text-amber-600">· נשלח {d === 0 ? "היום" : `לפני ${d} ימים`}</span>}
                </div>
              </div>
              {b.agentName && (
                <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                  {b.agentAvatarUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={b.agentAvatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
                    : <span className="grid h-7 w-7 place-items-center rounded-full bg-surface text-[10px] font-black text-muted">{initials(b.agentName)}</span>}
                  <div className="leading-tight"><p className="text-ink text-[11px] font-bold">{b.agentName}</p><p className="text-muted text-[9.5px]">הסוכן המטפל</p></div>
                </div>
              )}
            </li>
          );
        })}
        {filtered.length === 0 && <li className="text-muted py-4 text-center text-xs">אין קונים התואמים לסינון.</li>}
      </ul>

      {/* Sticky action bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-3 z-20 mt-1">
          <div className="border-line bg-card flex flex-wrap items-center gap-2 rounded-2xl border p-2.5 shadow-[var(--shadow-card)]">
            <span className="text-ink px-1 text-[13px] font-black">{selected.size} קונים נבחרו</span>
            <div className="ms-auto flex flex-wrap items-center gap-1.5">
              <ActionBtn icon="MessageCircle" label="שלח WhatsApp" onClick={() => setComposer({ whatsapp: true, email: false })} />
              <ActionBtn icon="Mail" label="שלח במייל" onClick={() => setComposer({ whatsapp: false, email: true })} />
              <ActionBtn icon="Send" label="שלח בשניהם" primary onClick={() => setComposer({ whatsapp: true, email: true })} />
              <button onClick={clear} className="text-muted hover:text-ink px-2 text-[12px] font-bold">ביטול בחירה</button>
            </div>
          </div>
        </div>
      )}

      {composer && (
        <Composer
          channels={composer}
          buyers={selectedBuyers}
          waTemplateReady={model.waTemplateReady}
          pending={pending}
          onClose={() => setComposer(null)}
          onSend={(payload) => startTransition(async () => {
            const r = await sendPropertyOutreachAction({ propertyId, recipientIds: selectedBuyers.map((b) => b.buyerId), channels: composer, ...payload });
            if (r.ok) { setResult(r.data); setComposer(null); setSelected(new Set()); reload(); }
            else setError(r.error);
          })}
        />
      )}

      {result && <ResultSummary result={result} onClose={() => setResult(null)} />}
    </div>
  );
}

function ChannelChip({ on, icon, label }: { on: boolean; icon: string; label: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${on ? "bg-success-soft text-success" : "bg-surface text-muted"}`}>
      <Icon name={icon} size={11} />{label}{!on && " ✕"}
    </span>
  );
}

function ActionBtn({ icon, label, onClick, primary }: { icon: string; label: string; onClick: () => void; primary?: boolean }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-bold transition ${primary ? "bg-brand text-white hover:opacity-90" : "border-line text-ink hover:bg-surface border"}`}>
      <Icon name={icon} size={14} />{label}
    </button>
  );
}

function Banner({ tone, text }: { tone: "warn" | "muted"; text: string }) {
  return <div className={`rounded-xl border p-2.5 text-[12px] font-semibold ${tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-line bg-surface text-muted"}`}>{text}</div>;
}

function Composer({ channels, buyers, waTemplateReady, pending, onClose, onSend }: {
  channels: { whatsapp: boolean; email: boolean };
  buyers: OutreachBuyer[];
  waTemplateReady: boolean;
  pending: boolean;
  onClose: () => void;
  onSend: (p: { allowResend: boolean; emailSubject?: string; emailBody?: string }) => void;
}) {
  const [allowResend, setAllowResend] = useState(false);
  const [subject, setSubject] = useState("מצאתי נכס שיכול להתאים לך");
  const [body, setBody] = useState("היי {first_name},\nמצאתי נכס שמתאים למה שחיפשת וחשבתי שכדאי לך לראות אותו.\n\n{property_title}\n{property_price}\n{property_location}\n\nלצפייה בפרטי הנכס:\n{public_property_url}");

  const waCount = channels.whatsapp ? buyers.filter((b) => b.whatsapp === "available").length : 0;
  const emailCount = channels.email ? buyers.filter((b) => b.email === "available").length : 0;
  const bothCount = channels.whatsapp && channels.email ? buyers.filter((b) => b.whatsapp === "available" && b.email === "available").length : 0;
  const noneCount = buyers.filter((b) => (channels.whatsapp && b.whatsapp === "available") || (channels.email && b.email === "available") ? false : true).length;
  const alreadyCount = buyers.filter((b) => b.lastSentAt).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="bg-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl border-line border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-ink text-[15px] font-black">שליחת הנכס לקונים מתאימים</h3>
          <button onClick={onClose} className="text-muted hover:text-ink"><Icon name="X" size={18} /></button>
        </div>

        <p className="text-muted mb-2 text-[12.5px]">{buyers.length} נמענים נבחרו</p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {channels.whatsapp && <Stat label="WhatsApp" n={waCount} />}
          {channels.email && <Stat label="מייל" n={emailCount} />}
          {channels.whatsapp && channels.email && <Stat label="שניהם" n={bothCount} />}
          {noneCount > 0 && <Stat label="ללא ערוץ זמין" n={noneCount} muted />}
        </div>

        {channels.whatsapp && !waTemplateReady && (
          <Banner tone="warn" text="WhatsApp: אין תבנית מאושרת מוגדרת — הודעות WhatsApp לא יישלחו עד להגדרת תבנית." />
        )}
        {channels.whatsapp && (
          <p className="text-muted mb-3 text-[11px] leading-relaxed">הודעת ה־WhatsApp נשלחת בתבנית מאושרת (שם הלקוח, האזור וקישור לנכס) — כנדרש ע״י WhatsApp Business.</p>
        )}

        {channels.email && (
          <div className="mb-3 flex flex-col gap-2">
            <label className="text-ink text-[12px] font-bold">נושא המייל
              <input value={subject} onChange={(e) => setSubject(e.target.value)} className="border-line text-ink mt-1 w-full rounded-xl border px-3 py-2 text-[13px] outline-none" />
            </label>
            <label className="text-ink text-[12px] font-bold">תוכן המייל
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} className="border-line text-ink mt-1 w-full rounded-xl border px-3 py-2 text-[12.5px] leading-relaxed outline-none" />
            </label>
            <p className="text-muted text-[10.5px]">אפשר להשתמש ב־{"{first_name}"}, {"{property_title}"}, {"{property_price}"}, {"{property_location}"}, {"{public_property_url}"} — יוחלפו אוטומטית לכל נמען.</p>
          </div>
        )}

        {alreadyCount > 0 && (
          <label className="mb-3 flex items-center gap-2 rounded-xl bg-amber-50 p-2.5 text-[12px] font-semibold text-amber-800">
            <input type="checkbox" checked={allowResend} onChange={(e) => setAllowResend(e.target.checked)} className="accent-brand h-4 w-4" />
            {alreadyCount} כבר קיבלו את הנכס — שלח להם שוב
          </label>
        )}

        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-muted hover:text-ink px-3 py-2 text-[13px] font-bold">ביטול</button>
          <button onClick={() => onSend({ allowResend, emailSubject: subject, emailBody: body })} disabled={pending}
            className="bg-brand inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-60">
            {pending ? <Icon name="Loader" size={15} className="animate-spin" /> : <Icon name="Send" size={15} />}
            {pending ? "שולח…" : "שלח"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, n, muted }: { label: string; n: number; muted?: boolean }) {
  return <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${muted ? "bg-surface text-muted" : "bg-brand-soft text-brand"}`}>{label}: {n}</span>;
}

function ResultSummary({ result, onClose }: { result: SendOutreachResult; onClose: () => void }) {
  const [detail, setDetail] = useState(false);
  const waFail = result.recipients.filter((r) => r.outcomes.some((o) => o.channel === "whatsapp" && o.state === "skipped")).length;
  const emailFail = result.recipients.filter((r) => r.outcomes.some((o) => o.channel === "email" && o.state === "skipped")).length;
  const skippedNoChannel = result.recipients.filter((r) => !r.delivered).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div className="bg-card w-full max-w-lg rounded-t-3xl sm:rounded-3xl border-line border p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <span className="bg-success-soft text-success grid h-8 w-8 place-items-center rounded-full"><Icon name="Check" size={18} /></span>
          <h3 className="text-ink text-[15px] font-black">השליחה הושלמה</h3>
        </div>
        <div className="flex flex-col gap-2 text-[13px]">
          <Row label="WhatsApp" ok={result.viaWhatsapp} fail={waFail} />
          <Row label="מייל" ok={result.viaEmail} fail={emailFail} />
          {result.deferred > 0 && <p className="text-muted text-[12px]">{result.deferred} נשלחים מאוחר יותר (שעות שקטות)</p>}
          {skippedNoChannel > 0 && <p className="text-muted text-[12px]">{skippedNoChannel} דולגו — ללא ערוץ זמין או כבר קיבלו</p>}
        </div>

        <button onClick={() => setDetail((d) => !d)} className="text-brand mt-3 text-[12px] font-bold">{detail ? "הסתר פירוט" : "הצג פירוט"}</button>
        {detail && (
          <ul className="mt-2 max-h-52 overflow-auto text-[12px]">
            {result.recipients.map((r) => (
              <li key={r.buyerId} className="border-line flex items-center justify-between gap-2 border-b py-1.5 last:border-0">
                <span className="text-ink font-bold">{r.name}</span>
                <span className="text-muted">{r.outcomes.map((o) => {
                  const label = o.channel === "whatsapp" ? "WhatsApp" : "מייל";
                  const st = o.state === "sent" ? "נשלח" : o.state === "deferred" ? "מתוזמן" : ("reason" in o ? (REASON_HE[o.reason] ?? "דולג") : "דולג");
                  return `${label}: ${st}`;
                }).join(" · ")}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="bg-brand rounded-xl px-4 py-2 text-[13px] font-bold text-white">סגור</button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, ok, fail }: { label: string; ok: number; fail: number }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-ink w-20 font-bold">{label}</span>
      <span className="text-success inline-flex items-center gap-1"><Icon name="Check" size={13} />{ok} נשלחו</span>
      {fail > 0 && <span className="inline-flex items-center gap-1 text-amber-600"><Icon name="AlertTriangle" size={13} />{fail} נכשל</span>}
    </div>
  );
}
