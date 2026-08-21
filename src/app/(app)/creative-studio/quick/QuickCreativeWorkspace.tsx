"use client";
// ============================================================================
// ZONO — Creative Studio 2.2 · the per-entity CREATION WORKSPACE (client).
// A modern, focused, real-estate-first creation flow: Context → Goal → Format →
// (ZONO helper) → Generate → Result-dominant workspace. It REUSES the proven
// generation path — the exact QuickCreativeWizard drives generateQuickCreative,
// and QuickResultCard renders results — so generation semantics are UNTOUCHED.
// Goal/format are visual selectors that preconfigure the wizard (skipping its
// format step). URL ?goal/?format initialize the selection (validated). One ZONO
// mascot moment only. No fake AI, no variation, no async job invention.
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
  const rest = quickOutputs.slice(1, 8);

  return (
    <section className="flex flex-col gap-5">
      <EntityContextHeader studio={studio} et={et} prefill={prefill} />

      {/* CREATION PANEL — goal → format → helper → generate */}
      <div className="bg-card border-line flex flex-col gap-5 rounded-[22px] border p-5 shadow-[var(--shadow-card)]">
        <div>
          <h2 className="text-ink text-lg font-black">מה ניצור היום?</h2>
          <p className="text-muted text-[12.5px]">בחרו מטרה ופורמט — וזונו יוביל אתכם ליצירה מוכנה לפרסום.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {CREATIVE_GOALS.map((g) => (
            <button key={g} type="button" onClick={() => setGoal(g)} aria-pressed={goal === g}
              className={`flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-right transition ${goal === g ? "border-brand bg-brand-soft/40" : "border-line bg-surface hover:border-brand-light"}`}>
              <span className={`grid h-9 w-9 place-items-center rounded-xl ${goal === g ? "bg-brand text-white" : "bg-card text-brand-strong"}`}><Icon name={GOAL_ICON[g]} size={17} /></span>
              <span className="text-ink text-[14px] font-black">{GOAL_LABEL_HE[g]}</span>
              <span className="text-muted text-[11.5px] leading-snug">{GOAL_DESC_HE[g]}</span>
            </button>
          ))}
        </div>

        <div>
          <p className="text-muted mb-2 text-[12.5px] font-bold">פורמט</p>
          <div className="flex flex-wrap gap-3">
            {CREATIVE_FORMATS.map((fmt) => {
              const [w, h] = FORMAT_RATIO[fmt];
              const active = format === fmt;
              return (
                <button key={fmt} type="button" onClick={() => setFormat(fmt)} aria-pressed={active}
                  className={`flex flex-col items-center gap-1.5 rounded-2xl border px-4 py-3 transition ${active ? "border-brand bg-brand-soft/40" : "border-line bg-surface hover:border-brand-light"}`}>
                  <span className="grid h-14 place-items-center">
                    <span className={`rounded-md ${active ? "bg-brand" : "bg-brand-light/60"}`} style={{ width: `${(w / h) * 3.2}rem`, height: `${Math.min(3.2, (h / w) * 1.9)}rem` }} />
                  </span>
                  <span className={`text-[12.5px] font-bold ${active ? "text-brand-strong" : "text-muted"}`}>{FORMAT_LABEL_HE[fmt]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* The ONE ZONO moment — honest helper reflecting real selections + provider */}
        <ZonoAssistLine goal={goal} format={format} aiProvider={aiProvider} />

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={!goal} onClick={() => setWizardOpen(true)}
            className="bg-brand inline-flex items-center gap-2 rounded-xl px-6 py-3 text-[15px] font-black text-white shadow-lg transition hover:opacity-90 disabled:opacity-50">
            <Icon name="Sparkles" size={17} />יצירת הקריאייטיב
          </button>
          {goal && <span className="text-muted text-[12.5px] font-semibold">{GOAL_LABEL_HE[goal]} · {FORMAT_LABEL_HE[format]}</span>}
          {!goal && <span className="text-muted text-[12px]">בחרו מטרה כדי להתחיל</span>}
        </div>
      </div>

      {/* RESULT-DOMINANT WORKSPACE */}
      {newest && <ResultWorkspace newest={newest} et={et} eid={eid} wrap={wrap} isManager={isManager} />}
      {rest.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-ink text-[14px] font-black">עוד יצירות לישות הזו</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {rest.map((o) => <QuickResultCard key={o.id} o={o} et={et} eid={eid} wrap={wrap} canViewPrompt={isManager} />)}
          </div>
        </section>
      )}

      {wizardOpen && goal && (
        <QuickCreativeWizard type={goal} et={et} eid={eid} orgId={orgId} userId={userId} prefill={prefill} initialFormat={format} startStep={2} onClose={() => setWizardOpen(false)} />
      )}
    </section>
  );
}

// ── Entity context header (compact; no mascot here — the ONE mascot is below) ──
function EntityContextHeader({ studio, et, prefill }: { studio: CreativeStudio; et: string; prefill?: Record<string, string | boolean | number> }) {
  const isProp = et === "property";
  const img = isProp ? str(prefill?.propertyImage) : "";
  const address = isProp ? str(prefill?.address) : "";
  const city = isProp ? str(prefill?.city) : "";
  const priceRaw = isProp ? str(prefill?.price) : "";
  const priceNum = priceRaw ? Number(priceRaw) : NaN;
  const sub = [address || city, Number.isFinite(priceNum) && priceNum > 0 ? `₪${priceNum.toLocaleString("he-IL")}` : null].filter(Boolean).join(" · ") || (ENTITY_LABELS[et] ?? et);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Link href="/creative-studio" className="text-muted hover:text-ink inline-flex items-center gap-1 text-[13px] font-bold"><Icon name="ArrowLeft" size={15} />חזרה לסטודיו</Link>
      <div className="bg-card border-line flex flex-1 items-center gap-3 rounded-2xl border p-3 shadow-[var(--shadow-card)]">
        <span className="bg-surface grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl">
          {img ? <img src={img} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" /> : <Icon name={isProp ? "Home" : "Building"} size={18} className="text-muted" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ink truncate text-[15px] font-black">{studio.entityName}</p>
          <p className="text-muted truncate text-[12px]">{sub}</p>
        </div>
        <span className="bg-surface text-muted shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold">{ENTITY_LABELS[et] ?? et}</span>
      </div>
    </div>
  );
}

function ZonoAssistLine({ goal, format, aiProvider }: { goal: CreativeGoal | null; format: CreativeFormat; aiProvider?: AiProviderStatus }) {
  const providerOn = !!aiProvider && aiProvider.provider !== "mock";
  const line = !goal
    ? "בחרו מטרה ופורמט — ואני כאן כדי להפוך אותם לקריאייטיב מוכן לפרסום."
    : `מוכן ליצור ${GOAL_LABEL_HE[goal]} בפורמט ${FORMAT_LABEL_HE[format]}${providerOn ? " — עם מנוע התמונות של ZONO" : " — הלוגו, הסוכן והמותג יישמרו"}.`;
  return (
    <div className="border-line bg-brand-soft/40 flex items-center gap-3 rounded-2xl border px-4 py-3">
      <ZonoMark size="compact" state={goal ? "idea" : "welcome"} />
      <div>
        <p className="text-ink text-[13px] font-black">זונו איתך ביצירה</p>
        <p className="text-muted text-[12px]">{line}</p>
      </div>
    </div>
  );
}

// ── Result-dominant: large preview + a focused control rail (real actions only) ─
function ResultWorkspace({ newest, et, eid, wrap, isManager }: { newest: QuickOutput; et: string; eid: string; wrap: Wrap; isManager?: boolean }) {
  const o = newest;
  const hasImage = !!o.image_url;
  const distHref = distributionHandoffHref({ entityType: et, entityId: eid, isApproved: !!o.is_approved });
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-ink text-lg font-black">התוצאה האחרונה</h2>
      <div className="grid gap-4 lg:grid-cols-[1.5fr_0.5fr]">
        <div className="bg-card border-line grid place-items-center overflow-hidden rounded-2xl border p-2 shadow-[var(--shadow-card)]">
          {hasImage
            ? <img src={o.image_url as string} alt={o.variant_name || "קריאייטיב"} className="max-h-[70vh] w-full rounded-xl object-contain" />
            : <div className="w-full max-w-sm p-2"><QuickResultCard o={o} et={et} eid={eid} wrap={wrap} canViewPrompt={isManager} /></div>}
        </div>
        {hasImage && <ResultRail o={o} et={et} eid={eid} wrap={wrap} distHref={distHref} />}
      </div>
    </section>
  );
}

function RailBtn({ icon, label, active, onClick }: { icon: string; label: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`border-line inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold transition hover:bg-surface ${active ? "text-warning" : "text-ink"}`}><Icon name={icon} size={14} />{label}</button>
  );
}

