"use client";
// ============================================================================
// 🤝 ZONO — AI Negotiation Assistant view (mobile-first RTL). PHASE 59.0.
// Property + offers input → strategy, offer comparison, talking points, meeting
// prep and DRAFT-ONLY message suggestions. Legal questions trigger a handoff
// banner; missing valuation is stated (never fabricated). Nothing is sent.
// ============================================================================
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { buildNegotiationPlanAction } from "@/lib/negotiation-assistant/actions";
import type { NegotiationPlan, OfferInput } from "@/lib/negotiation-assistant/types";
import type { NegotiationPropertyLite } from "@/lib/negotiation-assistant/service";

const STANCE_CLS: Record<string, string> = { hold: "bg-warning-soft text-warning", counter: "bg-brand-soft text-brand", accept: "bg-success-soft text-success", gather: "bg-surface text-muted" };
type OfferRow = { buyerName: string; amount: string; hasFinancing: boolean; preapproved: boolean };

export function NegotiationView({ properties }: { properties: NegotiationPropertyLite[] }) {
  const [propertyId, setPropertyId] = useState(properties[0]?.id ?? "");
  const [valuation, setValuation] = useState("");
  const [sellerFlex, setSellerFlex] = useState("");
  const [buyerUrg, setBuyerUrg] = useState("");
  const [offers, setOffers] = useState<OfferRow[]>([{ buyerName: "", amount: "", hasFinancing: false, preapproved: false }]);
  const [plan, setPlan] = useState<NegotiationPlan | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const setOffer = (i: number, patch: Partial<OfferRow>) => setOffers((o) => o.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addOffer = () => setOffers((o) => [...o, { buyerName: "", amount: "", hasFinancing: false, preapproved: false }]);

  const build = () => {
    setErr(null);
    const parsedOffers: OfferInput[] = offers
      .filter((o) => o.buyerName.trim() || o.amount.trim())
      .map((o, i) => ({ id: `o${i}`, buyerName: o.buyerName.trim() || `הצעה ${i + 1}`, amount: o.amount ? Number(o.amount.replace(/[^\d]/g, "")) : null, hasFinancing: o.hasFinancing, preapproved: o.preapproved, contingencies: [], submittedAt: null }));
    start(async () => {
      const r = await buildNegotiationPlanAction({
        propertyId,
        offers: parsedOffers,
        valuationEstimate: valuation ? Number(valuation.replace(/[^\d]/g, "")) : null,
        sellerFlexibility: sellerFlex ? Number(sellerFlex) : null,
        buyerUrgency: buyerUrg ? Number(buyerUrg) : null,
      });
      if (r.error) { setErr(r.error); setPlan(null); }
      else if (r.plan) setPlan(r.plan);
    });
  };

  return (
    <div dir="rtl" className="mx-auto max-w-2xl px-4 pb-24 pt-5">
      <div className="bg-brand-soft rounded-[22px] p-5">
        <p className="text-brand text-xs font-bold">ZONO · עוזר מו״מ</p>
        <h1 className="text-ink mt-1 text-2xl font-black">🤝 עוזר משא ומתן</h1>
        <p className="text-muted mt-1 text-sm leading-relaxed">אסטרטגיה, תסריטים והכנה לפגישה. ללא ייעוץ משפטי, ללא הבטחות פיננסיות, ללא המצאת הערכות שווי — וכל טיוטה דורשת אישור לפני שליחה.</p>
      </div>

      {/* Inputs */}
      <div className="bg-card border-line mt-4 space-y-3 rounded-[20px] border p-4">
        <div>
          <label className="text-muted text-[11px] font-bold">נכס</label>
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="bg-surface border-line text-ink mt-1 h-10 w-full rounded-xl border px-3 text-sm outline-none">
            {properties.length === 0 && <option value="">אין נכסים פעילים</option>}
            {properties.map((p) => <option key={p.id} value={p.id}>{p.title}{p.price ? ` · ₪${p.price.toLocaleString("he-IL")}` : ""}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="הערכת שווי (₪, אופציונלי)" value={valuation} onChange={setValuation} placeholder="לא חובה" />
          <Field label="גמישות מוכר 0-100" value={sellerFlex} onChange={setSellerFlex} placeholder="—" />
          <Field label="דחיפות קונה 0-100" value={buyerUrg} onChange={setBuyerUrg} placeholder="—" />
        </div>

        <div>
          <label className="text-muted text-[11px] font-bold">הצעות על השולחן</label>
          <div className="mt-1 space-y-2">
            {offers.map((o, i) => (
              <div key={i} className="bg-surface flex flex-wrap items-center gap-2 rounded-xl p-2">
                <input value={o.buyerName} onChange={(e) => setOffer(i, { buyerName: e.target.value })} placeholder="שם קונה" className="border-line text-ink h-8 min-w-[110px] flex-1 rounded-lg border bg-white px-2 text-[13px] outline-none" />
                <input value={o.amount} onChange={(e) => setOffer(i, { amount: e.target.value })} placeholder="סכום ₪" inputMode="numeric" className="border-line text-ink h-8 w-28 rounded-lg border bg-white px-2 text-[13px] outline-none" />
                <label className="text-muted flex items-center gap-1 text-[11px] font-bold"><input type="checkbox" checked={o.hasFinancing} onChange={(e) => setOffer(i, { hasFinancing: e.target.checked })} /> מימון</label>
                <label className="text-muted flex items-center gap-1 text-[11px] font-bold"><input type="checkbox" checked={o.preapproved} onChange={(e) => setOffer(i, { preapproved: e.target.checked })} /> אישור עקרוני</label>
              </div>
            ))}
          </div>
          <button onClick={addOffer} className="text-brand-strong mt-2 text-[12px] font-bold">+ הוסף הצעה</button>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={build} disabled={pending || !propertyId} loading={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>בנה תוכנית מו״מ</Button>
        </div>
      </div>

      {err && <p className="bg-danger-soft text-danger mt-4 rounded-xl px-3 py-2 text-sm font-semibold">{err}</p>}

      {plan && <PlanView plan={plan} />}
    </div>
  );
}

function PlanView({ plan }: { plan: NegotiationPlan }) {
  return (
    <div className="mt-4 space-y-4">
      {plan.legalHandoff.triggered && (
        <div className="bg-danger-soft text-danger rounded-[18px] p-4">
          <p className="text-[13px] font-black">⚖️ שאלה משפטית — הפניה</p>
          <p className="mt-1 text-[12px] leading-relaxed">{plan.legalHandoff.message}</p>
        </div>
      )}

      {/* Strategy */}
      <div className="bg-card border-line rounded-[20px] border p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-ink text-lg font-black">אסטרטגיה</h2>
          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", STANCE_CLS[plan.strategy.stance])}>{plan.strategy.stanceHe}</span>
        </div>
        <p className="text-muted mt-1 text-[13px]">{plan.strategy.rationale}</p>
        {plan.strategy.counterRange && <p className="text-brand-strong mt-1 text-[12px] font-bold">טווח הצעה נגדית: {plan.strategy.counterRange.minPct}% עד {plan.strategy.counterRange.maxPct}% מהמחיר המבוקש</p>}
        <p className="text-muted mt-1 text-[11px]">🔒 {plan.strategy.note}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip label={`ביטחון ${plan.strategy.confidence}`} />
          <Chip label={`גמישות מוכר: ${plan.sellerFlexibility.label}`} />
          <Chip label={`דחיפות קונה: ${plan.buyerUrgency.label}`} />
          <Chip label={`סיכון: ${plan.risk.level}`} tone={plan.risk.level === "high" ? "text-danger" : plan.risk.level === "medium" ? "text-warning" : "text-muted"} />
        </div>
      </div>

      {plan.offers.length > 0 && (
        <Section title={`השוואת הצעות (${plan.offers.length})`} icon="Handshake">
          <div className="space-y-2">{plan.offers.map((o) => (
            <div key={o.id} className="bg-surface flex items-center justify-between gap-2 rounded-xl p-3">
              <div className="min-w-0"><p className="text-ink text-[13px] font-bold">{o.rank}. {o.buyerName}{o.amount ? ` · ₪${o.amount.toLocaleString("he-IL")}` : ""}</p><p className="text-muted text-[11px]">{o.note}{o.gapToAskingPct != null ? ` · ${o.gapToAskingPct}% מהמבוקש` : ""}</p></div>
              <span className="bg-brand-soft text-brand shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold">חוזק {o.strength}</span>
            </div>
          ))}</div>
        </Section>
      )}

      {plan.objections.length > 0 && (
        <Section title="התנגדויות ומענה" icon="AlertTriangle">
          <div className="space-y-2">{plan.objections.map((o, i) => (
            <div key={i} className="bg-surface rounded-xl p-3"><p className="text-ink text-[13px] font-bold">{o.label}</p><p className="text-muted text-[12px]">{o.rebuttal}</p></div>
          ))}</div>
        </Section>
      )}

      <Section title="נקודות שיחה" icon="MessageCircle">
        <ul className="space-y-1">{plan.talkingPoints.map((t, i) => <li key={i} className="text-muted text-[13px]">• {t}</li>)}</ul>
      </Section>

      <Section title="טיוטות הודעה (לאישור בלבד)" icon="Send">
        <div className="space-y-2">{plan.drafts.map((d, i) => <DraftCard key={i} channel={d.channel} purpose={d.purpose} body={d.body} disclaimer={d.disclaimer} />)}</div>
      </Section>

      <Section title="הכנה לפגישה" icon="ListChecks">
        <ul className="space-y-1">{plan.meetingPrep.map((m, i) => <li key={i} className="text-muted text-[13px]">• {m}</li>)}</ul>
      </Section>

      {plan.risk.missingData.length > 0 && <p className="text-muted text-[11px]">חסר לחיזוק: {plan.risk.missingData.join(" · ")}</p>}
      {plan.notes.map((n, i) => <p key={i} className="text-muted text-[11px] leading-relaxed">🔒 {n}</p>)}
    </div>
  );
}

function DraftCard({ channel, purpose, body, disclaimer }: { channel: string; purpose: string; body: string; disclaimer: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(body); setCopied(true); } catch { /* ignore */ } };
  return (
    <div className="bg-surface rounded-xl p-3">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-ink text-[12px] font-bold">{channel === "whatsapp" ? "וואטסאפ" : "אימייל"} · {purpose}</p>
        <span className="bg-warning-soft text-warning rounded-full px-2 py-0.5 text-[10px] font-bold">טיוטה · דורש אישור</span>
      </div>
      <p className="text-muted whitespace-pre-line text-[12.5px] leading-relaxed">{body}</p>
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={copy} leadingIcon={<Icon name="Copy" size={13} />}>{copied ? "הועתק ✓" : "העתק טיוטה"}</Button>
      </div>
      <p className="text-muted mt-1 text-[10px]">🔒 {disclaimer}</p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div><label className="text-muted text-[11px] font-bold">{label}</label><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode="numeric" className="bg-surface border-line text-ink mt-1 h-9 w-full rounded-xl border px-2 text-[13px] outline-none" /></div>;
}
function Chip({ label, tone = "text-muted" }: { label: string; tone?: string }) {
  return <span className={cn("bg-surface rounded-full px-2.5 py-1 text-[11px] font-bold", tone)}>{label}</span>;
}
function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return <div className="bg-card border-line rounded-[20px] border p-4"><div className="mb-3 flex items-center gap-2"><span className="text-brand"><Icon name={icon} size={16} /></span><h3 className="text-ink text-sm font-extrabold">{title}</h3></div>{children}</div>;
}
