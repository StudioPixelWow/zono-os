"use client";
/* eslint-disable @next/next/no-img-element -- external CDN property photos + signed studio URLs; next/image would require remotePatterns config */
// ============================================================================
// 📘 ZONO — Facebook Groups Campaign Wizard. Campaign UX P0.
// A guided property→CONTENT→groups→schedule→REVIEW flow ending in a REAL
// ACTIVATION (activateFacebookCampaignAction). The Content step is a premium
// composer: a controlled caption editor (the EXACT text that publishes — parity),
// a real property/Studio media selector, a Creative-Studio round-trip that
// preserves campaign state, and a LIVE Facebook-style preview bound to state.
// Single image only — matches the real extension capability (no fake carousel).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { buildPlan, FREQUENCY_HE, type Frequency, type WizardGroup, type GroupFolder } from "@/lib/facebook-groups/planner";
import { generatePostVariations, type PropertyFacts } from "@/lib/facebook-groups/content";
import { activateFacebookCampaignAction } from "@/lib/facebook-groups/activate";
import { listPropertyCampaignMediaAction, creativeFacebookReadinessAction, prepareCreativeForFacebookAction } from "@/lib/facebook-groups/media-actions";
import type { CampaignMediaItem, MediaRef } from "@/lib/facebook-groups/campaign-media";
import type { FbReadiness } from "@/lib/facebook-groups/creative-readiness";
import { FacebookPreview } from "./FacebookPreview";

// Publish-readiness status for a selected Studio creative (Facebook groups).
function FbReadinessChip({ readiness, preparing, onPrepare }: { readiness: FbReadiness; preparing: boolean; onPrepare: () => void }) {
  if (readiness.status === "ready") {
    return <div className="bg-success-soft text-success mt-2 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-bold">מוכן לפרסום ✓</div>;
  }
  return (
    <div className="bg-warning-soft mt-2 flex flex-wrap items-center gap-2 rounded-lg px-3 py-1.5">
      <span className="text-warning text-[12px] font-bold">נדרשת הכנה לפרסום</span>
      {readiness.canAutoPromote
        ? <button type="button" onClick={onPrepare} disabled={preparing} className="bg-brand rounded-lg px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50">{preparing ? "מכין…" : "הכן לפרסום בפייסבוק"}</button>
        : <span className="text-muted text-[11px]">הקריאייטיב עדיין לא מוכן לפרסום בפייסבוק — פנו למנהל להכנתו.</span>}
    </div>
  );
}

interface WProperty extends PropertyFacts { id: string; image: string | null }
interface Connection { label: string; status: string; connected: boolean; message: string }
interface Identity { name: string; avatarUrl: string | null }
interface Props { properties: WProperty[]; folders: GroupFolder[]; connection: Connection; notes: string[]; initialPropertyId?: string | null; identity: Identity }

