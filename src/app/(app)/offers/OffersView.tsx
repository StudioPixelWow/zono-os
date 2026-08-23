"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import {
  createOfferAction, submitOfferAction, sellerResponseAction, counterOfferAction, acceptOfferAction,
  rejectOfferAction, withdrawOfferAction, expireOfferAction, convertOfferToDealAction, getOfferDetailAction,
  offerFormOptionsAction, type OfferFormOptions,
} from "@/lib/offers/actions";
import type { OfferDetail, OfferStatus } from "@/lib/offers/service";
import { OFFER_FILTER_TABS, OFFER_SORT_OPTIONS, type HydratedOffer, type OffersBoardPage } from "@/lib/offers/board";

const STATUS_LABEL: Record<OfferStatus, string> = {
  draft: "טיוטה", submitted: "הוגשה", countered: "הצעה נגדית", accepted: "אושרה",
  rejected: "נדחתה", withdrawn: "בוטלה", expired: "פג תוקף",
};
const STATUS_TONE: Record<OfferStatus, string> = {
  draft: "bg-surface text-muted", submitted: "bg-brand-soft text-brand-strong", countered: "bg-warning-soft text-warning",
  accepted: "bg-success-soft text-success", rejected: "bg-danger-soft text-danger", withdrawn: "bg-surface text-muted", expired: "bg-surface text-muted",
};
const ils = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const field = "bg-surface border-line text-ink focus:border-brand-light h-9 w-full rounded-xl border px-3 text-sm outline-none";

