"use client";
// ============================================================================
// ZONO — Creative Studio 2.3 · the per-entity CREATION WORKSPACE (client).
// A premium creative workstation, not a form: a two-column composition — a
// dominant MAIN CANVAS (ratio-responsive property preview → generated creative
// hero) + a compact CREATION CONSOLE (goal · format · ZONO · Generate) that
// switches to a RESULT rail after generation. Reuses the proven generation path
// verbatim (QuickCreativeWizard drives generateQuickCreative; QuickResultCard
// renders older outputs). No engine/DB/distribution changes. One ZONO moment.
// All UI transitions are local state — the studio never flashes/reloads.
// ============================================================================
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { ZonoMark } from "@/components/zono/ZonoMark";
import { ENTITY_LABELS } from "@/lib/creative-studio/engine";
import type { CreativeStudio } from "@/lib/creative-studio/service";
import {
  CREATIVE_GOALS, CREATIVE_FORMATS, GOAL_LABEL_HE, GOAL_DESC_HE, FORMAT_LABEL_HE, FORMAT_RATIO,
  parsePreselect, distributionHandoffHref, type CreativeGoal, type CreativeFormat,
} from "@/lib/creative-studio/creative-preselect";
import { approveQuickAction, regenerateQuickAction, favoriteQuickAction, editQuickTextAction } from "@/lib/creative-studio/quick-creative-actions";
import { QuickCreativeWizard, QuickResultCard, type QuickOutput } from "../CreativeStudioView";
import type { AiProviderStatus } from "../CreativeStudioView";

type Wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) => void;
const GOAL_ICON: Record<CreativeGoal, string> = { property_ad_post: "Home", sold_post: "BadgeCheck", testimonial_post: "MessageCircle" };
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const LABEL = "text-muted text-[11.5px] font-black uppercase tracking-[0.08em]";

export function QuickCreativeWorkspace({ studio, quickOutputs, et, eid, wrap, orgId, userId, prefill, aiProvider, isManager }: {
  studio: CreativeStudio; quickOutputs: QuickOutput[]; et: string; eid: string; wrap: Wrap;
  orgId: string; userId: string; prefill?: Record<string, string | boolean | number>; aiProvider?: AiProviderStatus; isManager?: boolean;
}) {
  const sp = useSearchParams();
  const pre = parsePreselect({ goal: sp.get("goal"), format: sp.get("format") });
  const [goal, setGoal] = useState<CreativeGoal | null>(pre.goal);
  const [format, setFormat] = useState<CreativeFormat>(pre.format ?? "feed_1_1");
  const [wizardOpen, setWizardOpen] = useState(false);

  const newest = quickOutputs[0] ?? null;
  // The workspace has two MODES: create (ratio canvas + console) and result
  // (creative hero + action rail). Local state only — never a reload.
  const [mode, setMode] = useState<"create" | "result">(newest ? "result" : "create");
  const propertyImage = et === "property" ? str(prefill?.propertyImage) : "";
  const gridOutputs = (mode === "result" ? quickOutputs.slice(1) : quickOutputs).slice(0, 8);

  return (
    <section className="flex flex-col gap-4">
      <PropertyContextBar studio={studio} et={et} prefill={prefill} onNew={mode === "result" ? () => setMode("create") : undefined} />

      {/* WORKSPACE — canvas (dominant) + console/rail */}
      <div className="grid gap-4 lg:grid-cols-[1.65fr_1fr] lg:items-start">
        <div className="lg:sticky lg:top-4">
          {mode === "result" && newest
            ? <ResultCanvas o={newest} et={et} eid={eid} wrap={wrap} isManager={isManager} />
            : <CreateCanvas format={format} propertyImage={propertyImage} />}
        </div>
        <div>
          {mode === "result" && newest
            ? <ResultRail o={newest} et={et} eid={eid} wrap={wrap} onNew={() => setMode("create")} />
            : <CreateConsole goal={goal} format={format} setGoal={setGoal} setFormat={setFormat} aiProvider={aiProvider} onGenerate={() => setWizardOpen(true)} />}
        </div>
      </div>

      {gridOutputs.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-ink text-[14px] font-black">{mode === "result" ? "עוד יצירות לישות הזו" : "יצירות קודמות"}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gridOutputs.map((o) => <QuickResultCard key={o.id} o={o} et={et} eid={eid} wrap={wrap} canViewPrompt={isManager} />)}
          </div>
        </section>
      )}

      {wizardOpen && goal && (
        <QuickCreativeWizard type={goal} et={et} eid={eid} orgId={orgId} userId={userId} prefill={prefill} initialFormat={format} startStep={2} onClose={() => setWizardOpen(false)} />
      )}
    </section>
  );
}

