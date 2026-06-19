"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { createAcquisitionTaskAction, promoteExternalListingAction } from "@/lib/external-listings/actions";
import type { ExternalListingDetail } from "@/lib/external-listings/service";

const SOURCE_LABELS: Record<string, string> = { yad2: "יד2", madlan: "מדלן", facebook: "פייסבוק", manual_external: "ידני", partner_api: "שותף" };
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("he-IL") : "—");
const tone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");

function Section({ title, icon, children, action }: { title: string; icon: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-xl"><Icon name={icon} size={16} /></span>
          <h3 className="text-ink text-sm font-extrabold">{title}</h3>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-surface rounded-xl p-2.5">
      <p className="text-muted text-[11px] font-bold">{label}</p>
      <p className="text-ink text-sm font-bold">{value ?? "—"}</p>
    </div>
  );
}

export function ExternalListingDetailView({ detail }: { detail: ExternalListingDetail }) {
  const router = useRouter();
  const l = detail.listing;
  const { market, buyerMatches, dealPotential, ai } = detail;
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [pending, start] = useTransition();
  const images = Array.isArray(l.images) ? (l.images as string[]) : [];
  const sourceLabel = SOURCE_LABELS[l.source] ?? l.source;
  const privateOwner = l.has_agent === false;

  const promote = () => { setError(null); start(async () => { const r = await promoteExternalListingAction(l.id); if (r?.error) setError(r.error); }); };
  const acquire = () => { setError(null); setMsg(null); start(async () => { const r = await createAcquisitionTaskAction(l.id); if (r?.error) setError(r.error); else setMsg("נוצרה משימת גיוס נכס עם תסריט שיחה וצ׳קליסט ✓"); }); };
  const checkBuyers = () => { setMsg(null); setError(null); start(async () => { router.refresh(); setMsg("התאמות הקונים חושבו מחדש ✓"); }); };

  return (
    <div className="flex flex-col gap-5">
      <Link href="/properties?inv=external" className="text-muted hover:text-brand flex items-center gap-1 text-sm font-bold"><Icon name="ArrowLeft" size={15} /> חזרה למודעות חיצוניות</Link>

      {/* Header */}
      <div className="bg-card border-line rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="bg-brand-soft text-brand-strong rounded-lg px-2 py-0.5 text-xs font-bold">{sourceLabel}</span>
              <span className="bg-warning-soft text-warning rounded-lg px-2 py-0.5 text-[11px] font-bold">מודעה חיצונית</span>
              {dealPotential >= 60 && <span className="bg-success-soft text-success rounded-lg px-2 py-0.5 text-[11px] font-bold">דו״צ פוטנציאלי {dealPotential}</span>}
            </div>
            <h1 className="text-ink text-xl font-black">{l.title ?? "מודעה חיצונית"}</h1>
            <p className="text-muted mt-1 text-sm">{[l.neighborhood, l.city].filter(Boolean).join(", ") || "—"} · סונכרן לאחרונה {fmtDate(l.last_synced_at)}</p>
          </div>
          <div className="text-end">
            <p className="text-muted text-[11px] font-bold">ציון הזדמנות</p>
            <p className={cn("text-3xl font-black", tone(l.opportunity_score))}>{l.opportunity_score}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <Field label="מחיר" value={l.price ? formatShekels(l.price) : "—"} />
          <Field label="חדרים" value={l.rooms ?? "—"} />
          <Field label="מ״ר" value={l.sqm ?? "—"} />
          <Field label="עיר" value={l.city ?? "—"} />
          <Field label="שכונה" value={l.neighborhood ?? "—"} />
        </div>
      </div>

      {/* Source protection notice */}
      <div className="bg-warning-soft border-warning/30 flex items-start gap-2 rounded-[18px] border p-4">
        <Icon name="Shield" size={18} className="text-warning mt-0.5 shrink-0" />
        <div className="text-sm">
          <p className="text-ink font-bold">מקור: {sourceLabel} · סוג מלאי: מודעה חיצונית · זכויות: מידע ציבורי בלבד</p>
          <p className="text-muted mt-0.5">מידע זה מוצג ממקור חיצוני ואינו מהווה נכס בבלעדיות המשרד.</p>
        </div>
      </div>

      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}

      {/* Smart actions */}
      <div className="flex flex-wrap gap-2">
        {l.listing_url && (
          <Button size="sm" variant="secondary" onClick={() => setShowSource(true)} leadingIcon={<Icon name="Maximize2" size={15} />}>פתח במקור</Button>
        )}
        {l.promoted_property_id ? (
          <Link href={`/properties/${l.promoted_property_id}`}><Button size="sm" variant="secondary">קודם ל-CRM ✓ — פתח נכס</Button></Link>
        ) : (
          <Button size="sm" onClick={promote} disabled={pending} leadingIcon={<Icon name="Plus" size={15} />}>קדם ל-CRM</Button>
        )}
        <Button size="sm" variant="secondary" onClick={checkBuyers} disabled={pending} leadingIcon={<Icon name="Users" size={15} />}>בדוק התאמות לקונים</Button>
        <Button size="sm" variant="ghost" onClick={acquire} disabled={pending} leadingIcon={<Icon name="Megaphone" size={15} />}>צור משימת גיוס נכס</Button>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 1) Overview */}
        <Section title="סקירה" icon="Home">
          <p className="text-ink text-sm leading-relaxed">{ai.ai_summary}</p>
          {l.description && <p className="text-muted mt-2 whitespace-pre-wrap text-xs leading-relaxed">{l.description}</p>}
        </Section>

        {/* 7) Opportunity Analysis */}
        <Section title="ניתוח הזדמנות" icon="Sparkles">
          <div className="mb-2 flex items-center gap-3">
            <div><p className="text-muted text-[11px] font-bold">ציון הזדמנות</p><p className={cn("text-2xl font-black", tone(l.opportunity_score))}>{l.opportunity_score}</p></div>
            <div><p className="text-muted text-[11px] font-bold">פוטנציאל דו״צ</p><p className={cn("text-2xl font-black", tone(dealPotential))}>{dealPotential}</p></div>
          </div>
          <p className="text-ink text-sm font-bold">למה המודעה חשובה</p>
          <ul className="mt-1 flex flex-col gap-1">
            {detail.whyItMatters.map((w, i) => <li key={i} className="text-muted flex items-center gap-1.5 text-xs"><span className="text-brand">•</span>{w}</li>)}
          </ul>
          <p className="text-muted mt-2 text-[11px]">{ai.ai_opportunity_summary}</p>
        </Section>
      </div>

      {/* 2) Images */}
      {images.length > 0 && (
        <Section title="תמונות" icon="Map">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {images.slice(0, 8).map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={src} alt={`תמונה ${i + 1}`} loading="lazy" className="border-line aspect-square w-full rounded-xl border object-cover" />
            ))}
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 3) Location */}
        <Section title="מיקום" icon="MapPin">
          <div className="grid grid-cols-2 gap-2">
            <Field label="עיר" value={l.city ?? "—"} />
            <Field label="שכונה" value={l.neighborhood ?? "—"} />
            <Field label="רחוב" value={l.street ?? "—"} />
            <Field label="מספר" value={l.street_number ?? "—"} />
          </div>
          {l.address && <p className="text-muted mt-2 text-xs">{l.address}</p>}
        </Section>

        {/* 4) Listing Details */}
        <Section title="פרטי המודעה" icon="Building">
          <div className="grid grid-cols-3 gap-2">
            <Field label="מחיר" value={l.price ? formatShekels(l.price) : "—"} />
            <Field label="חדרים" value={l.rooms ?? "—"} />
            <Field label="מ״ר" value={l.sqm ?? "—"} />
            <Field label="קומה" value={l.floor ?? "—"} />
            <Field label="מתוך" value={l.total_floors ?? "—"} />
            <Field label="סוג" value={l.property_type ?? "—"} />
            <Field label="חניה" value={l.parking == null ? "—" : l.parking ? "יש" : "אין"} />
            <Field label="מעלית" value={l.elevator == null ? "—" : l.elevator ? "יש" : "אין"} />
            <Field label="ממ״ד" value={l.secure_room == null ? "—" : l.secure_room ? "יש" : "אין"} />
          </div>
        </Section>

        {/* 5) Market Comparison */}
        <Section title="השוואת שוק" icon="BarChart3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="₪ למ״ר" value={market.pricePerSqm ? `${market.pricePerSqm.toLocaleString("he-IL")} ₪` : "—"} />
            <Field label="ממוצע שכונה" value={market.neighborhoodAvgSqm ? `${market.neighborhoodAvgSqm.toLocaleString("he-IL")} ₪` : "—"} />
            <Field label="מול ממוצע שכונה" value={market.vsNeighborhoodPct == null ? "—" : <span className={market.vsNeighborhoodPct <= 0 ? "text-success" : "text-danger"}>{market.vsNeighborhoodPct > 0 ? "+" : ""}{market.vsNeighborhoodPct}%</span>} />
            <Field label="מול ממוצע עיר" value={market.vsCityPct == null ? "—" : <span className={market.vsCityPct <= 0 ? "text-success" : "text-danger"}>{market.vsCityPct > 0 ? "+" : ""}{market.vsCityPct}%</span>} />
          </div>
        </Section>

        {/* 9) Price Intelligence */}
        <Section title="מודיעין מחיר" icon="TrendingDown">
          <div className="grid grid-cols-2 gap-2">
            <Field label="אחוזון מחיר בעיר" value={market.percentile == null ? "—" : `${market.percentile}%`} />
            <Field label="תחרותיות" value={market.competitiveness} />
            <Field label="ירידות מחיר" value={detail.priceDropCount} />
            <Field label="מתחרים באזור" value={market.competingCount} />
          </div>
          {detail.priceHistory.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {detail.priceHistory.slice(0, 5).map((h, i) => (
                <li key={i} className="text-muted text-[11px]">{fmtDate(h.at)} · {h.changeType === "price_changed" ? "שינוי מחיר" : h.changeType}</li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      {/* 6) Buyer Matches */}
      <Section title="קונים מתאימים" icon="Users" action={<span className="text-muted text-xs font-bold">{buyerMatches.length} התאמות</span>}>
        {buyerMatches.length === 0 ? (
          <p className="text-muted text-sm">{ai.ai_buyer_strategy}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {buyerMatches.slice(0, 8).map((m) => (
              <li key={m.buyerId} className="border-line flex flex-wrap items-center gap-2 rounded-2xl border p-3">
                <Link href={`/buyers/${m.buyerId}`} className="text-ink hover:text-brand min-w-0 flex-1 text-sm font-bold">{m.name}</Link>
                <span className="text-muted text-[11px]">התאמה <b className={tone(m.matchScore)}>{m.matchScore}</b></span>
                <span className="text-muted text-[11px]">סגירה <b className={tone(m.closingProbability)}>{m.closingProbability}%</b></span>
                <span className="text-success text-[11px] font-bold">עמלה ~{formatShekels(m.commissionOpportunity)}</span>
                <p className="text-muted w-full text-[11px]">{m.reasons.join(" · ")} · <span className="text-brand-strong">{m.nextAction}</span></p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* 8) Similar Listings */}
        <Section title="מודעות דומות" icon="Building2">
          {detail.similar.length === 0 ? <p className="text-muted text-sm">אין מודעות דומות באזור</p> : (
            <ul className="flex flex-col gap-1.5">
              {detail.similar.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/external-listings/${s.id}`} className="text-ink hover:text-brand min-w-0 flex-1 truncate font-semibold">{s.title ?? "מודעה"} · {SOURCE_LABELS[s.source] ?? s.source}</Link>
                  <span className="text-muted shrink-0 text-[11px]">{s.price ? formatShekels(s.price) : "—"}{s.sqm ? ` · ${s.sqm}מ״ר` : ""}</span>
                  <span className={cn("shrink-0 text-[11px] font-black", tone(s.opportunity_score))}>{s.opportunity_score}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* 10) Source Information */}
        <Section title="מידע מקור" icon="Shield">
          <div className="grid grid-cols-2 gap-2">
            <Field label="מקור" value={sourceLabel} />
            <Field label="סוג מלאי" value="מודעה חיצונית" />
            <Field label="זכויות" value="מידע ציבורי בלבד" />
            <Field label="בעלים" value={privateOwner ? "בעלים פרטי" : l.has_agent ? "מתווך" : "—"} />
            <Field label="איש קשר" value={l.contact_name ?? "—"} />
            <Field label="טלפון" value={l.contact_phone ?? "—"} />
            <Field label="פורסם" value={fmtDate(l.published_at)} />
            <Field label="נראה לראשונה" value={fmtDate(l.first_seen_at)} />
          </div>
          <div className="bg-surface mt-3 rounded-xl p-3">
            <p className="text-ink text-xs font-bold">אסטרטגיית גיוס (אוטומטית)</p>
            <p className="text-muted mt-1 text-[11px] leading-relaxed">{ai.ai_acquisition_strategy}</p>
          </div>
        </Section>
      </div>

      {/* Source preview modal — stays inside ZONO */}
      {showSource && l.listing_url && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-3 sm:p-6" onClick={() => setShowSource(false)}>
          <div className="bg-card mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-[20px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="border-line flex items-center justify-between gap-3 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="text-ink text-sm font-extrabold">{sourceLabel} · תצוגת מקור</p>
                <p className="text-muted truncate text-[11px]">{l.listing_url}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <a href={l.listing_url} target="_blank" rel="noopener noreferrer"><Button size="sm" variant="ghost" leadingIcon={<Icon name="ArrowUpRight" size={14} />}>בטאב חדש</Button></a>
                <button type="button" onClick={() => setShowSource(false)} className="text-muted hover:text-ink grid h-8 w-8 place-items-center rounded-lg" aria-label="סגור"><Icon name="Minus" size={18} /></button>
              </div>
            </div>
            <div className="relative flex-1">
              <iframe src={l.listing_url} title="תצוגת מקור" className="h-full w-full" referrerPolicy="no-referrer" sandbox="allow-same-origin allow-scripts allow-popups allow-forms" />
              <p className="text-muted pointer-events-none absolute inset-x-0 bottom-0 bg-card/90 px-4 py-2 text-center text-[11px]">אם המודעה לא נטענת, ייתכן שהאתר חוסם הצגה במסגרת — פתח ״בטאב חדש״.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