export function OffersView({ board, lockBuyerId, lockPropertyId }: { board: OffersBoardPage; lockBuyerId: string | null; lockPropertyId: string | null }) {
  const r = useActionRunner();
  const router = useRouter();
  const sp = useSearchParams();
  const [showNew, setShowNew] = useState(Boolean(lockBuyerId || lockPropertyId));

  const setParam = useCallback((patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v == null || v === "") next.delete(k); else next.set(k, v); }
    if (resetPage && !("page" in patch)) next.delete("page");
    router.push(`/offers?${next.toString()}`, { scroll: false });
  }, [router, sp]);

  const filter = sp.get("filter") ?? "all";
  const sort = sp.get("sort") ?? "recent";
  const urlQ = sp.get("q") ?? "";
  const [qLocal, setQLocal] = useState(urlQ);
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ);
  if (urlQ !== prevUrlQ) { setPrevUrlQ(urlQ); setQLocal(urlQ); }
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSearch = (v: string) => {
    setQLocal(v);
    if (qTimer.current) clearTimeout(qTimer.current);
    qTimer.current = setTimeout(() => setParam({ q: v.trim() || null }), 350);
  };

  const from = board.total === 0 ? 0 : (board.page - 1) * board.pageSize + 1;
  const to = Math.min(board.page * board.pageSize, board.total);
  const selectCls = "bg-surface border-line text-ink focus:border-brand-light h-9 rounded-xl border px-2.5 text-[12.5px] font-semibold outline-none";

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4 py-6">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Send" size={18} /></span>
          <div>
            <h1 className="text-ink text-2xl font-black">הצעות ומשא ומתן</h1>
            <p className="text-muted text-sm">ניהול הצעות מקצה לקצה — מסלול משא-ומתן מלא, ובלחיצה: המרה לעסקה.</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setShowNew((s) => !s)}><Icon name="Plus" size={14} />הצעה חדשה</Button>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="פתוחות" value={board.kpis.open} tone="text-brand-strong" />
        <Stat label="ממתין למוכר" value={board.kpis.awaitingSeller} tone="text-warning" />
        <Stat label="ממתין לקונה" value={board.kpis.awaitingBuyer} tone="text-warning" />
        <Stat label="אושרו" value={board.kpis.accepted} tone="text-success" />
      </div>

      <ActionFeedback runner={r} />
      {showNew && <NewOfferForm r={r} lockBuyerId={lockBuyerId} lockPropertyId={lockPropertyId} onDone={() => { setShowNew(false); router.refresh(); }} />}

      {/* Search + sort */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <span className="text-muted pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"><Icon name="Search" size={15} /></span>
          <input value={qLocal} onChange={(e) => onSearch(e.target.value)} placeholder="חיפוש לפי נכס, קונה או סכום" className="bg-surface border-line text-ink focus:border-brand-light h-9 w-full rounded-xl border pr-9 pl-3 text-[13px] outline-none" />
        </div>
        <select value={sort} onChange={(e) => setParam({ sort: e.target.value }, false)} className={selectCls} aria-label="מיון">
          {OFFER_SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <nav className="border-line flex flex-wrap gap-1 border-b">
        {OFFER_FILTER_TABS.map((t) => (
          <button key={t.value} onClick={() => setParam({ filter: t.value === "all" ? null : t.value })} className={`px-3 py-2 text-sm font-bold ${filter === t.value ? "text-brand-strong border-brand border-b-2" : "text-muted"}`}>{t.label}</button>
        ))}
      </nav>

      {board.truncated && <div className="bg-warning-soft text-warning rounded-xl px-3 py-2 text-[12.5px] font-bold">מוצגות ההצעות העדכניות ביותר. צמצם עם סינון או חיפוש כדי לראות אחרות.</div>}

      {board.rows.length === 0 ? (
        <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">אין הצעות להצגה</div>
      ) : (
        <>
          <div className="flex flex-col gap-2">{board.rows.map((o) => <OfferCard key={o.id} o={o} r={r} onChanged={() => router.refresh()} />)}</div>
          {board.total > board.pageSize && (
            <div className="text-muted flex flex-wrap items-center justify-between gap-2 px-1 text-[12px]">
              <span>מציג {from}–{to} מתוך {board.total}</span>
              <div className="flex items-center gap-1.5">
                <button disabled={board.page <= 1} onClick={() => setParam({ page: String(board.page - 1) }, false)} className="border-line bg-surface text-ink grid h-8 w-8 place-items-center rounded-lg border transition disabled:opacity-40"><Icon name="ChevronRight" size={15} /></button>
                <span className="min-w-[60px] text-center font-bold">{board.page} / {board.pageCount}</span>
                <button disabled={board.page >= board.pageCount} onClick={() => setParam({ page: String(board.page + 1) }, false)} className="border-line bg-surface text-ink grid h-8 w-8 place-items-center rounded-lg border transition disabled:opacity-40"><Icon name="ChevronLeft" size={15} /></button>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-card border-line flex flex-col gap-1 rounded-2xl border p-4 shadow-sm">
      <span className={`text-[12px] font-bold ${tone}`}>{label}</span>
      <span className="text-ink text-2xl font-black">{value}</span>
    </div>
  );
}

type Runner = ReturnType<typeof useActionRunner>;

function NewOfferForm({ r, onDone, lockBuyerId, lockPropertyId }: { r: Runner; onDone: () => void; lockBuyerId?: string | null; lockPropertyId?: string | null }) {
  const [opts, setOpts] = useState<OfferFormOptions | null>(null);
  const [buyerId, setBuyerId] = useState(lockBuyerId ?? "");
  const [propertyId, setPropertyId] = useState(lockPropertyId ?? "");
  const [amount, setAmount] = useState("");
  const [financing, setFinancing] = useState("");
  const [entry, setEntry] = useState("");
  const [expires, setExpires] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => { let live = true; offerFormOptionsAction().then((o) => { if (live) setOpts(o); }).catch(() => { if (live) setOpts({ buyers: [], properties: [] }); }); return () => { live = false; }; }, []);

  const canSubmit = Boolean(buyerId && propertyId);
  const submit = () =>
    r.run(async () => {
      const res = await createOfferAction({
        buyerId, propertyId,
        amount: amount ? Number(amount) : null, financing: financing || null,
        requestedEntryDate: entry || null, expiresAt: expires || null, note: note || null,
      });
      if (res.error) throw new Error(res.error);
      onDone();
      return res;
    }, { id: "offer-new", pendingMessage: "יוצר טיוטה...", success: () => "טיוטת הצעה נוצרה ✓" });

  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
      <h2 className="text-ink text-base font-extrabold">הצעה חדשה (טיוטה)</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-muted text-[11px] font-bold">קונה *</span>
          <select className={field} value={buyerId} disabled={Boolean(lockBuyerId)} onChange={(e) => setBuyerId(e.target.value)}>
            <option value="">{opts ? "בחר קונה" : "טוען..."}</option>
            {opts?.buyers.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted text-[11px] font-bold">נכס *</span>
          <select className={field} value={propertyId} disabled={Boolean(lockPropertyId)} onChange={(e) => setPropertyId(e.target.value)}>
            <option value="">{opts ? "בחר נכס" : "טוען..."}</option>
            {opts?.properties.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">סכום ההצעה (₪)</span><input className={field} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))} placeholder="1620000" /></label>
        <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">מימון / תנאי</span><input className={field} value={financing} onChange={(e) => setFinancing(e.target.value)} placeholder="משכנתא / מזומן" /></label>
        <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">תאריך כניסה מבוקש</span><input type="date" className={field} value={entry} onChange={(e) => setEntry(e.target.value)} /></label>
        <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">תוקף ההצעה עד</span><input type="date" className={field} value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
      </div>
      <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">הערה</span><input className={field} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <Button className="w-fit" disabled={!canSubmit} loading={r.busyId === "offer-new"} onClick={submit}><Icon name="Plus" size={14} />צור טיוטה</Button>
      <p className="text-muted text-[11px]">המוכר נגזר אוטומטית מבעל הנכס. חובה לבחור קונה ונכס כדי לקשר את ההצעה.</p>
    </div>
  );
}

function OfferCard({ o, r, onChanged }: { o: HydratedOffer; r: Runner; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<OfferDetail | null>(null);
  const [counter, setCounter] = useState("");

  const toggle = async () => {
    const next = !open; setOpen(next);
    if (next && !detail) { try { setDetail(await getOfferDetailAction(o.id)); } catch { /* silent */ } }
  };
  const wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) =>
    r.run(async () => { const res = await fn(); if (res.error) throw new Error(res.error); onChanged(); return res; }, { id, pendingMessage: pending, success: (x) => x.message ?? null });

  const amt = () => (counter ? Number(counter) : o.amount ?? 0);
  const isOpen = ["draft", "submitted", "countered"].includes(o.status);

  return (
    <div className="bg-card border-line rounded-2xl border p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-ink truncate text-[13px] font-bold">{o.propertyTitle || "נכס ללא כותרת"}{o.buyerName ? ` · ${o.buyerName}` : ""}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <p className="text-ink text-lg font-black">{ils(o.amount)}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[o.status]}`}>{STATUS_LABEL[o.status]}</span>
            {o.original_amount != null && o.original_amount !== o.amount && <span className="text-muted text-[11px]">מקורי {ils(o.original_amount)}</span>}
          </div>
          <p className="text-muted mt-0.5 text-[12px]">{o.nextAction}{o.expires_at ? ` · תוקף עד ${new Date(o.expires_at).toLocaleDateString("he-IL")}` : ""}</p>
        </div>
        <button onClick={toggle} className="text-brand-strong whitespace-nowrap text-[12px] font-bold">{open ? "סגור" : "פרטים ומסלול"}</button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {o.status === "draft" && <Button size="sm" loading={r.busyId === `sub-${o.id}`} onClick={() => wrap(() => submitOfferAction(o.id), `sub-${o.id}`, "מגיש...")}><Icon name="Send" size={14} />הגש</Button>}
        {o.status === "submitted" && (<>
          <input className={`${field} max-w-[140px]`} inputMode="numeric" value={counter} onChange={(e) => setCounter(e.target.value.replace(/[^\d]/g, ""))} placeholder="סכום נגדי" />
          <Button size="sm" variant="secondary" loading={r.busyId === `sc-${o.id}`} onClick={() => wrap(() => sellerResponseAction(o.id, "counter", amt()), `sc-${o.id}`, "רושם...")}>הצעה נגדית (מוכר)</Button>
          <Button size="sm" loading={r.busyId === `acc-${o.id}`} onClick={() => wrap(() => acceptOfferAction(o.id), `acc-${o.id}`, "מאשר...")}><Icon name="Check" size={14} />אשר</Button>
          <Button size="sm" variant="ghost" loading={r.busyId === `rej-${o.id}`} onClick={() => wrap(() => rejectOfferAction(o.id), `rej-${o.id}`)}>דחה</Button>
          <Button size="sm" variant="ghost" loading={r.busyId === `exp-${o.id}`} onClick={() => wrap(() => expireOfferAction(o.id), `exp-${o.id}`)}>פג תוקף</Button>
        </>)}
        {o.status === "countered" && (<>
          <input className={`${field} max-w-[140px]`} inputMode="numeric" value={counter} onChange={(e) => setCounter(e.target.value.replace(/[^\d]/g, ""))} placeholder="סכום נגדי" />
          <Button size="sm" variant="secondary" loading={r.busyId === `bc-${o.id}`} onClick={() => wrap(() => counterOfferAction(o.id, amt()), `bc-${o.id}`, "רושם...")}>הצעה נגדית (קונה)</Button>
          <Button size="sm" loading={r.busyId === `acc-${o.id}`} onClick={() => wrap(() => acceptOfferAction(o.id), `acc-${o.id}`, "מאשר...")}><Icon name="Check" size={14} />אשר</Button>
          <Button size="sm" variant="ghost" loading={r.busyId === `exp-${o.id}`} onClick={() => wrap(() => expireOfferAction(o.id), `exp-${o.id}`)}>פג תוקף</Button>
        </>)}
        {isOpen && <Button size="sm" variant="ghost" loading={r.busyId === `wd-${o.id}`} onClick={() => wrap(() => withdrawOfferAction(o.id), `wd-${o.id}`)}>בטל</Button>}
        {o.status === "accepted" && !o.deal_id && <Button size="sm" loading={r.busyId === `conv-${o.id}`} onClick={() => wrap(() => convertOfferToDealAction(o.id), `conv-${o.id}`, "ממיר לעסקה...")}><Icon name="Plus" size={14} />המר לעסקה</Button>}
        {o.deal_id && <Link href={`/deals`} className="text-brand-strong text-[12px] font-bold">עבור לעסקה ↗</Link>}
      </div>

      {open && detail && (
        <div className="border-line mt-3 flex flex-col gap-2 border-t pt-3">
          {(detail.financing || detail.conditions || detail.included_items) && (
            <div className="text-[12px] text-ink">
              {detail.financing && <p>מימון: {detail.financing}</p>}
              {detail.conditions && <p>תנאים: {detail.conditions}</p>}
              {detail.included_items && <p>כלול: {detail.included_items}</p>}
            </div>
          )}
          <p className="text-ink text-[12px] font-bold">מסלול משא ומתן</p>
          <ol className="flex flex-col gap-1">
            {detail.events.map((e, i) => (
              <li key={i} className="text-muted text-[12px]">
                • {new Date(e.created_at).toLocaleString("he-IL")} — <span className="text-ink font-semibold">{eventLabel(e.event_type)}</span>
                {e.amount != null ? ` · ${ils(e.amount)}` : ""}{e.actor_side ? ` · ${sideLabel(e.actor_side)}` : ""}{e.note ? ` — ${e.note}` : ""}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function eventLabel(t: string): string {
  return ({ created: "נוצרה", submitted: "הוגשה", countered: "הצעה נגדית (קונה)", seller_response: "תשובת מוכר", accepted: "אושרה", rejected: "נדחתה", withdrawn: "בוטלה", expired: "פג תוקף", converted_to_deal: "הומרה לעסקה" } as Record<string, string>)[t] ?? t;
}
function sideLabel(s: string): string {
  return ({ buyer: "קונה", seller: "מוכר", agent: "סוכן" } as Record<string, string>)[s] ?? s;
}