const STEPS = ["נכס", "תוכן", "קבוצות", "תזמון", "סקירה ואישור"];
const fmt = (n: number | null) => (n == null ? "—" : `₪${n.toLocaleString("he-IL")}`);
const FREQS: Frequency[] = ["one_time", "three_weekly", "daily", "full_month"];
const dateHe = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "long" }) : "—");
const dateTimeHe = (iso: string | null) => (iso ? new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const draftKey = (id: string) => `zono:fbcampaign:draft:${id}`;

interface Activated { campaignId: string; created: number; groupCount: number; firstPublishAt: string | null; endDate: string }
interface Draft { postText: string; selectedGroups: string[]; frequency: Frequency; step: number; selectedMedia: MediaRef | null; knownMediaIds: string[] }

export function CampaignWizard({ properties, folders, notes, initialPropertyId, identity }: Props) {
  const preId = initialPropertyId && properties.some((p) => p.id === initialPropertyId) ? initialPropertyId : null;
  const [step, setStep] = useState(preId ? 1 : 0);
  const [propId, setPropId] = useState<string | null>(preId);
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [frequency, setFrequency] = useState<Frequency>("three_weekly");
  const [startDate] = useState(() => new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10));
  const [activating, setActivating] = useState(false);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [done, setDone] = useState<Activated | null>(null);
  const [mediaItems, setMediaItems] = useState<CampaignMediaItem[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<MediaRef | null>(null);
  const [postText, setPostText] = useState("");
  const [justCreated, setJustCreated] = useState<Set<string>>(new Set());
  const [fbReadiness, setFbReadiness] = useState<(FbReadiness & { forId: string }) | null>(null);
  const [preparing, setPreparing] = useState(false);
  const activatingRef = useRef(false);
  const bootRef = useRef(false);

  const property = properties.find((p) => p.id === propId) ?? null;
  const variations = useMemo(() => (property ? generatePostVariations(property, 4) : []), [property]);

  // Load media for the selected property; on the FIRST mount for a preselected
  // property, consume a saved round-trip draft (Studio → back) and restore state.
  // ALL state updates happen inside the async callback (never synchronously in the
  // effect body) — including caption seeding from the reused copy generator.
  useEffect(() => {
    const pid = propId;
    if (!pid) return;
    let alive = true;
    let draft: Draft | null = null;
    if (!bootRef.current && preId && pid === preId) {
      try { const raw = sessionStorage.getItem(draftKey(pid)); if (raw) { draft = JSON.parse(raw) as Draft; sessionStorage.removeItem(draftKey(pid)); } } catch { /* ignore */ }
    }
    bootRef.current = true;
    const seedText = variations[0]?.text ?? "";
    listPropertyCampaignMediaAction(pid)
      .then((items) => {
        if (!alive) return;
        setMediaItems(items);
        if (draft) {
          if (typeof draft.postText === "string") setPostText(draft.postText);
          if (Array.isArray(draft.selectedGroups)) setSelectedGroups(new Set(draft.selectedGroups));
          if (draft.frequency) setFrequency(draft.frequency);
          if (typeof draft.step === "number") setStep(draft.step);
          const known = new Set<string>(draft.knownMediaIds ?? []);
          const created = items.filter((m) => m.source === "studio" && !known.has(m.id));
          setJustCreated(new Set(created.map((m) => m.id)));
          const restored = draft.selectedMedia && items.find((m) => m.ref.kind === draft!.selectedMedia!.kind && m.ref.id === draft!.selectedMedia!.id);
          const def = created[0] ?? restored ?? items.find((m) => m.isPrimary) ?? items.find((m) => m.publishable) ?? items[0] ?? null;
          setSelectedMedia(def ? def.ref : null);
        } else {
          setJustCreated(new Set());
          setPostText((prev) => (prev.trim() ? prev : seedText));   // seed only when empty
          const def = items.find((m) => m.isPrimary) ?? items.find((m) => m.publishable) ?? items[0] ?? null;
          setSelectedMedia((prev) => (prev && items.some((m) => m.ref.kind === prev.kind && m.ref.id === prev.id) ? prev : (def ? def.ref : null)));
        }
      })
      .catch(() => { if (alive) { setMediaItems([]); setSelectedMedia(null); } });
    return () => { alive = false; };
  }, [propId, preId, variations]);

  const isSel = (m: CampaignMediaItem) => !!selectedMedia && selectedMedia.kind === m.ref.kind && selectedMedia.id === m.ref.id;
  const allGroups = useMemo(() => folders.flatMap((f) => f.groups), [folders]);
  const chosen: WizardGroup[] = allGroups.filter((g) => selectedGroups.has(g.id));
  const plan = useMemo(() => (chosen.length ? buildPlan(chosen, frequency, startDate, { variations: 4 }) : null), [chosen, frequency, startDate]);
  const previewImg = selectedMedia?.url ?? null;
  // Publish-readiness applies only to a selected STUDIO creative (property photos
  // are always publishable). Shown only when it matches the current selection.
  const readiness = selectedMedia?.kind === "creative_output" && fbReadiness?.forId === selectedMedia.id ? fbReadiness : null;

  // Fetch readiness whenever a Studio creative is selected (async — never sets
  // state synchronously in the effect body).
  useEffect(() => {
    if (selectedMedia?.kind !== "creative_output") return;
    const id = selectedMedia.id;
    let alive = true;
    creativeFacebookReadinessAction(id).then((r) => { if (alive) setFbReadiness({ ...r, forId: id }); }).catch(() => { /* keep prior */ });
    return () => { alive = false; };
  }, [selectedMedia]);

  async function prepareForFacebook() {
    if (selectedMedia?.kind !== "creative_output") return;
    const id = selectedMedia.id;
    setPreparing(true);
    try {
      await prepareCreativeForFacebookAction(id);
      const r = await creativeFacebookReadinessAction(id);
      setFbReadiness({ ...r, forId: id });
    } finally { setPreparing(false); }
  }

  const canNext = [!!property, true, chosen.length > 0, true, true][step];
  const toggleGroup = (id: string) => setSelectedGroups((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleFolder = (f: GroupFolder) => setSelectedGroups((s) => { const n = new Set(s); const all = f.groups.every((g) => n.has(g.id)); f.groups.forEach((g) => (all ? n.delete(g.id) : n.add(g.id))); return n; });

  function pickMedia(ref: MediaRef) { setSelectedMedia(ref); }
  function regenerate() {
    if (!variations.length) return;
    const idx = variations.findIndex((v) => v.text === postText.trim());
    setPostText(variations[(idx + 1 + variations.length) % variations.length].text);
  }

  // Creative Studio round-trip: save the whole campaign draft, then open Studio for
  // this property with a return path back to this exact wizard.
  function openStudio() {
    if (!propId) return;
    try {
      const draft: Draft = { postText, selectedGroups: [...selectedGroups], frequency, step, selectedMedia, knownMediaIds: mediaItems.map((m) => m.id) };
      sessionStorage.setItem(draftKey(propId), JSON.stringify(draft));
    } catch { /* ignore */ }
    const ret = `/distribution/campaign-wizard?property=${propId}`;
    window.location.href = `/creative-studio/property/${propId}?source=facebook_campaign&returnTo=${encodeURIComponent(ret)}`;
  }

  async function activate() {
    if (activatingRef.current || !property || chosen.length === 0) return; // single-flight
    activatingRef.current = true;
    setActivating(true);
    setActivateError(null);
    try {
      const res = await activateFacebookCampaignAction({
        propertyId: property.id, propertyTitle: property.title,
        groupIds: chosen.map((g) => g.id), frequency, startDate,
        media: selectedMedia, postText: postText.trim() || null,
      });
      if (res.ok) { try { sessionStorage.removeItem(draftKey(property.id)); } catch { /* ignore */ } setDone({ campaignId: res.campaignId, created: res.created, groupCount: res.groupCount, firstPublishAt: res.firstPublishAt, endDate: res.endDate }); }
      else setActivateError(res.error);
    } catch {
      setActivateError("הפעלת הקמפיין נכשלה. נסה שוב.");
    } finally {
      activatingRef.current = false;
      setActivating(false);
    }
  }

  // ── SUCCESS STATE ───────────────────────────────────────────────────────────
  if (done) {
    return (
      <div dir="rtl" className="mx-auto flex max-w-xl flex-col items-center gap-4 py-8 text-center">
        <div className="bg-success-soft grid h-16 w-16 place-items-center rounded-full text-3xl">✅</div>
        <h1 className="text-ink text-2xl font-black">הקמפיין פעיל</h1>
        <div className="bg-card border-line w-full rounded-[22px] border p-5">
          <div className="grid grid-cols-2 gap-3 text-right">
            <Cell label="נכס" value={property?.title ?? "—"} />
            <Cell label="קבוצות" value={`${done.groupCount}`} />
            <Cell label="פרסומים מתוכננים" value={`${done.created}`} />
            <Cell label="עד" value={dateHe(done.endDate)} />
            <Cell label="הפרסום הבא" value={dateTimeHe(done.firstPublishAt)} full />
          </div>
        </div>
        <p className="text-muted max-w-md text-[12px]">התוסף ילווה אותך בפרסום כל פריט בזמנו — הפרסום מאושר על ידך. תגובות שיתקבלו על הפוסטים ניתנות לקידום ללידים במרכז התגובות.</p>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href="/distribution/daily" className="bg-brand rounded-xl px-6 py-2.5 text-sm font-black text-white">לפרסומים של היום ←</Link>
          <Link href="/distribution" className="border-line text-ink rounded-xl border px-6 py-2.5 text-sm font-bold">לצפייה בקמפיין</Link>
        </div>
      </div>
    );
  }

  const onReview = step === STEPS.length - 1;
  const propertyMedia = mediaItems.filter((m) => m.source !== "studio");
  const studioMedia = mediaItems.filter((m) => m.source === "studio");

  return (
    <div dir="rtl" className="flex flex-col gap-4">
      <div className="bg-brand-soft flex items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">ZONO · קבוצות פייסבוק</p>
          <h1 className="text-ink mt-1 flex items-center gap-2 text-2xl font-black"><Icon name="Megaphone" size={22} /> קמפיין שיווק בקבוצות</h1>
          <p className="text-muted mt-1 text-sm">בונה קמפיין שיווק לנכס בקבוצות פייסבוק. שום דבר לא מתפרסם ללא חיבור ואישור.</p>
        </div>
        <span className="bg-brand-soft text-brand rounded-full px-3 py-1 text-[11px] font-bold">פרסום דרך תוסף ZONO</span>
      </div>

      {/* Stepper */}
      <div className="flex gap-1 overflow-x-auto">
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => i <= step && setStep(i)} className={cn("flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12px] font-bold", i === step ? "bg-brand text-white" : i < step ? "bg-card text-ink" : "bg-surface text-muted")}>
            <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[10px]", i === step ? "bg-white/25" : "bg-brand-soft text-brand")}>{i + 1}</span>{s}
          </button>
        ))}
      </div>

      {notes.length > 0 && step === 0 && <div className="bg-warning-soft text-warning rounded-xl px-3 py-2 text-[12px]">{notes.join(" · ")}</div>}

      <div className="bg-card border-line rounded-[22px] border p-5">
        {/* STEP 1 — property */}
        {step === 0 && (
          properties.length === 0 ? <Empty title="אין נכסים פעילים" body="הוסיפו נכס למלאי כדי לשווק אותו בקבוצות." /> : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {properties.map((p) => (
                <button key={p.id} onClick={() => setPropId(p.id)} className={cn("overflow-hidden rounded-2xl border bg-surface text-right", propId === p.id ? "border-brand ring-2 ring-brand" : "border-line")}>
                  <div className="relative aspect-[4/3] bg-slate-100">{p.image ? <img src={p.image} alt={p.title} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-slate-400">🏠</div>}</div>
                  <div className="p-2"><div className="text-ink line-clamp-1 text-[12px] font-bold">{p.title}</div><div className="text-brand text-[12px] font-black">{fmt(p.price)}</div><div className="text-muted text-[10px]">{[p.neighborhood, p.city].filter(Boolean).join(", ")}</div></div>
                </button>
              ))}
            </div>
          )
        )}

        {/* STEP 2 — CONTENT composer (editor + sticky live preview) */}
        {step === 1 && property && (
          <div className="grid gap-5 lg:grid-cols-[1fr_minmax(300px,380px)]">
            {/* editor */}
            <div className="space-y-5">
              <section>
                <div className="mb-1 flex items-center justify-between">
                  <h2 className="text-ink text-[14px] font-black">התוכן של הפוסט</h2>
                  {variations.length > 1 && <button type="button" onClick={regenerate} className="text-brand inline-flex items-center gap-1 text-[12px] font-bold"><Icon name="RefreshCw" size={13} /> נוסח אחר</button>}
                </div>
                <label className="text-muted text-[12px]">כיתוב לפוסט</label>
                <textarea value={postText} onChange={(e) => setPostText(e.target.value)} rows={6} className="border-line bg-surface text-ink mt-1 w-full rounded-xl border p-3 text-[13px] leading-relaxed" placeholder="כתבו את הטקסט שיתפרסם בקבוצות…" />
                <div className="text-muted mt-1 text-[11px]">{postText.length} תווים · הטקסט הזה בדיוק הוא שיתפרסם.</div>
              </section>

              <section>
                <div className="text-ink mb-1 text-[14px] font-black">תמונות לפוסט</div>
                {mediaItems.length === 0 ? (
                  <div className="bg-warning-soft text-warning rounded-xl px-3 py-2 text-[12px]">אין עדיין תמונות לנכס. אפשר ליצור קריאייטיב בסטודיו, או להמשיך ללא תמונה (מומלץ לצרף תמונה).</div>
                ) : (
                  <div className="space-y-3">
                    {propertyMedia.length > 0 && (
                      <div>
                        <div className="text-muted mb-1 text-[11px] font-bold">תמונות הנכס</div>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {propertyMedia.map((m) => (
                            <button type="button" key={m.id} onClick={() => pickMedia(m.ref)} aria-pressed={isSel(m)} aria-label={`בחירת ${m.label}`} className={cn("relative aspect-square overflow-hidden rounded-xl border-2 transition", isSel(m) ? "border-brand ring-2 ring-brand/40" : "border-transparent hover:border-line")}>
                              <img src={m.thumbnailUrl ?? m.url} alt={m.label} className="h-full w-full object-cover" />
                              {m.isPrimary && <span className="bg-ink/70 absolute top-1 end-1 rounded px-1 py-0.5 text-[8px] font-bold text-white">ראשית</span>}
                              {isSel(m) && <span className="bg-brand absolute inset-x-0 bottom-0 py-0.5 text-center text-[9px] font-bold text-white">✓ נבחרה</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {studioMedia.length > 0 && (
                      <div>
                        <div className="text-muted mb-1 text-[11px] font-bold">קריאייטיבים שיצרתם</div>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {studioMedia.map((m) => (
                            <button type="button" key={m.id} onClick={() => m.publishable && pickMedia(m.ref)} aria-pressed={isSel(m)} aria-label={`בחירת קריאייטיב${m.publishable ? "" : " (דרוש אישור)"}`} className={cn("relative aspect-square overflow-hidden rounded-xl border-2 transition", isSel(m) ? "border-brand ring-2 ring-brand/40" : "border-transparent hover:border-line", !m.publishable && "opacity-70")}>
                              <img src={m.thumbnailUrl ?? m.url} alt="קריאייטיב מהסטודיו" className="h-full w-full object-cover" />
                              {justCreated.has(m.id) && <span className="bg-success absolute top-1 start-1 rounded px-1 py-0.5 text-[8px] font-bold text-white">נוצר עכשיו</span>}
                              {!m.publishable && <span className="absolute inset-x-0 bottom-0 bg-black/60 py-0.5 text-center text-[8px] text-white">דרוש אישור</span>}
                              {isSel(m) && <span className="bg-brand absolute inset-x-0 bottom-0 py-0.5 text-center text-[9px] font-bold text-white">✓ נבחרה</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {readiness && <FbReadinessChip readiness={readiness} preparing={preparing} onPrepare={prepareForFacebook} />}
              </section>

              {/* Creative Studio CTA */}
              <div className="border-brand/30 bg-brand-soft/50 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed p-4">
                <div>
                  <div className="text-ink text-[13px] font-black">✨ צור פוסט חדש ב-Creative Studio</div>
                  <div className="text-muted text-[12px]">רוצה ליצור משהו ייחודי יותר? אפשר ליצור קריאייטיב חדש לנכס ולחזור ישר לקמפיין.</div>
                </div>
                <button type="button" onClick={openStudio} className="bg-brand shrink-0 rounded-xl px-4 py-2 text-[13px] font-bold text-white">פתיחת הסטודיו ←</button>
              </div>
            </div>

            {/* sticky live preview */}
            <div className="lg:sticky lg:top-4 lg:self-start">
              <div className="text-ink mb-1 text-[13px] font-black">תצוגה מקדימה בפייסבוק</div>
              <FacebookPreview identity={identity} text={postText} imageUrl={previewImg} onPickMedia={mediaItems.length ? undefined : openStudio} />
            </div>
          </div>
        )}

        {/* STEP 3 — groups */}
        {step === 2 && (
          folders.length === 0 ? <Empty title="אין קבוצות מאושרות לפרסום" body="כדי ליצור קמפיין יש לבחור ולהפעיל קבוצות במסך הקבוצות." cta={{ href: "/distribution/groups", label: "בחירת קבוצות" }} /> : (
            <div className="space-y-4">
              <p className="text-muted text-[12px]"><b className="text-ink">{selectedGroups.size}</b> קבוצות נבחרו. בחרו תיקייה שלמה או קבוצות בודדות.</p>
              {folders.map((f) => (
                <div key={f.name}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-ink text-[14px] font-black">📁 {f.name} <span className="text-muted text-[11px] font-normal">({f.groups.length})</span></h3>
                    <button onClick={() => toggleFolder(f)} className="text-brand text-[12px] font-bold">{f.groups.every((g) => selectedGroups.has(g.id)) ? "בטל בחירה" : "בחר הכל"}</button>
                  </div>
                  <div className="mt-1 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {f.groups.map((g) => (
                      <button key={g.id} onClick={() => toggleGroup(g.id)} className={cn("flex items-center justify-between rounded-xl border px-3 py-2 text-right text-[12px]", selectedGroups.has(g.id) ? "border-brand bg-brand-soft" : "border-line bg-surface")}>
                        <span className="text-ink font-bold">{g.name}</span>
                        <span className="text-muted">{g.membersCount.toLocaleString("he-IL")} 👥</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* STEP 4 — schedule (cadence) */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-muted text-[12px]">באיזו תדירות לפרסם לאורך הקמפיין?</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {FREQS.map((f) => (
                <button key={f} onClick={() => setFrequency(f)} className={cn("rounded-2xl border p-4 text-center", frequency === f ? "border-brand bg-brand-soft" : "border-line bg-surface")}>
                  <Icon name="Calendar" size={18} className="text-brand mx-auto" />
                  <div className="text-ink mt-1 text-[13px] font-black">{FREQUENCY_HE[f]}</div>
                </button>
              ))}
            </div>
            {plan && <p className="text-muted text-[12px]">מ־{dateHe(startDate)} · בין 09:00 ל־20:00 · כ־{plan.totalPosts} פרסומים מתוכננים.</p>}
          </div>
        )}

        {/* STEP 5 — REVIEW + ACTIVATE (with the real final preview) */}
        {onReview && (
          !property || chosen.length === 0 ? (
            <Empty title="חסרים פרטים" body="חזרו ובחרו נכס וקבוצות לפני הפעלת הקמפיין." />
          ) : (
            <div className="grid gap-5 lg:grid-cols-[1fr_minmax(300px,380px)]">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Cell label="נכס" value={property.title ?? "—"} />
                  <Cell label="מחיר" value={fmt(property.price)} />
                  <Cell label="קבוצות" value={`${chosen.length} נבחרו`} />
                  <Cell label="תדירות" value={FREQUENCY_HE[frequency]} />
                  <Cell label="מתחיל" value={dateHe(startDate)} />
                  <Cell label="פרסומים מתוכננים" value={plan ? `~${plan.totalPosts}` : "—"} />
                </div>
                <div className="bg-surface rounded-xl p-3">
                  <div className="text-muted mb-1 text-[11px] font-bold">טקסט הפוסט</div>
                  <div className="text-ink whitespace-pre-wrap text-[12px] leading-relaxed">{postText.trim() || "— ללא טקסט —"}</div>
                </div>
                {!selectedMedia && <div className="bg-warning-soft text-warning rounded-xl p-3 text-[12px]">פרסום ללא תמונה. מומלץ לחזור לשלב התוכן ולבחור תמונה או ליצור קריאייטיב.</div>}
                {readiness && <FbReadinessChip readiness={readiness} preparing={preparing} onPrepare={prepareForFacebook} />}
                <div className="bg-surface text-muted rounded-xl p-3 text-[12px]">
                  ZONO יכין ויתזמן כל פרסום. בזמן הפרסום, <b className="text-ink">התוסף ילווה אותך</b> בפרסום בקבוצה בפייסבוק — הפרסום מאושר על ידך. אין פרסום אוטומטי.
                </div>
                {activateError && <div className="bg-danger-soft text-danger rounded-xl p-3 text-[12px]">{activateError}</div>}
              </div>
              <div className="lg:sticky lg:top-4 lg:self-start">
                <div className="text-ink mb-1 text-[13px] font-black">תצוגה מקדימה בפייסבוק</div>
                <FacebookPreview identity={identity} text={postText} imageUrl={previewImg} />
              </div>
            </div>
          )
        )}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between">
        <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || activating} className="text-muted rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-40">← הקודם</button>
        {!onReview
          ? <button onClick={() => canNext && setStep((s) => s + 1)} disabled={!canNext} className="bg-brand rounded-xl px-5 py-2 text-sm font-bold text-white disabled:opacity-50">הבא →</button>
          : <button onClick={activate} disabled={activating || !property || chosen.length === 0} className="bg-brand rounded-xl px-6 py-2 text-sm font-black text-white disabled:opacity-50">{activating ? "מפעילים את הקמפיין…" : "הפעלת הקמפיין"}</button>}
      </div>
    </div>
  );
}

function Cell({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return <div className={cn("bg-surface rounded-xl p-3 text-right", full && "col-span-2")}><div className="text-muted text-[11px]">{label}</div><div className="text-ink mt-0.5 text-[14px] font-black">{value}</div></div>;
}

function Empty({ title, body, cta }: { title: string; body: string; cta?: { href: string; label: string } }) {
  return <div className="py-10 text-center"><p className="text-ink text-lg font-black">{title}</p><p className="text-muted mt-1 text-sm">{body}</p>{cta && <Link href={cta.href} className="bg-brand mt-4 inline-block rounded-xl px-5 py-2 text-sm font-bold text-white">{cta.label}</Link>}</div>;
}
