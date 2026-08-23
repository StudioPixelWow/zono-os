"use client";
// ============================================================================
// ZONO — Buyer Command Center 5.0: the SHORTLIST workspace (client).
// The broker curates a personal selection from the buyer's real matches, then
// sends ONE persistent personal-portal link (WhatsApp / email / both). Reuses the
// canonical match engine (getBuyerMatchCandidatesAction) and the persistent portal
// link — no per-property links, no second match source. RTL, Hebrew.
// ============================================================================
import { useEffect, useMemo, useState, useTransition } from "react";
import { Icon } from "@/components/dashboard/Icon";
import {
  getBuyerMatchCandidatesAction,
  getShortlistAction,
  addToShortlistAction,
  removeFromShortlistAction,
  sendShortlistPortalAction,
  type MatchCandidate,
} from "@/lib/buyer-shortlist/actions";
import type { ShortlistItem } from "@/lib/buyer-shortlist/service";

const ils = (n: number | null) => (n == null ? "" : n >= 1_000_000 ? `₪${(n / 1_000_000).toFixed(2)}M` : `₪${Math.round(n).toLocaleString("he-IL")}`);
const STATE_LABEL: Record<string, string> = {
  selected: "בבחירה", sent: "נשלח", viewed: "נצפה", liked: "אהב/ה", rejected: "לא מתאים", visit_requested: "ביקש/ה ביקור",
};

export function BuyerShortlistPanel({ buyerId }: { buyerId: string }) {
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [shortlist, setShortlist] = useState<ShortlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = () => Promise.all([getBuyerMatchCandidatesAction(buyerId), getShortlistAction(buyerId)]).then(([c, s]) => {
    if (c.ok) setCandidates(c.data);
    if (s.ok) setShortlist(s.data);
    setLoading(false);
  });
  useEffect(() => { let alive = true; load().then(() => { if (!alive) return; }); return () => { alive = false; }; }, [buyerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const shortlisted = useMemo(() => new Set(shortlist.map((s) => s.propertyId)), [shortlist]);
  const toAdd = candidates.filter((c) => !shortlisted.has(c.propertyId));

  const add = (propertyId: string) => startTransition(async () => { const r = await addToShortlistAction(buyerId, propertyId); if (r.ok) await load(); else setMsg(r.error); });
  const remove = (propertyId: string) => startTransition(async () => { const r = await removeFromShortlistAction(buyerId, propertyId); if (r.ok) await load(); else setMsg(r.error); });
  const send = (channels: { whatsapp: boolean; email: boolean }) => startTransition(async () => {
    const r = await sendShortlistPortalAction(buyerId, channels);
    if (r.ok) {
      const parts = [r.data.viaWhatsapp && "WhatsApp", r.data.viaEmail && "מייל", r.data.deferred && "מתוזמן"].filter(Boolean).join(" + ");
      setMsg(r.data.sent ? `הבחירה נשלחה${parts ? ` (${parts})` : ""}` : "לא נשלח — אין ערוץ זמין או הסכמה");
      await load();
    } else setMsg(r.error);
  });

  if (loading) return <div className="bg-card border-line rounded-[20px] border p-5 text-center text-muted text-sm">טוען בחירה אישית…</div>;

  return (
    <div className="bg-card border-line rounded-[20px] border p-5">
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name="ListChecks" size={16} /></span>
        <h3 className="text-ink text-sm font-extrabold">בחירה אישית לקונה</h3>
        <span className="text-muted text-xs">· {shortlist.length} נכסים</span>
      </div>

      {/* Curated shortlist + send */}
      {shortlist.length === 0 ? (
        <p className="text-muted mb-4 text-xs">עדיין לא נבחרו נכסים. הוסיפו מההתאמות למטה כדי לבנות בחירה אישית ולשלוח אותה לקונה בקישור אחד.</p>
      ) : (
        <>
          <ul className="mb-3 flex flex-col gap-2">
            {shortlist.map((s) => (
              <li key={s.propertyId} className="border-line flex items-center gap-3 rounded-2xl border p-2.5">
                {s.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={s.imageUrl} alt="" className="h-11 w-11 shrink-0 rounded-xl object-cover" />
                  : <span className="bg-surface grid h-11 w-11 shrink-0 place-items-center rounded-xl">🏠</span>}
                <div className="min-w-0 flex-1">
                  <p className="text-ink truncate text-[13px] font-bold">{s.title}</p>
                  <p className="text-muted truncate text-[11px]">{[s.city, s.rooms ? `${s.rooms} חד'` : "", ils(s.price)].filter(Boolean).join(" · ")}</p>
                  {s.reason && <p className="text-brand truncate text-[11px]">✓ {s.reason}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${s.state === "liked" || s.state === "visit_requested" ? "bg-success-soft text-success" : s.state === "rejected" ? "bg-surface text-muted" : "bg-brand-soft text-brand"}`}>{STATE_LABEL[s.state] ?? s.state}</span>
                <button onClick={() => remove(s.propertyId)} disabled={pending} className="text-muted hover:text-ink shrink-0"><Icon name="X" size={15} /></button>
              </li>
            ))}
          </ul>
          <div className="border-line flex flex-wrap items-center gap-1.5 rounded-2xl border p-2.5">
            <span className="text-ink px-1 text-[12.5px] font-black">שלח בחירה:</span>
            <button onClick={() => send({ whatsapp: true, email: false })} disabled={pending} className="border-line text-ink hover:bg-surface inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[12px] font-bold"><Icon name="MessageCircle" size={13} />WhatsApp</button>
            <button onClick={() => send({ whatsapp: false, email: true })} disabled={pending} className="border-line text-ink hover:bg-surface inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[12px] font-bold"><Icon name="Mail" size={13} />מייל</button>
            <button onClick={() => send({ whatsapp: true, email: true })} disabled={pending} className="bg-brand inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[12px] font-bold text-white"><Icon name="Send" size={13} />שניהם</button>
          </div>
        </>
      )}

      {msg && <p className="text-brand-strong mt-2 text-[12px] font-bold">{msg}</p>}

      {/* Add from matches */}
      {toAdd.length > 0 && (
        <div className="mt-4">
          <p className="text-muted mb-2 text-[11.5px] font-bold">התאמות להוספה</p>
          <ul className="flex flex-col gap-1.5">
            {toAdd.slice(0, 8).map((c) => (
              <li key={c.propertyId} className="border-line flex items-center gap-2 rounded-2xl border p-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-ink truncate text-[12.5px] font-bold">{c.title}</p>
                    {c.compatibility != null && <span className="text-brand text-[11px] font-black">{c.compatibility}%</span>}
                  </div>
                  {c.reason && <p className="text-muted truncate text-[11px]">✓ {c.reason}</p>}
                </div>
                <span className="text-muted shrink-0 text-[11px]">{ils(c.price)}</span>
                <button onClick={() => add(c.propertyId)} disabled={pending} className="bg-brand-soft text-brand inline-flex shrink-0 items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-[11.5px] font-bold hover:opacity-90"><Icon name="Plus" size={13} />הוסף</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
