"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { ListingHoverPreview } from "@/components/listings/ListingHoverPreview";
import { ContactButtons } from "@/components/listings/ContactButtons";
import { ACQ_BOARD_COLUMNS } from "@/lib/acquisition/engine";
import {
  createAcquisitionTaskAction, getAcquisitionDetailAction, promoteAcquisitionAction,
  recomputeAcquisitionAction, setAcquisitionStatusAction, type AcquisitionActionState,
} from "@/lib/acquisition/actions";
import type { AcquisitionCard, AcquisitionCommandCenter, AcquisitionDetail } from "@/lib/acquisition/service";

const SOURCE_LABELS: Record<string, string> = { yad2: "יד2", madlan: "מדלן", facebook: "פייסבוק", manual_external: "ידני", partner_api: "שותף" };
const field = "bg-surface border-line text-ink focus:border-brand-light h-9 rounded-xl border px-3 text-sm outline-none transition";
const scoreTone = (n: number) => (n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-muted");

export function AcquisitionView({ cards, cc, embedded = false }: { cards: AcquisitionCard[]; cc: AcquisitionCommandCenter; embedded?: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AcquisitionDetail | null>(null);
  // filters
  const [city, setCity] = useState("");
  const [source, setSource] = useState("");
  const [privateOnly, setPrivateOnly] = useState(false);
  const [excludeBrokers, setExcludeBrokers] = useState(true); // default: hide brokers — focus on private owners
  const [minScore, setMinScore] = useState("");
  const [buyerDemand, setBuyerDemand] = useState(false);

  const run = (fn: () => Promise<AcquisitionActionState>) => { setError(null); setMsg(null); start(async () => { const r = await fn(); if (r?.error) setError(r.error); else { if (r?.message) setMsg(r.message); router.refresh(); } }); };
  const openDetail = (id: string) => { if (openId === id) { setOpenId(null); return; } setOpenId(id); setDetail(null); start(async () => { setDetail(await getAcquisitionDetailAction(id)); }); };

  const filtered = useMemo(() => cards.filter((c) => {
    if (city && !(c.city ?? "").includes(city)) return false;
    if (source && c.source !== source) return false;
    if (privateOnly && c.sourceType !== "private_seller") return false;
    if (excludeBrokers && (c.sourceType === "broker" || c.sourceType === "agency" || c.sourceType === "office")) return false;
    if (minScore && c.acquisitionScore < Number(minScore)) return false;
    if (buyerDemand && c.buyerDemandScore < 40) return false;
    return true;
  }), [cards, city, source, privateOnly, excludeBrokers, minScore, buyerDemand]);

  const byStatus = (status: string) => filtered.filter((c) => c.status === status);

  return (
    <div className="flex flex-col gap-5">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-ink text-lg font-black">לוח ניהול גיוס מלא</h2>
            <p className="text-muted text-xs">ניהול מלא של הזדמנויות הגיוס — סינון, שלבי פייפליין ופעולות.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => run(recomputeAcquisitionAction)} disabled={pending} leadingIcon={<Icon name="Sparkles" size={14} />}>{pending ? "מחשב…" : "חשב מחדש"}</Button>
        </div>
      ) : (
        <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
          <div>
            <p className="text-brand text-xs font-bold">ZONO Inventory Acquisition</p>
            <h1 className="text-ink mt-1 text-2xl font-black">מודיעין גיוס נכסים</h1>
            <p className="text-muted mt-1 text-sm">הפיכת מודעות חיצוניות להזדמנויות גיוס — בעלים פרטיים, ביקוש קונים, ועסקאות דו״צ.</p>
          </div>
          <Button onClick={() => run(recomputeAcquisitionAction)} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>{pending ? "מחשב…" : "חשב הזדמנויות גיוס"}</Button>
        </div>
      )}

      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}
      {msg && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{msg}</p>}

      {/* Command center */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="סה״כ הזדמנויות" value={cc.total} icon="Building2" />
        <Stat label="עדיפות גבוהה" value={cc.highPriority} icon="Flame" tone="text-danger" />
        <Stat label="בעלים פרטיים" value={cc.privateSellers} icon="UserCheck" tone="text-success" />
        <Stat label="ביקוש קונים" value={cc.buyerDemand} icon="Users" tone="text-brand-strong" />
        <Stat label="פוטנציאל דו״צ" value={cc.doubleSide} icon="Sparkles" tone="text-success" />
        <Stat label="נוצר קשר / פולואפ" value={cc.contacted} icon="Clock" />
      </div>

      {/* Filters */}
      <div className="bg-card border-line flex flex-wrap items-center gap-2 rounded-[20px] border p-3">
        <input className={field} placeholder="עיר" value={city} onChange={(e) => setCity(e.target.value)} />
        <select className={field} value={source} onChange={(e) => setSource(e.target.value)}><option value="">כל המקורות</option><option value="yad2">יד2</option><option value="madlan">מדלן</option></select>
        <input className={field} type="number" placeholder="ציון גיוס מ-" value={minScore} onChange={(e) => setMinScore(e.target.value)} />
        <label className="text-muted flex items-center gap-1 text-xs"><input type="checkbox" checked={privateOnly} onChange={(e) => setPrivateOnly(e.target.checked)} /> בעלים פרטי בלבד</label>
        <label className="text-muted flex items-center gap-1 text-xs"><input type="checkbox" checked={excludeBrokers} onChange={(e) => setExcludeBrokers(e.target.checked)} /> ללא מתווכים</label>
        <label className="text-muted flex items-center gap-1 text-xs"><input type="checkbox" checked={buyerDemand} onChange={(e) => setBuyerDemand(e.target.checked)} /> ביקוש קונים</label>
      </div>

      {cards.length === 0 ? (
        <div className="bg-card border-line flex flex-col items-center gap-3 rounded-[24px] border px-6 py-16 text-center">
          <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Building2" size={26} /></span>
          <p className="text-ink text-lg font-extrabold">אין עדיין הזדמנויות גיוס</p>
          <p className="text-muted max-w-sm text-sm">לחץ ״חשב הזדמנויות גיוס״ כדי לבנות פרופילים מהמודעות החיצוניות, זיהוי המתווכים, וביקוש הקונים.</p>
        </div>
      ) : (
        <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
          {ACQ_BOARD_COLUMNS.map((col) => {
            const items = byStatus(col.key);
            return (
              <div key={col.key} className="w-[300px] shrink-0">
                <p className="text-ink mb-2 flex items-center justify-between text-sm font-extrabold">{col.label}<span className="text-muted text-xs">{items.length}</span></p>
                <div className="flex flex-col gap-3">
                  {items.map((c) => (
                    <div key={c.profileId} className="bg-card border-line rounded-[18px] border p-3 shadow-[var(--shadow-soft)]">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <ListingHoverPreview listingId={c.listingId} className="min-w-0 flex-1">
                          <button onClick={() => openDetail(c.profileId)} className="text-ink hover:text-brand block w-full truncate text-start text-sm font-bold">{c.title ?? "מודעה"}</button>
                        </ListingHoverPreview>
                        <span className={cn("shrink-0 text-lg font-black", scoreTone(c.acquisitionScore))}>{c.acquisitionScore}</span>
                      </div>
                      <p className="text-muted text-[11px]">{c.city ?? "—"} · {SOURCE_LABELS[c.source] ?? c.source} · {c.price ? formatShekels(c.price) : "—"}</p>
                      {c.badge && <span className="bg-surface text-muted mt-1 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold">{c.badge}</span>}
                      {(c.contactName || c.contactPhone) && <div className="mt-2"><ContactButtons name={c.contactName} phone={c.contactPhone} /></div>}
                      <div className="text-muted mt-2 grid grid-cols-3 gap-1 text-[10px]">
                        <span>פרטי <b className={scoreTone(c.privateSellerScore)}>{c.privateSellerScore}</b></span>
                        <span>ביקוש <b className={scoreTone(c.buyerDemandScore)}>{c.buyerDemandScore}</b></span>
                        <span>מחיר <b className={scoreTone(c.priceOpportunityScore)}>{c.priceOpportunityScore}</b></span>
                      </div>
                      {c.nextBestAction && <p className="text-brand-strong mt-2 text-[11px] font-bold">→ {c.nextBestAction}</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button className="text-success text-[10px] font-bold" disabled={pending} onClick={() => run(() => createAcquisitionTaskAction(c.profileId))}>צור משימה</button>
                        <button className="text-brand-strong text-[10px] font-bold" disabled={pending} onClick={() => openDetail(c.profileId)}>פרטים</button>
                        {c.sourceType === "private_seller" && <button className="text-brand text-[10px] font-bold" disabled={pending} onClick={() => run(() => promoteAcquisitionAction(c.profileId))}>קדם ל-CRM</button>}
                        {c.status !== "not_relevant" && <button className="text-muted text-[10px] font-bold" disabled={pending} onClick={() => run(() => setAcquisitionStatusAction(c.profileId, "not_relevant"))}>לא רלוונטי</button>}
                      </div>

                      {openId === c.profileId && (
                        <div className="border-line mt-3 border-t pt-3 text-xs">
                          {!detail ? <p className="text-muted">טוען…</p> : (
                            <div className="flex flex-col gap-2">
                              <p className="text-muted">{detail.profile.ai_summary}</p>
                              <div>
                                <p className="text-ink font-bold">קונים מתאימים ({detail.buyerMatches.length})</p>
                                {detail.buyerMatches.length === 0 ? <p className="text-muted">אין קונים תואמים</p> : (
                                  <ul className="mt-1 flex flex-col gap-0.5">{detail.buyerMatches.map((b) => <li key={b.buyerId} className="text-muted">{b.name} · התאמה {b.matchScore} · עמלה ~{formatShekels(b.commission)}</li>)}</ul>
                                )}
                              </div>
                              <div>
                                <p className="text-ink font-bold">תסריט גיוס (טיוטה)</p>
                                <p className="text-muted bg-surface mt-1 rounded-lg p-2 leading-relaxed">{detail.script.callOpener}</p>
                                <p className="text-muted mt-1">וואטסאפ: {detail.script.whatsappDraft}</p>
                              </div>
                              <div>
                                <p className="text-ink font-bold">פעולות מומלצות</p>
                                <ul className="mt-1 flex flex-col gap-0.5">{detail.actions.slice(0, 5).map((a) => <li key={a.id} className="text-muted">• {a.title} <span className="text-[10px]">({a.expected_outcome})</span></li>)}</ul>
                              </div>
                              {detail.listing.id && <Link href={`/external-listings/${detail.listing.id}`} className="text-brand-strong font-bold">פרטים מלאים ↗</Link>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {items.length === 0 && <p className="text-muted text-xs">—</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, icon, tone = "text-brand-strong" }: { label: string; value: number; icon: string; tone?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-3">
      <span className={cn("mb-1 inline-flex", tone)}><Icon name={icon} size={16} /></span>
      <p className="text-ink text-2xl font-black">{value}</p>
      <p className="text-muted text-[11px] font-bold">{label}</p>
    </div>
  );
}