function ResultRail({ o, et, eid, wrap, distHref }: { o: QuickOutput; et: string; eid: string; wrap: Wrap; distHref: string | null }) {
  const [edit, setEdit] = useState(false);
  const chip = o.is_approved ? { label: "מאושר", cls: "bg-success-soft text-success" }
    : o.status === "rejected" ? { label: "נדחה", cls: "bg-card text-muted border-line border" }
    : (o.image_status === "failed" || o.quality_status === "failed") ? { label: "נכשל", cls: "bg-danger-soft text-danger" }
    : { label: "טיוטה", cls: "bg-surface text-muted" };
  return (
    <div className="bg-card border-line flex flex-col gap-2.5 rounded-2xl border p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${chip.cls}`}>{chip.label}</span>
        {o.overall_quality_score > 0 && <span className="bg-ink text-card rounded-full px-2 py-0.5 text-[11px] font-black">ציון {o.overall_quality_score}</span>}
      </div>
      <div className="text-muted text-[12px] font-semibold">{GOAL_LABEL_HE[o.output_type as CreativeGoal] ?? o.output_type} · {FORMAT_LABEL_HE[o.format as CreativeFormat] ?? o.format}</div>

      <button type="button" onClick={() => wrap(() => approveQuickAction({ outputId: o.id, entityType: et, entityId: eid }), `w-ap-${o.id}`)}
        className="bg-brand inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"><Icon name="CheckCircle" size={15} />{o.is_approved ? "מאושר ✓" : "אישור הקריאייטיב"}</button>

      <div className="flex flex-wrap gap-2">
        <RailBtn icon="RefreshCw" label="יצירה מחדש" onClick={() => wrap(() => regenerateQuickAction({ requestId: o.request_id, entityType: et, entityId: eid }), `w-rg-${o.id}`)} />
        <RailBtn icon="Pencil" label="עריכת טקסט" onClick={() => setEdit((v) => !v)} />
        <RailBtn icon="Star" label="מועדף" active={o.is_favorite} onClick={() => wrap(() => favoriteQuickAction({ outputId: o.id, value: !o.is_favorite, entityType: et, entityId: eid }), `w-fv-${o.id}`)} />
        {o.image_url && <a href={o.image_url as string} download target="_blank" rel="noopener noreferrer" className="border-line text-ink hover:bg-surface inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[12.5px] font-bold"><Icon name="Download" size={14} />הורדה</a>}
      </div>

      {edit && <EditTextPanel o={o} et={et} eid={eid} wrap={wrap} onDone={() => setEdit(false)} />}

      {distHref && <Link href={distHref} className="border-line hover:bg-surface text-ink inline-flex items-center justify-center gap-1.5 rounded-xl border px-4 py-2.5 text-[13px] font-bold transition"><Icon name="Share2" size={14} className="text-brand-strong" />המשך להפצה →</Link>}
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