// ── Property context bar — elegant, compact (not a CRM card) ───────────────────
function PropertyContextBar({ studio, et, prefill, onNew }: { studio: CreativeStudio; et: string; prefill?: Record<string, string | boolean | number>; onNew?: () => void }) {
  const isProp = et === "property";
  const img = isProp ? str(prefill?.propertyImage) : "";
  const address = isProp ? str(prefill?.address) : "";
  const area = isProp ? (str(prefill?.neighborhood) || str(prefill?.city)) : "";
  const priceRaw = isProp ? str(prefill?.price) : "";
  const priceNum = priceRaw ? Number(priceRaw) : NaN;
  const price = Number.isFinite(priceNum) && priceNum > 0 ? `₪${priceNum.toLocaleString("he-IL")}` : "";
  const line = [address, area].filter(Boolean).join(" · ");
  return (
    <div className="bg-card border-line flex items-center gap-3 rounded-2xl border p-2.5 pe-3 shadow-[var(--shadow-card)]">
      <Link href="/creative-studio" aria-label="חזרה לסטודיו" className="text-muted hover:text-ink hover:bg-surface grid h-9 w-9 shrink-0 place-items-center rounded-xl transition"><Icon name="ArrowLeft" size={17} /></Link>
      <span className="bg-surface grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl">
        {img ? <img src={img} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <Icon name={isProp ? "Home" : "Building"} size={17} className="text-muted" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ink truncate text-[15px] font-black leading-tight">{studio.entityName}</p>
        <p className="text-muted truncate text-[12px]">{line || (ENTITY_LABELS[et] ?? et)}</p>
      </div>
      {price && <span className="text-brand-strong hidden shrink-0 text-[15px] font-black sm:block">{price}</span>}
      {onNew && <button type="button" onClick={onNew} className="bg-brand-soft text-brand-strong ms-1 inline-flex shrink-0 items-center gap-1 rounded-xl px-3 py-2 text-[12.5px] font-bold transition hover:opacity-90"><Icon name="Plus" size={14} />יצירה חדשה</button>}
    </div>
  );
}

// ── MAIN CANVAS — create mode: ratio-responsive property preview ───────────────
function CreateCanvas({ format, propertyImage }: { format: CreativeFormat; propertyImage: string }) {
  const [w, h] = FORMAT_RATIO[format];
  return (
    <div className="bg-surface border-line grid min-h-[48vh] place-items-center rounded-3xl border p-4 sm:p-6 lg:min-h-[62vh]">
      <div
        className="relative h-[42vh] max-h-[600px] w-auto max-w-full overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5 transition-all duration-300 sm:h-[52vh] lg:h-[56vh]"
        style={{ aspectRatio: `${w} / ${h}` }}
      >
        {propertyImage
          ? <img src={propertyImage} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          : <div className="from-brand-soft to-brand-light/40 h-full w-full bg-gradient-to-br" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-black/5 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-1.5 p-4 text-center">
          <span className="text-brand-strong rounded-full bg-white/90 px-3 py-1 text-[12px] font-black shadow-sm">{FORMAT_LABEL_HE[format]}</span>
          <span className="text-[13px] font-bold text-white drop-shadow">הקריאייטיב יופיע כאן</span>
        </div>
      </div>
    </div>
  );
}

// ── MAIN CANVAS — result mode: the generated creative is the hero ──────────────
function ResultCanvas({ o, et, eid, wrap, isManager }: { o: QuickOutput; et: string; eid: string; wrap: Wrap; isManager?: boolean }) {
  const hasImage = !!o.image_url;
  return (
    <div className="bg-surface border-line grid min-h-[48vh] place-items-center rounded-3xl border p-4 sm:p-6 lg:min-h-[62vh]">
      {hasImage
        ? <img src={o.image_url as string} alt={o.variant_name || "קריאייטיב"} className="max-h-[68vh] w-auto max-w-full rounded-2xl object-contain shadow-xl ring-1 ring-black/5" />
        : <div className="w-full max-w-sm"><QuickResultCard o={o} et={et} eid={eid} wrap={wrap} canViewPrompt={isManager} /></div>}
    </div>
  );
}

// ── CREATION CONSOLE — goal · format · ZONO · Generate (fits ~one viewport) ─────
function CreateConsole({ goal, format, setGoal, setFormat, aiProvider, onGenerate }: {
  goal: CreativeGoal | null; format: CreativeFormat; setGoal: (g: CreativeGoal) => void; setFormat: (f: CreativeFormat) => void; aiProvider?: AiProviderStatus; onGenerate: () => void;
}) {
  return (
    <div className="bg-card border-line flex flex-col gap-4 rounded-3xl border p-5 shadow-[var(--shadow-card)]">
      <div>
        <p className={LABEL}>מה יוצרים?</p>
        <div className="mt-2 flex flex-col gap-2">
          {CREATIVE_GOALS.map((g) => {
            const active = goal === g;
            return (
              <button key={g} type="button" onClick={() => setGoal(g)} aria-pressed={active}
                className={`flex items-center gap-3 rounded-2xl border p-3 text-right transition ${active ? "border-brand bg-brand-soft/40" : "border-line hover:border-brand-light"}`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? "bg-brand text-white" : "bg-surface text-brand-strong"}`}><Icon name={GOAL_ICON[g]} size={17} /></span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink block text-[14px] font-black leading-tight">{GOAL_LABEL_HE[g]}</span>
                  <span className="text-muted block truncate text-[11.5px]">{GOAL_DESC_HE[g]}</span>
                </span>
                {active && <Icon name="CheckCircle" size={16} className="text-brand shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className={LABEL}>פורמט</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {CREATIVE_FORMATS.map((fmt) => {
            const [w, h] = FORMAT_RATIO[fmt];
            const active = format === fmt;
            return (
              <button key={fmt} type="button" onClick={() => setFormat(fmt)} aria-pressed={active}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border py-3 transition ${active ? "border-brand bg-brand-soft/40" : "border-line hover:border-brand-light"}`}>
                <span className="grid h-11 place-items-center">
                  <span className={`rounded ${active ? "bg-brand" : "bg-brand-light/60"}`} style={{ width: `${(w / h) * 2.7}rem`, height: `${Math.min(2.7, (h / w) * 1.5)}rem` }} />
                </span>
                <span className={`text-[11.5px] font-bold ${active ? "text-brand-strong" : "text-muted"}`}>{FORMAT_LABEL_HE[fmt]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <ZonoAssistLine goal={goal} format={format} aiProvider={aiProvider} />

      <div className="flex flex-col gap-1.5">
        <button type="button" disabled={!goal} onClick={onGenerate}
          className="bg-brand inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-[15px] font-black text-white shadow-lg transition hover:opacity-90 disabled:opacity-50">
          <Icon name="Sparkles" size={17} />יצירת הקריאייטיב
        </button>
        <p className="text-muted text-center text-[12px] font-semibold">{goal ? `${GOAL_LABEL_HE[goal]} · ${FORMAT_LABEL_HE[format]}` : "בחרו מטרה כדי להתחיל"}</p>
      </div>
    </div>
  );
}

function ZonoAssistLine({ goal, format, aiProvider }: { goal: CreativeGoal | null; format: CreativeFormat; aiProvider?: AiProviderStatus }) {
  const providerOn = !!aiProvider && aiProvider.provider !== "mock";
  const line = !goal
    ? "בחרו מטרה ופורמט — ואני כאן כדי להפוך אותם לקריאייטיב מוכן לפרסום."
    : `נבחר ${GOAL_LABEL_HE[goal]} בפורמט ${FORMAT_LABEL_HE[format]}${providerOn ? " — עם מנוע התמונות של ZONO." : " — הלוגו, הסוכן והמותג יישמרו."}`;
  return (
    <div className="border-line bg-brand-soft/40 flex items-center gap-3 rounded-2xl border px-3.5 py-3">
      <ZonoMark size="compact" state={goal ? "idea" : "welcome"} />
      <div className="min-w-0">
        <p className="text-ink text-[12.5px] font-black">זונו איתך ביצירה</p>
        <p className="text-muted text-[11.5px] leading-snug">{line}</p>
      </div>
    </div>
  );
}

// ── RESULT RAIL — the console switches to result actions after generation ──────
function RailBtn({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`border-line hover:bg-surface inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold transition ${active ? "text-warning" : "text-ink"}`}><Icon name={icon} size={14} />{label}</button>
  );
}

function ResultRail({ o, et, eid, wrap, onNew }: { o: QuickOutput; et: string; eid: string; wrap: Wrap; onNew: () => void }) {
  const [edit, setEdit] = useState(false);
  const distHref = distributionHandoffHref({ entityType: et, entityId: eid, isApproved: !!o.is_approved });
  const chip = o.is_approved ? { label: "מאושר", cls: "bg-success-soft text-success" }
    : o.status === "rejected" ? { label: "נדחה", cls: "bg-card text-muted border-line border" }
    : (o.image_status === "failed" || o.quality_status === "failed") ? { label: "נכשל", cls: "bg-danger-soft text-danger" }
    : { label: "טיוטה", cls: "bg-surface text-muted" };
  return (
    <div className="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ink text-[15px] font-black">התוצאה שלך</span>
        <button type="button" onClick={onNew} className="text-brand-strong inline-flex items-center gap-1 text-[12.5px] font-bold hover:underline"><Icon name="Plus" size={13} />יצירה חדשה</button>
      </div>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${chip.cls}`}>{chip.label}</span>
        <span className="text-muted text-[12px] font-semibold">{GOAL_LABEL_HE[o.output_type as CreativeGoal] ?? o.output_type} · {FORMAT_LABEL_HE[o.format as CreativeFormat] ?? o.format}</span>
        {o.overall_quality_score > 0 && <span className="bg-ink text-card ms-auto rounded-full px-2 py-0.5 text-[11px] font-black">ציון {o.overall_quality_score}</span>}
      </div>

      <button type="button" onClick={() => wrap(() => approveQuickAction({ outputId: o.id, entityType: et, entityId: eid }), `w-ap-${o.id}`)}
        className="bg-brand inline-flex items-center justify-center gap-1.5 rounded-2xl px-4 py-3 text-[14px] font-black text-white transition hover:opacity-90"><Icon name="CheckCircle" size={16} />{o.is_approved ? "מאושר ✓" : "אישור הקריאייטיב"}</button>

      <div className="flex flex-wrap gap-2">
        <RailBtn icon="RefreshCw" label="יצירה מחדש" onClick={() => wrap(() => regenerateQuickAction({ requestId: o.request_id, entityType: et, entityId: eid }), `w-rg-${o.id}`)} />
        <RailBtn icon="Pencil" label="עריכת טקסט" onClick={() => setEdit((v) => !v)} />
        <RailBtn icon="Star" label="מועדף" active={o.is_favorite} onClick={() => wrap(() => favoriteQuickAction({ outputId: o.id, value: !o.is_favorite, entityType: et, entityId: eid }), `w-fv-${o.id}`)} />
        {o.image_url && <a href={o.image_url as string} download target="_blank" rel="noopener noreferrer" className="border-line text-ink hover:bg-surface inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold"><Icon name="Download" size={14} />הורדה</a>}
      </div>

      {edit && <EditTextPanel o={o} et={et} eid={eid} wrap={wrap} onDone={() => setEdit(false)} />}

      {distHref && <Link href={distHref} className="border-line hover:bg-surface text-ink inline-flex items-center justify-center gap-1.5 rounded-2xl border px-4 py-3 text-[13px] font-bold transition"><Icon name="Share2" size={14} className="text-brand-strong" />המשך להפצה →</Link>}
      <p className="text-muted text-[11px]">עריכת טקסט משנה את הכיתוב בלבד — לא את התמונה שנוצרה.</p>
    </div>
  );
}

function EditTextPanel({ o, et, eid, wrap, onDone }: { o: QuickOutput; et: string; eid: string; wrap: Wrap; onDone: () => void }) {
  const [f, setF] = useState({ headline: str(o.headline), subheadline: str((o as Record<string, unknown>).subheadline), body_text: str((o as Record<string, unknown>).body_text), cta_text: str(o.cta_text) });
  const input = "border-line bg-surface text-ink w-full rounded-lg border px-3 py-2 text-[13px]";
  const save = () => { wrap(() => editQuickTextAction({ outputId: o.id, patch: f, entityType: et, entityId: eid }), `w-ed-${o.id}`); onDone(); };
  return (
    <div className="bg-surface border-line flex flex-col gap-2 rounded-xl border p-3">
      <input className={input} placeholder="כותרת" value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} />
      <input className={input} placeholder="כותרת משנה" value={f.subheadline} onChange={(e) => setF({ ...f, subheadline: e.target.value })} />
      <textarea className={input} placeholder="טקסט" rows={2} value={f.body_text} onChange={(e) => setF({ ...f, body_text: e.target.value })} />
      <input className={input} placeholder="קריאה לפעולה" value={f.cta_text} onChange={(e) => setF({ ...f, cta_text: e.target.value })} />
      <div className="flex gap-2">
        <button type="button" onClick={save} className="bg-brand rounded-lg px-4 py-2 text-[12.5px] font-bold text-white">שמירת טקסט</button>
        <button type="button" onClick={onDone} className="border-line text-ink rounded-lg border px-4 py-2 text-[12.5px] font-bold">ביטול</button>
      </div>
    </div>
  );
}
