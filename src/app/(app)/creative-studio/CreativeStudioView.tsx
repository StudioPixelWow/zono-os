"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { uploadMarketingAsset } from "@/lib/creative-studio/assets";
import {
  saveDnaAction, lockDnaAction, updateAssetFlagsAction, deleteAssetAction, submitFeedbackAction, analyzeMarketingDnaAction,
} from "@/lib/creative-studio/actions";
import {
  generateConceptsAction, favoriteConceptAction, approveConceptAction, deleteConceptAction,
} from "@/lib/creative-studio/concept-actions";
import {
  ENTITY_LABELS, ASSET_TYPE_LABELS, LIBRARY_FILTERS, assetBadges, DNA_SCORES, FEEDBACK_BUTTONS, type AssetLike,
} from "@/lib/creative-studio/engine";
import { CONCEPT_TYPE_LABELS } from "@/lib/creative-studio/concept-engine";
import {
  generateCampaignAction, duplicateCampaignAction, archiveCampaignAction, deleteCampaignAction, approveCampaignAction,
} from "@/lib/creative-studio/campaign-actions";
import { CAMPAIGN_TYPE_LABELS, campaignTypesFor } from "@/lib/creative-studio/campaign-engine";
import {
  generateAssetsAction, favoriteAssetAction, approveAssetAction, rejectAssetAction, duplicateAssetAction, approveAllAssetsAction,
} from "@/lib/creative-studio/asset-actions";
import { CREATIVE_ASSET_TYPE_LABELS, OBJECTIVE_LABELS } from "@/lib/creative-studio/asset-generator";
import {
  generateCopyAction, favoriteCopyAction, approveCopyAction, rejectCopyAction, regenerateCopyAction,
} from "@/lib/creative-studio/copy-actions";
import { COPY_TYPE_LABELS } from "@/lib/creative-studio/copy-engine";
import {
  generateOutputsAction, favoriteOutputAction, approveOutputAction, rejectOutputAction, duplicateOutputAction, regenerateOutputAction,
} from "@/lib/creative-studio/output-actions";
import { OUTPUT_TYPE_LABELS } from "@/lib/creative-studio/production-engine";
import {
  generateVisualAction, variationVisualAction, approveVisualAction, rejectVisualAction, favoriteVisualAction,
} from "@/lib/creative-studio/visual-actions";
import { VISUAL_TYPE_LABELS, VARIATION_MODES } from "@/lib/creative-studio/visual-dna";
import {
  generateQuickCreativeAction, brandPreviewAction, favoriteQuickAction, approveQuickAction, rejectQuickAction, duplicateQuickAction, regenerateQuickAction,
} from "@/lib/creative-studio/quick-creative-actions";
import { QUICK_TYPE_LABELS } from "@/lib/creative-studio/quick-creative-engine";
import type { CreativeStudio } from "@/lib/creative-studio/service";

type QuickOutput = Record<string, unknown> & {
  id: string; request_id: string; output_type: string; variant_name: string; format: string; title: string | null; render_data: RenderData;
  headline: string | null; cta_text: string | null; overall_score: number; brand_match_score: number; readability_score: number; seller_lead_score: number; buyer_lead_score: number; is_approved: boolean; is_favorite: boolean; status: string;
  internal_prompt: string | null; creative_strategy: string | null; visual_hook: string | null; scroll_stop_reason: string | null; scroll_stop_score: number; creative_director_score: number; anti_ai_score: number; rtl_readability_score: number;
};

type Visual = Record<string, unknown> & {
  id: string; visual_type: string; provider: string; image_url: string | null; generation_reason: string | null; overall_score: number;
  brand_match_score: number; realism_score: number; property_relevance_score: number; marketing_relevance_score: number; conversion_score: number; status: string; is_approved: boolean; is_rejected: boolean; is_favorite: boolean;
};

type RenderBlock = { component: string; text?: string; items?: string[]; align?: string; emphasis?: string; imageUrl?: string };
type RenderData = { format: string; width: number; height: number; layoutLabel?: string; palette: { bg: string; bg2: string; text: string; muted: string; accent: string; onAccent: string }; blocks: RenderBlock[] };
type Output = Record<string, unknown> & {
  id: string; output_type: string; title: string | null; status: string; render_data: RenderData; overall_score: number;
  brand_match_score: number; marketing_match_score: number; readability_score: number; hierarchy_score: number; conversion_score: number; is_approved: boolean; is_favorite: boolean;
};

type Copy = Record<string, unknown> & {
  id: string; creative_asset_id: string | null; copy_type: string; title: string | null; headline: string | null; subheadline: string | null; body: string | null; cta: string | null;
  platform: string | null; tone: string | null; audience: string | null; reasoning: string | null; status: string; confidence_score: number; is_approved: boolean; is_favorite: boolean;
};

type CreativeAsset = Record<string, unknown> & {
  id: string; campaign_id: string; asset_type: string; title: string; objective: string | null; audience: string | null; marketing_angle: string | null; emotional_trigger: string | null;
  visual_hook: string | null; copy_hook: string | null; cta_style: string | null; recommended_layout: string | null; priority: number; reasoning: string | null;
  asset_score: number; campaign_match_score: number; audience_match_score: number; conversion_potential_score: number; marketing_strength_score: number; asset_status: string; is_favorite: boolean; is_approved: boolean;
};
const ASSET_STATUS_HE: Record<string, string> = { draft: "טיוטה", approved: "מאושר", rejected: "נדחה", archived: "ארכיון", produced: "הופק" };

type Campaign = Record<string, unknown> & {
  id: string; title: string; campaign_type: string; status: string; updated_at: string; assetCount: number; completion: number;
  objective: string | null; target_audience: string | null; marketing_angle: string | null; campaign_summary: string | null; reasoning: string | null; generation_metadata: unknown;
};
type CampaignAsset = Record<string, unknown> & {
  id: string; campaign_id: string; asset_type: string; title: string | null; purpose: string | null; recommended_message: string | null; recommended_cta: string | null; audience_variant: string | null; priority: number; status: string;
};
const ASSET_TYPE_HE: Record<string, string> = { feed_post: "פוסט פיד", story: "סטורי", carousel: "קרוסלה", reel_cover: "כריכת ריל" };
const CAMPAIGN_STATUS_HE: Record<string, string> = { draft: "טיוטה", approved: "מאושר", archived: "ארכיון", active: "פעיל" };

type Concept = Record<string, unknown> & {
  id: string; title: string; concept_type: string; description: string | null; marketing_angle: string | null; emotional_trigger: string | null;
  visual_hook: string | null; copy_hook: string | null; recommended_layout: string | null; recommended_cta_style: string | null; recommended_audience: string | null;
  reasoning: string | null; confidence_score: number; is_favorite: boolean; is_approved: boolean;
};

type Asset = Record<string, unknown> & AssetLike & { id: string; title: string | null; file_url: string; thumbnail_url: string | null; file_mime_type: string | null; created_at: string; tags: string[] };
type Dna = Record<string, unknown>;
type Runner = ReturnType<typeof useActionRunner>;
type Wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) => void;

export function CreativeStudioView({ studio, concepts: conceptsRaw, campaigns: campaignsRaw, campaignAssets: campaignAssetsRaw, creativeAssets: creativeAssetsRaw, copyAssets: copyAssetsRaw, creativeOutputs: creativeOutputsRaw, visuals: visualsRaw, quickOutputs: quickOutputsRaw, isManager = false, orgId, userId }: { studio: CreativeStudio; concepts?: Record<string, unknown>[]; campaigns?: Record<string, unknown>[]; campaignAssets?: Record<string, unknown>[]; creativeAssets?: Record<string, unknown>[]; copyAssets?: Record<string, unknown>[]; creativeOutputs?: Record<string, unknown>[]; visuals?: Record<string, unknown>[]; quickOutputs?: Record<string, unknown>[]; isManager?: boolean; orgId: string; userId: string }) {
  const concepts = (conceptsRaw ?? []) as unknown as Concept[];
  const campaigns = (campaignsRaw ?? []) as unknown as Campaign[];
  const campaignAssets = (campaignAssetsRaw ?? []) as unknown as CampaignAsset[];
  const creativeAssets = (creativeAssetsRaw ?? []) as unknown as CreativeAsset[];
  const copyAssets = (copyAssetsRaw ?? []) as unknown as Copy[];
  const creativeOutputs = (creativeOutputsRaw ?? []) as unknown as Output[];
  const visuals = (visualsRaw ?? []) as unknown as Visual[];
  const quickOutputs = (quickOutputsRaw ?? []) as unknown as QuickOutput[];
  const router = useRouter();
  const r = useActionRunner();
  const [filter, setFilter] = useState("all");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const wrap: Wrap = (fn, id, pending) =>
    r.run(async () => { const res = await fn(); if (res.error) throw new Error(res.error); return res; }, { id, pendingMessage: pending, success: (x) => x.message ?? null });

  const assets = studio.assets as Asset[];
  const dna = studio.dna as Dna | null;
  const et = studio.entityType, eid = studio.entityId;
  const activeFilter = LIBRARY_FILTERS.find((f) => f.key === filter) ?? LIBRARY_FILTERS[0];
  const filtered = assets.filter((a) => activeFilter.match(a));

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      {/* SECTION 1 — HEADER */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="bg-brand text-white grid h-9 w-9 place-items-center rounded-xl"><Icon name="Presentation" size={18} /></span>
            <h1 className="text-ink text-2xl font-black">{studio.entityName}</h1>
            <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[11px] font-bold">{ENTITY_LABELS[et] ?? et}</span>
          </div>
          <p className="text-muted text-sm">סטודיו שיווק נדל״ן — כל החומרים, הסגנון וה-DNA השיווקי במקום אחד.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setUploadOpen(true)}><Icon name="Plus" size={14} />העלאת חומרים</Button>
          <Button size="sm" variant="secondary" loading={r.busyId === "analyze"} onClick={() => { setAnalyzing(true); wrap(() => analyzeMarketingDnaAction(et, eid).finally(() => { setAnalyzing(false); router.refresh(); }), "analyze", "ZONO מנתח את הסגנון השיווקי והנדל״ני..."); }}><Icon name="Sparkles" size={14} />נתח DNA שיווקי</Button>
        </div>
      </header>

      {analyzing && (
        <div className="bg-brand-soft/40 text-brand-strong flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold">
          <Icon name="Sparkles" size={15} />ZONO מנתח את הסגנון השיווקי והנדל״ני...
        </div>
      )}
      <p className="text-muted text-[12px]">הניתוח מבוסס על חומרים שהועלו, רפרנסים שאושרו, רפרנסים שנפסלו, תמונות נכס, הדמיות, תוכניות והערות הצוות.</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="חומרים" value={studio.stats.totalAssets} tone="text-ink" />
        <Kpi label="רפרנסים מאושרים" value={studio.stats.approvedReferences} tone="text-success" />
        <Kpi label="רפרנסים שנפסלו" value={studio.stats.rejectedReferences} tone="text-danger" />
        <Kpi label="מתחרים" value={studio.stats.competitorReferences} tone="text-warning" />
        <Kpi label="סטטוס DNA" value={DNA_STATUS[studio.stats.dnaStatus] ?? "—"} tone="text-brand-strong" />
        <Kpi label="ביטחון AI" value={dna ? `${(dna.ai_confidence_score as number) ?? 0}%` : "—"} tone="text-ink" />
      </div>
      {studio.stats.lastAnalyzedAt && <p className="text-muted text-[12px]">ניתוח אחרון: {new Date(studio.stats.lastAnalyzedAt).toLocaleString("he-IL")}</p>}

      <ActionFeedback runner={r} />

      {/* QUICK CREATIVE TEMPLATES — יצירה מהירה */}
      <QuickCreativeSection outputs={quickOutputs} et={et} eid={eid} wrap={wrap} canViewPrompt={isManager} />

      {/* SECTION 2 — ASSETS LIBRARY */}
      <section className="flex flex-col gap-3">
        <h2 className="text-ink text-lg font-black">ספריית חומרים שיווקיים</h2>
        <div className="flex flex-wrap gap-1.5">
          {LIBRARY_FILTERS.map((f) => (
            <button key={f.key} onClick={() => setFilter(f.key)} className={`rounded-full px-3 py-1 text-[12px] font-bold ${filter === f.key ? "bg-brand text-white" : "bg-surface text-muted"}`}>{f.label}</button>
          ))}
        </div>
        {filtered.length === 0 ? (
          <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">אין חומרים בקטגוריה זו — העלה חומר ראשון</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {filtered.map((a) => <AssetCard key={a.id} a={a} wrap={wrap} et={et} eid={eid} />)}
          </div>
        )}
      </section>

      {/* SECTION 4 — DNA PANEL */}
      <DnaPanel dna={dna} defaultAvoid={studio.defaultAvoidRules} defaultPrefer={studio.defaultPreferRules} />

      {/* WHAT ZONO LEARNED */}
      <LearnedBlock dna={dna} />

      {/* SECTION 5 — EDITABLE DNA */}
      <DnaEditor dna={dna} et={et} eid={eid} r={r} wrap={wrap} />

      {/* SECTION 6 — FEEDBACK */}
      <section className="flex flex-col gap-3">
        <h2 className="text-ink text-lg font-black">למידה ומשוב</h2>
        <p className="text-muted text-[12px]">כל לחיצה נשמרת ומלמדת את ה-DNA השיווקי (התאמת ציונים דטרמיניסטית).</p>
        <div className="flex flex-wrap gap-1.5">
          {FEEDBACK_BUTTONS.map((f) => (
            <button key={f.type} disabled={r.busyId === `fb-${f.type}`} onClick={() => wrap(() => submitFeedbackAction({ entityType: et, entityId: eid, feedbackType: f.type }), `fb-${f.type}`)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-bold disabled:opacity-50 ${f.tone ?? "bg-surface text-ink"}`}>{f.label}</button>
          ))}
        </div>
      </section>

      {/* CONCEPTS — Phase 3 */}
      <ConceptsSection concepts={concepts ?? []} et={et} eid={eid} r={r} wrap={wrap} />

      {/* CAMPAIGN FACTORY — Phase 4 */}
      <CampaignsSection campaigns={campaigns} assets={campaignAssets} et={et} eid={eid} r={r} wrap={wrap} />

      {/* CREATIVE ASSET GENERATOR — Phase 5 */}
      <CreativeAssetsSection assets={creativeAssets} campaigns={campaigns} et={et} eid={eid} r={r} wrap={wrap} />

      {/* COPY GENERATION ENGINE — Phase 6 */}
      <CopySection copy={copyAssets} assets={creativeAssets} et={et} eid={eid} r={r} wrap={wrap} />

      {/* CREATIVE PRODUCTION ENGINE — Phase 7 */}
      <OutputsSection outputs={creativeOutputs} assets={creativeAssets} et={et} eid={eid} r={r} wrap={wrap} />

      {/* AI VISUAL GENERATION — Phase 8 */}
      <VisualsSection visuals={visuals} outputs={creativeOutputs} et={et} eid={eid} r={r} wrap={wrap} />

      {/* SECTION 7 — GENERATOR PLACEHOLDER */}
      <section className="bg-brand-soft/30 border-line rounded-2xl border border-dashed p-6 text-center">
        <div className="mb-1 flex items-center justify-center gap-2"><Icon name="Sparkles" size={18} className="text-brand-strong" /><h2 className="text-ink text-lg font-black">יצירת קמפיין נדל״ן</h2></div>
        <p className="text-muted mx-auto max-w-xl text-sm">בשלב הבא ZONO יוכל לייצר סטים מלאים של מודעות, סטוריז, קרוסלות, רילס וקמפיינים לפי ה-DNA השיווקי של הסוכן, הנכס או הפרויקט.</p>
        <button disabled className="bg-surface text-muted mt-3 cursor-not-allowed rounded-xl px-4 py-2 text-sm font-bold opacity-70">בקרוב: צור קמפיין נדל״ן</button>
      </section>

      {/* SECTION 3 — UPLOAD MODAL */}
      {uploadOpen && <UploadModal onClose={() => setUploadOpen(false)} onDone={() => { setUploadOpen(false); router.refresh(); }} orgId={orgId} userId={userId} et={et} eid={eid} />}
    </main>
  );
}

const DNA_STATUS: Record<string, string> = { none: "אין", draft: "טיוטה", locked: "נעול", active: "פעיל" };

function Kpi({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return <div className="bg-card border-line flex flex-col gap-0.5 rounded-2xl border p-3 shadow-sm"><span className="text-muted text-[11px] font-bold">{label}</span><span className={`text-lg font-black ${tone}`}>{value}</span></div>;
}

function AssetCard({ a, wrap, et, eid }: { a: Asset; wrap: Wrap; et: string; eid: string }) {
  const [menu, setMenu] = useState(false);
  const isImg = (a.file_mime_type ?? "").startsWith("image/");
  const flag = (key: string, val: boolean) => wrap(() => updateAssetFlagsAction({ assetId: a.id, flags: { [key]: val }, entityType: et, entityId: eid }), `f-${a.id}`);
  return (
    <div className="bg-card border-line overflow-hidden rounded-2xl border shadow-sm">
      <div className="bg-surface relative aspect-square">
        {isImg && a.thumbnail_url ? <img src={a.thumbnail_url} alt={a.title ?? ""} className="h-full w-full object-cover" /> : <div className="text-muted grid h-full place-items-center"><Icon name={a.file_mime_type === "application/pdf" ? "Presentation" : "Map"} size={28} /></div>}
      </div>
      <div className="flex flex-col gap-1.5 p-3">
        <div className="flex items-center justify-between gap-1">
          <span className="text-muted text-[10px] font-bold">{ASSET_TYPE_LABELS[a.asset_type] ?? a.asset_type}</span>
          <button onClick={() => setMenu(!menu)} className="text-muted text-[11px]"><Icon name="Filter" size={13} /></button>
        </div>
        {a.title && <p className="text-ink truncate text-[13px] font-bold">{a.title}</p>}
        <div className="flex flex-wrap gap-1">{assetBadges(a).map((b, i) => <span key={i} className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${b.tone}`}>{b.label}</span>)}</div>
        <span className="text-muted text-[10px]">{new Date(a.created_at).toLocaleDateString("he-IL")}</span>
        {menu && (
          <div className="border-line mt-1 flex flex-col gap-1 border-t pt-2 text-[11px]">
            <QA label="סמן כרפרנס מאושר" onClick={() => flag("is_approved_reference", !a.is_approved_reference)} active={a.is_approved_reference} />
            <QA label="סמן כרפרנס שנפסל" onClick={() => flag("is_rejected_reference", !a.is_rejected_reference)} active={a.is_rejected_reference} />
            <QA label="סמן כמתחרה" onClick={() => flag("is_competitor_reference", !a.is_competitor_reference)} active={a.is_competitor_reference} />
            <QA label="סמן כתמונת נכס" onClick={() => flag("is_property_photo", !a.is_property_photo)} active={a.is_property_photo} />
            <QA label="סמן כתוכנית" onClick={() => flag("is_floor_plan", !a.is_floor_plan)} active={a.is_floor_plan} />
            <QA label="סמן כהדמיית פרויקט" onClick={() => flag("is_project_render", !a.is_project_render)} active={a.is_project_render} />
            <a href={a.file_url} target="_blank" rel="noreferrer" className="text-brand-strong">צפה</a>
            <button onClick={() => wrap(() => deleteAssetAction({ assetId: a.id, entityType: et, entityId: eid }), `del-${a.id}`)} className="text-danger text-right">מחק</button>
          </div>
        )}
      </div>
    </div>
  );
}
function QA({ label, onClick, active }: { label: string; onClick: () => void; active: boolean }) {
  return <button onClick={onClick} className={`text-right ${active ? "text-success font-bold" : "text-ink"}`}>{active ? "✓ " : ""}{label}</button>;
}

function DnaPanel({ dna, defaultAvoid, defaultPrefer }: { dna: Dna | null; defaultAvoid: string[]; defaultPrefer: string[] }) {
  const score = (k: string) => (dna ? (dna[k] as number) ?? 50 : 50);
  const colors = (dna?.primary_colors as unknown[]) ?? [];
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-ink text-lg font-black">DNA שיווקי</h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="צבעים מובילים">
          {colors.length ? <div className="flex flex-wrap gap-1.5">{colors.slice(0, 12).map((c, i) => <span key={i} className="border-line h-6 w-6 rounded-full border" style={{ background: typeof c === "string" ? c : "#ccc" }} />)}</div> : <p className="text-muted text-[12px]">טרם נותחו צבעים — יופקו מניתוח ה-AI בשלב הבא.</p>}
        </Card>
        <Card title="סגנון שיווקי">{textOr(dna?.visual_personality as string)}</Card>
        <Card title="קהל יעד">{listOr(dna?.target_audiences as unknown[])}</Card>
        <Card title="זוויות שיווק מומלצות">{listOr(dna?.preferred_campaign_angles as unknown[])}</Card>
        <Card title="דברים שהסוכן אוהב">{listOr((dna?.brand_rules as unknown[]) ?? defaultPrefer)}</Card>
        <Card title="דברים שהסוכן פוסל">{listOr((dna?.avoid_rules as unknown[]) ?? defaultAvoid)}</Card>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DNA_SCORES.map((s) => <ScoreBar key={s.key} label={s.label} value={score(s.key)} />)}
      </div>
    </section>
  );
}
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-card border-line rounded-2xl border p-4 shadow-sm"><p className="text-ink mb-1.5 text-sm font-black">{title}</p>{children}</div>;
}
function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card border-line rounded-xl border p-3 shadow-sm">
      <div className="mb-1 flex items-center justify-between"><span className="text-ink text-[12px] font-bold">{label}</span><span className="text-brand-strong text-[12px] font-black">{value}</span></div>
      <div className="bg-surface h-1.5 w-full overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full" style={{ width: `${value}%` }} /></div>
    </div>
  );
}
function textOr(v: string | null | undefined) { return v ? <p className="text-muted text-[13px]">{v}</p> : <p className="text-muted text-[12px]">טרם הוגדר.</p>; }
function listOr(items: unknown[] | null | undefined) {
  const arr = (items ?? []).map((x) => typeof x === "string" ? x : JSON.stringify(x)).filter(Boolean);
  return arr.length ? <ul className="text-muted flex flex-col gap-0.5 text-[12px]">{arr.slice(0, 8).map((t, i) => <li key={i}>• {t}</li>)}</ul> : <p className="text-muted text-[12px]">טרם הוגדר.</p>;
}

function LearnedBlock({ dna }: { dna: Dna | null }) {
  const arr = (k: string): string[] => { const v = dna?.[k]; return Array.isArray(v) ? (v as unknown[]).map((x) => typeof x === "string" ? x : JSON.stringify(x)).filter(Boolean) : []; };
  const works = [...arr("approved_patterns"), ...arr("preferred_campaign_angles")];
  const avoid = [...arr("rejected_patterns"), ...arr("rejected_campaign_angles"), ...arr("avoid_rules")];
  const insights = arr("target_audiences");
  if (!works.length && !avoid.length) {
    return (
      <section className="bg-surface text-muted rounded-2xl px-4 py-6 text-center text-sm">מה ZONO למד? — הרץ ״נתח DNA שיווקי״ כדי ללמוד מה עובד וממה להימנע מתוך החומרים.</section>
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-ink text-lg font-black">מה ZONO למד?</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="bg-success-soft/40 border-line rounded-2xl border p-4">
          <p className="text-success mb-1.5 text-sm font-black">מה עובד כאן</p>
          {works.length ? <ul className="text-ink flex flex-col gap-0.5 text-[13px]">{works.slice(0, 10).map((t, i) => <li key={i}>✓ {t}</li>)}</ul> : <p className="text-muted text-[12px]">טרם נלמד.</p>}
        </div>
        <div className="bg-danger-soft/40 border-line rounded-2xl border p-4">
          <p className="text-danger mb-1.5 text-sm font-black">ממה להימנע</p>
          {avoid.length ? <ul className="text-ink flex flex-col gap-0.5 text-[13px]">{avoid.slice(0, 10).map((t, i) => <li key={i}>✕ {t}</li>)}</ul> : <p className="text-muted text-[12px]">טרם נלמד.</p>}
        </div>
      </div>
      {insights.length > 0 && <p className="text-muted text-[12px]">תובנות נדל״ן · קהלים: {insights.slice(0, 6).join(" · ")}</p>}
    </section>
  );
}

function DnaEditor({ dna, et, eid, r, wrap }: { dna: Dna | null; et: string; eid: string; r: Runner; wrap: Wrap }) {
  const [summary, setSummary] = useState((dna?.dna_summary as string) ?? "");
  const [visual, setVisual] = useState((dna?.visual_personality as string) ?? "");
  const [tone, setTone] = useState((dna?.copywriting_tone as string) ?? "");
  const [positioning, setPositioning] = useState((dna?.real_estate_positioning as string) ?? "");
  const [agentNotes, setAgentNotes] = useState((dna?.agent_notes as string) ?? "");
  const [officeNotes, setOfficeNotes] = useState((dna?.office_notes as string) ?? "");
  const [sellerNotes, setSellerNotes] = useState((dna?.seller_notes as string) ?? "");
  const [zonoNotes, setZonoNotes] = useState((dna?.zono_notes as string) ?? "");
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-ink text-lg font-black">עריכת פרופיל DNA</h2>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Field label="DNA Summary" value={summary} onChange={setSummary} />
        <Field label="Visual Personality" value={visual} onChange={setVisual} />
        <Field label="Copywriting Tone" value={tone} onChange={setTone} />
        <Field label="Real Estate Positioning" value={positioning} onChange={setPositioning} />
        <Field label="הערות סוכן" value={agentNotes} onChange={setAgentNotes} />
        <Field label="הערות משרד" value={officeNotes} onChange={setOfficeNotes} />
        <Field label="הערות מוכר" value={sellerNotes} onChange={setSellerNotes} />
        <Field label="הערות ZONO" value={zonoNotes} onChange={setZonoNotes} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={r.busyId === "save-dna"} onClick={() => wrap(() => saveDnaAction({ entityType: et, entityId: eid, dna_summary: summary, visual_personality: visual, copywriting_tone: tone, real_estate_positioning: positioning, agent_notes: agentNotes, office_notes: officeNotes, seller_notes: sellerNotes, zono_notes: zonoNotes }), "save-dna", "שומר...")}><Icon name="UserCheck" size={14} />שמור פרופיל</Button>
        <Button size="sm" variant="secondary" loading={r.busyId === "analyze2"} onClick={() => wrap(() => analyzeMarketingDnaAction(et, eid), "analyze2", "ZONO מנתח...")}><Icon name="Sparkles" size={14} />רענן ניתוח AI</Button>
        <Button size="sm" variant="ghost" loading={r.busyId === "lock"} onClick={() => wrap(() => lockDnaAction(et, eid), "lock")}><Icon name="Shield" size={14} />נעל כקו שיווקי מאושר</Button>
      </div>
    </section>
  );
}
function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-muted text-[11px] font-bold">{label}</span>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={2} className="border-line bg-surface text-ink rounded-lg border px-3 py-2 text-sm" />
    </label>
  );
}

function ConceptsSection({ concepts, et, eid, r, wrap }: { concepts: Concept[]; et: string; eid: string; r: Runner; wrap: Wrap }) {
  const [open, setOpen] = useState<Concept | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-ink text-lg font-black">קונספטים שיווקיים</h2>
          <p className="text-muted text-[12px]">ZONO מייצר כיווני שיווק וקריאייטיב המבוססים על ה-DNA השיווקי, סוג הנכס, סוג הקהל והמאפיינים המקומיים.</p>
        </div>
        <Button size="sm" loading={r.busyId === "gen-concepts"} onClick={() => wrap(() => generateConceptsAction(et, eid), "gen-concepts", "ZONO חושב על כיווני שיווק...")}>
          <Icon name="Sparkles" size={14} />{concepts.length ? "רענן קונספטים" : "צור קונספטים"}
        </Button>
      </div>
      {concepts.length === 0 ? (
        <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">אין קונספטים עדיין — לחץ ״צור קונספטים״ כדי ש-ZONO יבנה כיווני שיווק מתוך ה-DNA.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {concepts.map((c) => <ConceptCard key={c.id} c={c} et={et} eid={eid} wrap={wrap} onOpen={() => setOpen(c)} />)}
        </div>
      )}
      {open && <ConceptDrawer c={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function ConceptCard({ c, et, eid, wrap, onOpen }: { c: Concept; et: string; eid: string; wrap: Wrap; onOpen: () => void }) {
  return (
    <div className={`bg-card border-line flex flex-col gap-2 rounded-2xl border p-4 shadow-sm ${c.is_approved ? "ring-1 ring-success" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[10px] font-bold">{CONCEPT_TYPE_LABELS[c.concept_type] ?? c.concept_type}</span>
        <span className="text-success text-sm font-black">{c.confidence_score}</span>
      </div>
      <p className="text-ink text-base font-black leading-tight">{c.title}</p>
      {c.marketing_angle && <p className="text-muted text-[12px]">זווית: {c.marketing_angle}</p>}
      {c.recommended_audience && <p className="text-muted text-[12px]">קהל: {c.recommended_audience}</p>}
      <div className="border-line mt-1 flex flex-wrap gap-1.5 border-t pt-2">
        <button onClick={() => wrap(() => favoriteConceptAction({ conceptId: c.id, value: !c.is_favorite, entityType: et, entityId: eid }), `fav-${c.id}`)} className={`text-[11px] font-bold ${c.is_favorite ? "text-warning" : "text-muted"}`}><Icon name="Flame" size={13} /> מועדף</button>
        <button onClick={() => wrap(() => approveConceptAction({ conceptId: c.id, entityType: et, entityId: eid }), `ap-${c.id}`)} className={`text-[11px] font-bold ${c.is_approved ? "text-success" : "text-muted"}`}><Icon name="UserCheck" size={13} /> אשר</button>
        <button onClick={onOpen} className="text-brand-strong text-[11px] font-bold"><Icon name="Eye" size={13} /> פרטים</button>
        <button onClick={() => wrap(() => deleteConceptAction({ conceptId: c.id, entityType: et, entityId: eid }), `del-${c.id}`)} className="text-danger text-[11px] font-bold"><Icon name="Minus" size={13} /> מחק</button>
      </div>
    </div>
  );
}

function DrawerRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return <div className="flex flex-col gap-0.5"><span className="text-muted text-[11px] font-bold">{label}</span><span className="text-ink text-[13px]">{value}</span></div>;
}
function ConceptDrawer({ c, onClose }: { c: Concept; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div dir="rtl" className="bg-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">{CONCEPT_TYPE_LABELS[c.concept_type] ?? c.concept_type}</span><span className="text-success text-sm font-black">{c.confidence_score}</span></div>
          <button onClick={onClose} className="text-muted"><Icon name="Minus" size={18} /></button>
        </div>
        <h3 className="text-ink text-xl font-black">{c.title}</h3>
        <div className="mt-3 flex flex-col gap-2.5">
          <DrawerRow label="אסטרטגיה" value={c.description} />
          <DrawerRow label="קהל יעד" value={c.recommended_audience} />
          <DrawerRow label="זווית שיווק" value={c.marketing_angle} />
          <DrawerRow label="טריגר רגשי" value={c.emotional_trigger} />
          <DrawerRow label="וו ויזואלי" value={c.visual_hook} />
          <DrawerRow label="וו קופי" value={c.copy_hook} />
          <DrawerRow label="פריסה מומלצת" value={c.recommended_layout} />
          <DrawerRow label="סגנון CTA מומלץ" value={c.recommended_cta_style} />
          <div className="bg-brand-soft/30 rounded-xl p-3"><span className="text-brand-strong text-[11px] font-bold">למה ZONO חושב שזה מתאים</span><p className="text-ink mt-0.5 text-[13px]">{c.reasoning ?? "—"}</p></div>
        </div>
      </div>
    </div>
  );
}

function CampaignsSection({ campaigns, assets, et, eid, r, wrap }: { campaigns: Campaign[]; assets: CampaignAsset[]; et: string; eid: string; r: Runner; wrap: Wrap }) {
  const types = campaignTypesFor(et);
  const [type, setType] = useState(types[0]);
  const [open, setOpen] = useState<Campaign | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-ink text-lg font-black">מפעל קמפיינים</h2>
          <p className="text-muted text-[12px]">ZONO מחליט מה לשווק, למי, באילו מסרים, אילו נכסים שיווקיים לייצר ובאיזה סדר — מבנה קמפיין שלם, לא מודעה בודדת.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select value={type} onChange={(e) => setType(e.target.value)} className="border-line bg-surface text-ink h-9 rounded-lg border px-2 text-sm">
            {types.map((t) => <option key={t} value={t}>{CAMPAIGN_TYPE_LABELS[t] ?? t}</option>)}
          </select>
          <Button size="sm" loading={r.busyId === "gen-campaign"} onClick={() => wrap(() => generateCampaignAction(et, eid, type), "gen-campaign", "ZONO בונה מבנה קמפיין...")}>
            <Icon name="Sparkles" size={14} />צור קמפיין
          </Button>
        </div>
      </div>
      {campaigns.length === 0 ? (
        <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">אין קמפיינים עדיין — בחר סוג קמפיין ולחץ ״צור קמפיין״.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {campaigns.map((c) => <CampaignCard key={c.id} c={c} et={et} eid={eid} wrap={wrap} onOpen={() => setOpen(c)} />)}
        </div>
      )}
      {open && <CampaignDrawer c={open} assets={assets.filter((a) => a.campaign_id === open.id)} onClose={() => setOpen(null)} />}
    </section>
  );
}

function CampaignCard({ c, et, eid, wrap, onOpen }: { c: Campaign; et: string; eid: string; wrap: Wrap; onOpen: () => void }) {
  return (
    <div className={`bg-card border-line flex flex-col gap-2 rounded-2xl border p-4 shadow-sm ${c.status === "approved" ? "ring-1 ring-success" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-ink text-base font-black leading-tight">{c.title}</p>
          <span className="bg-brand-soft text-brand-strong mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold">{CAMPAIGN_TYPE_LABELS[c.campaign_type] ?? c.campaign_type}</span>
        </div>
        <span className="bg-surface text-muted rounded-full px-2 py-0.5 text-[10px] font-bold">{CAMPAIGN_STATUS_HE[c.status] ?? c.status}</span>
      </div>
      <p className="text-muted text-[12px]">{c.assetCount} נכסים שיווקיים · עודכן {new Date(c.updated_at).toLocaleDateString("he-IL")}</p>
      <div className="bg-surface h-1.5 w-full overflow-hidden rounded-full"><div className="bg-success h-full rounded-full" style={{ width: `${c.completion}%` }} /></div>
      <div className="border-line mt-1 flex flex-wrap gap-1.5 border-t pt-2 text-[11px]">
        <button onClick={onOpen} className="text-brand-strong font-bold"><Icon name="Eye" size={13} /> פרטים</button>
        <button onClick={() => wrap(() => approveCampaignAction({ campaignId: c.id, entityType: et, entityId: eid }), `cap-${c.id}`)} className={`font-bold ${c.status === "approved" ? "text-success" : "text-muted"}`}><Icon name="UserCheck" size={13} /> אשר</button>
        <button onClick={() => wrap(() => duplicateCampaignAction({ campaignId: c.id, entityType: et, entityId: eid }), `cdup-${c.id}`)} className="text-muted font-bold"><Icon name="Plus" size={13} /> שכפל</button>
        <button onClick={() => wrap(() => archiveCampaignAction({ campaignId: c.id, entityType: et, entityId: eid }), `carc-${c.id}`)} className="text-muted font-bold">ארכיון</button>
        <button onClick={() => wrap(() => deleteCampaignAction({ campaignId: c.id, entityType: et, entityId: eid }), `cdel-${c.id}`)} className="text-danger font-bold"><Icon name="Minus" size={13} /> מחק</button>
      </div>
    </div>
  );
}

function CampaignDrawer({ c, assets, onClose }: { c: Campaign; assets: CampaignAsset[]; onClose: () => void }) {
  const meta = (c.generation_metadata ?? {}) as { campaign_dna?: { contentMix?: { type: string; share: number }[]; postingFrequency?: string; ctaIntensity?: number } };
  const mix = meta.campaign_dna?.contentMix ?? [];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div dir="rtl" className="bg-card max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">{CAMPAIGN_TYPE_LABELS[c.campaign_type] ?? c.campaign_type}</span>
          <button onClick={onClose} className="text-muted"><Icon name="Minus" size={18} /></button>
        </div>
        <h3 className="text-ink text-xl font-black">{c.title}</h3>
        <div className="mt-3 flex flex-col gap-2.5">
          <DrawerRow label="מטרת הקמפיין" value={c.objective} />
          <DrawerRow label="קהל יעד" value={c.target_audience} />
          <DrawerRow label="זווית שיווק" value={c.marketing_angle} />
          <DrawerRow label="תקציר" value={c.campaign_summary} />
          {mix.length > 0 && <div className="flex flex-col gap-0.5"><span className="text-muted text-[11px] font-bold">תמהיל תוכן</span><span className="text-ink text-[13px]">{mix.map((m) => `${m.type} ${m.share}%`).join(" · ")}</span></div>}
          {meta.campaign_dna?.postingFrequency && <DrawerRow label="תדירות פרסום" value={meta.campaign_dna.postingFrequency} />}
        </div>
        <div className="mt-4">
          <p className="text-ink mb-1.5 text-sm font-black">תוכנית הנכסים השיווקיים ({assets.length})</p>
          <div className="flex flex-col gap-1.5">
            {assets.map((a) => (
              <div key={a.id} className="bg-surface flex items-start justify-between gap-2 rounded-xl p-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-ink text-[13px] font-bold">{a.title}</span>
                    <span className="bg-card text-muted rounded-full px-1.5 py-0.5 text-[9px] font-bold">{ASSET_TYPE_HE[a.asset_type] ?? a.asset_type}</span>
                    {a.audience_variant && <span className="bg-brand-soft text-brand-strong rounded-full px-1.5 py-0.5 text-[9px] font-bold">{a.audience_variant === "seller" ? "מוכר" : a.audience_variant === "buyer" ? "קונה" : a.audience_variant === "investor" ? "משקיע" : a.audience_variant}</span>}
                  </div>
                  {a.purpose && <p className="text-muted text-[11px]">{a.purpose}</p>}
                  {a.recommended_message && <p className="text-ink text-[11px]">״{a.recommended_message}״</p>}
                </div>
                {a.recommended_cta && <span className="text-brand-strong shrink-0 text-[10px] font-bold">{a.recommended_cta}</span>}
              </div>
            ))}
          </div>
        </div>
        {c.reasoning && <div className="bg-brand-soft/30 mt-4 rounded-xl p-3"><span className="text-brand-strong text-[11px] font-bold">למה ZONO בנה את הקמפיין הזה</span><p className="text-ink mt-0.5 text-[13px]">{c.reasoning}</p></div>}
      </div>
    </div>
  );
}

function CreativeAssetsSection({ assets, campaigns, et, eid, r, wrap }: { assets: CreativeAsset[]; campaigns: Campaign[]; et: string; eid: string; r: Runner; wrap: Wrap }) {
  const [campaignId, setCampaignId] = useState(campaigns[0]?.id ?? "");
  const [open, setOpen] = useState<CreativeAsset | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-ink text-lg font-black">נכסי שיווק</h2>
          <p className="text-muted text-[12px]">לכל קמפיין מאושר ZONO בונה את כל נכסי השיווק הנדרשים — פוסטים, סטוריז, קרוסלות, כריכות ריל וגרסאות מוכר/קונה — מתוכננים ומדורגים.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} className="border-line bg-surface text-ink h-9 max-w-[200px] rounded-lg border px-2 text-sm">
            <option value="">בחר קמפיין</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <Button size="sm" loading={r.busyId === "gen-assets"} disabled={!campaignId} onClick={() => wrap(() => generateAssetsAction({ campaignId, entityType: et, entityId: eid }), "gen-assets", "ZONO בונה נכסי שיווק...")}>
            <Icon name="Sparkles" size={14} />צור נכסים
          </Button>
          {campaignId && <Button size="sm" variant="ghost" loading={r.busyId === "approve-all"} onClick={() => wrap(() => approveAllAssetsAction({ campaignId, entityType: et, entityId: eid }), "approve-all")}><Icon name="UserCheck" size={14} />אשר הכל</Button>}
        </div>
      </div>
      {assets.length === 0 ? (
        <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">אין נכסי שיווק עדיין — בחר קמפיין ולחץ ״צור נכסים״.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a) => <CreativeAssetCard key={a.id} a={a} et={et} eid={eid} wrap={wrap} onOpen={() => setOpen(a)} />)}
        </div>
      )}
      {open && <CreativeAssetDrawer a={open} campaigns={campaigns} onClose={() => setOpen(null)} />}
    </section>
  );
}

function CreativeAssetCard({ a, et, eid, wrap, onOpen }: { a: CreativeAsset; et: string; eid: string; wrap: Wrap; onOpen: () => void }) {
  return (
    <div className={`bg-card border-line flex flex-col gap-2 rounded-2xl border p-4 shadow-sm ${a.is_approved ? "ring-1 ring-success" : a.asset_status === "rejected" ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[10px] font-bold">{CREATIVE_ASSET_TYPE_LABELS[a.asset_type] ?? a.asset_type}</span>
        <span className="text-success text-sm font-black">{a.asset_score}</span>
      </div>
      <p className="text-ink text-[15px] font-black leading-tight">{a.title}</p>
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {a.objective && <span className="bg-surface text-muted rounded-full px-1.5 py-0.5 font-bold">{OBJECTIVE_LABELS[a.objective] ?? a.objective}</span>}
        {a.audience && <span className="bg-surface text-muted rounded-full px-1.5 py-0.5 font-bold">{a.audience}</span>}
        <span className="bg-surface text-muted rounded-full px-1.5 py-0.5 font-bold">עדיפות {a.priority}</span>
        <span className="bg-surface text-muted rounded-full px-1.5 py-0.5 font-bold">{ASSET_STATUS_HE[a.asset_status] ?? a.asset_status}</span>
      </div>
      <div className="border-line mt-1 flex flex-wrap gap-1.5 border-t pt-2 text-[11px]">
        <button onClick={onOpen} className="text-brand-strong font-bold"><Icon name="Eye" size={13} /> פרטים</button>
        <button onClick={() => wrap(() => approveAssetAction({ assetId: a.id, entityType: et, entityId: eid }), `aa-${a.id}`)} className={`font-bold ${a.is_approved ? "text-success" : "text-muted"}`}><Icon name="UserCheck" size={13} /> אשר</button>
        <button onClick={() => wrap(() => rejectAssetAction({ assetId: a.id, entityType: et, entityId: eid }), `ar-${a.id}`)} className="text-danger font-bold">דחה</button>
        <button onClick={() => wrap(() => favoriteAssetAction({ assetId: a.id, value: !a.is_favorite, entityType: et, entityId: eid }), `af-${a.id}`)} className={`font-bold ${a.is_favorite ? "text-warning" : "text-muted"}`}><Icon name="Flame" size={13} /> מועדף</button>
        <button onClick={() => wrap(() => duplicateAssetAction({ assetId: a.id, entityType: et, entityId: eid }), `ad-${a.id}`)} className="text-muted font-bold"><Icon name="Plus" size={13} /> שכפל</button>
      </div>
    </div>
  );
}

function CreativeAssetDrawer({ a, campaigns, onClose }: { a: CreativeAsset; campaigns: Campaign[]; onClose: () => void }) {
  const camp = campaigns.find((c) => c.id === a.campaign_id);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div dir="rtl" className="bg-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">{CREATIVE_ASSET_TYPE_LABELS[a.asset_type] ?? a.asset_type}</span><span className="text-success text-sm font-black">{a.asset_score}</span></div>
          <button onClick={onClose} className="text-muted"><Icon name="Minus" size={18} /></button>
        </div>
        <h3 className="text-ink text-xl font-black">{a.title}</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Mini label="התאמת קמפיין" value={a.campaign_match_score} />
          <Mini label="התאמת קהל" value={a.audience_match_score} />
          <Mini label="פוטנציאל המרה" value={a.conversion_potential_score} />
          <Mini label="חוזק שיווקי" value={a.marketing_strength_score} />
        </div>
        <div className="mt-3 flex flex-col gap-2.5">
          <DrawerRow label="מטרה שיווקית" value={a.objective ? (OBJECTIVE_LABELS[a.objective] ?? a.objective) : null} />
          <DrawerRow label="קהל יעד" value={a.audience} />
          <DrawerRow label="כיוון ויזואלי" value={a.visual_hook} />
          <DrawerRow label="כיוון קופי" value={a.copy_hook} />
          <DrawerRow label="כיוון CTA" value={a.cta_style} />
          <DrawerRow label="פריסה מומלצת" value={a.recommended_layout} />
          <DrawerRow label="קשר לקמפיין" value={camp ? camp.title : null} />
        </div>
        {a.reasoning && <div className="bg-brand-soft/30 mt-4 rounded-xl p-3"><span className="text-brand-strong text-[11px] font-bold">למה ZONO ייצר את הנכס הזה</span><p className="text-ink mt-0.5 text-[13px]">{a.reasoning}</p></div>}
      </div>
    </div>
  );
}
function Mini({ label, value }: { label: string; value: number }) {
  return <div className="bg-surface rounded-xl p-2 text-center"><div className="text-brand-strong text-sm font-black">{value}</div><div className="text-muted text-[10px] font-bold">{label}</div></div>;
}

function CopySection({ copy, assets, et, eid, r, wrap }: { copy: Copy[]; assets: CreativeAsset[]; et: string; eid: string; r: Runner; wrap: Wrap }) {
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const [open, setOpen] = useState<Copy | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-ink text-lg font-black">טקסטים שיווקיים</h2>
          <p className="text-muted text-[12px]">לכל נכס שיווק מאושר ZONO כותב את כל הקופי — כותרות, גוף, CTA, סטוריז, קרוסלות, וואטסאפ ותסריטי גיוס — בעברית מותאמת מותג ומקום.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className="border-line bg-surface text-ink h-9 max-w-[220px] rounded-lg border px-2 text-sm">
            <option value="">בחר נכס שיווק</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{(CREATIVE_ASSET_TYPE_LABELS[a.asset_type] ?? a.asset_type)} · {a.title}</option>)}
          </select>
          <Button size="sm" loading={r.busyId === "gen-copy"} disabled={!assetId} onClick={() => wrap(() => generateCopyAction({ creativeAssetId: assetId, entityType: et, entityId: eid }), "gen-copy", "ZONO כותב קופי שיווקי...")}>
            <Icon name="Sparkles" size={14} />צור טקסטים
          </Button>
        </div>
      </div>
      {copy.length === 0 ? (
        <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">אין טקסטים עדיין — בחר נכס שיווק ולחץ ״צור טקסטים״.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {copy.map((c) => <CopyCard key={c.id} c={c} et={et} eid={eid} wrap={wrap} onOpen={() => setOpen(c)} />)}
        </div>
      )}
      {open && <CopyDrawer c={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function CopyCard({ c, et, eid, wrap, onOpen }: { c: Copy; et: string; eid: string; wrap: Wrap; onOpen: () => void }) {
  const preview = c.headline || c.body || c.cta || c.subheadline || "—";
  return (
    <div className={`bg-card border-line flex flex-col gap-2 rounded-2xl border p-4 shadow-sm ${c.is_approved ? "ring-1 ring-success" : c.status === "rejected" ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[10px] font-bold">{COPY_TYPE_LABELS[c.copy_type] ?? c.copy_type}</span>
        <span className="text-success text-sm font-black">{c.confidence_score}</span>
      </div>
      <p className="text-ink text-[14px] font-bold leading-snug" dir="rtl">{preview}</p>
      <div className="flex flex-wrap gap-1.5 text-[10px]">
        {c.tone && <span className="bg-surface text-muted rounded-full px-1.5 py-0.5 font-bold">{c.tone}</span>}
        {c.audience && <span className="bg-surface text-muted rounded-full px-1.5 py-0.5 font-bold">{c.audience}</span>}
        {c.platform && <span className="bg-surface text-muted rounded-full px-1.5 py-0.5 font-bold">{c.platform}</span>}
      </div>
      <div className="border-line mt-1 flex flex-wrap gap-1.5 border-t pt-2 text-[11px]">
        <button onClick={onOpen} className="text-brand-strong font-bold"><Icon name="Eye" size={13} /> פרטים</button>
        <button onClick={() => wrap(() => approveCopyAction({ copyId: c.id, entityType: et, entityId: eid }), `pa-${c.id}`)} className={`font-bold ${c.is_approved ? "text-success" : "text-muted"}`}><Icon name="UserCheck" size={13} /> אשר</button>
        <button onClick={() => wrap(() => rejectCopyAction({ copyId: c.id, entityType: et, entityId: eid }), `pr-${c.id}`)} className="text-danger font-bold">דחה</button>
        <button onClick={() => wrap(() => favoriteCopyAction({ copyId: c.id, value: !c.is_favorite, entityType: et, entityId: eid }), `pf-${c.id}`)} className={`font-bold ${c.is_favorite ? "text-warning" : "text-muted"}`}><Icon name="Flame" size={13} /> מועדף</button>
        <button onClick={() => wrap(() => regenerateCopyAction({ copyId: c.id, entityType: et, entityId: eid }), `pg-${c.id}`)} className="text-muted font-bold"><Icon name="Sparkles" size={13} /> חדש</button>
      </div>
    </div>
  );
}

function CopyDrawer({ c, onClose }: { c: Copy; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div dir="rtl" className="bg-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2"><span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">{COPY_TYPE_LABELS[c.copy_type] ?? c.copy_type}</span><span className="text-success text-sm font-black">{c.confidence_score}</span></div>
          <button onClick={onClose} className="text-muted"><Icon name="Minus" size={18} /></button>
        </div>
        <div className="flex flex-col gap-2.5">
          <DrawerRow label="כותרת" value={c.headline} />
          <DrawerRow label="כותרת משנה" value={c.subheadline} />
          {c.body && <div className="flex flex-col gap-0.5"><span className="text-muted text-[11px] font-bold">גוף הטקסט</span><span className="text-ink whitespace-pre-line text-[13px]">{c.body}</span></div>}
          <DrawerRow label="קריאה לפעולה" value={c.cta} />
          <DrawerRow label="קהל יעד" value={c.audience} />
          <DrawerRow label="טון" value={c.tone} />
          <DrawerRow label="פלטפורמה" value={c.platform} />
        </div>
        {c.reasoning && <div className="bg-brand-soft/30 mt-4 rounded-xl p-3"><span className="text-brand-strong text-[11px] font-bold">למה ZONO כתב כך</span><p className="text-ink mt-0.5 text-[13px]">{c.reasoning}</p></div>}
      </div>
    </div>
  );
}

// ── HTML/CSS render-object preview (editable structure, not an image) ──────────
function CreativePreview({ data, scale = 1 }: { data: RenderData; scale?: number }) {
  const p = data.palette;
  const block = (b: RenderBlock, i: number) => {
    const key = `${b.component}-${i}`;
    switch (b.component) {
      case "eyebrow": return <div key={key} style={{ color: p.accent, fontSize: 11 * scale, fontWeight: 800, letterSpacing: 1 }}>{b.text}</div>;
      case "headline": return <div key={key} style={{ color: p.text, fontSize: 26 * scale, fontWeight: 900, lineHeight: 1.05 }}>{b.text}</div>;
      case "subheadline": return <div key={key} style={{ color: p.muted, fontSize: 14 * scale, fontWeight: 600 }}>{b.text}</div>;
      case "cta_button": case "whatsapp_cta": return <div key={key} style={{ alignSelf: "center", background: p.accent, color: p.onAccent, fontSize: 13 * scale, fontWeight: 800, padding: `${8 * scale}px ${16 * scale}px`, borderRadius: 999, marginTop: "auto" }}>{b.component === "whatsapp_cta" ? "💬 " : ""}{b.text}</div>;
      case "price_badge": return <div key={key} style={{ alignSelf: "flex-start", background: p.text, color: p.bg, fontSize: 14 * scale, fontWeight: 900, padding: `${4 * scale}px ${10 * scale}px`, borderRadius: 8 }}>{b.text}</div>;
      case "location_badge": return <div key={key} style={{ color: p.muted, fontSize: 12 * scale, fontWeight: 700 }}>📍 {b.text}</div>;
      case "property_features": case "project_details": case "investment_block": return <div key={key} style={{ display: "flex", flexWrap: "wrap", gap: 4 * scale }}>{(b.items ?? []).map((it, j) => <span key={j} style={{ background: "rgba(255,255,255,0.12)", color: p.text, fontSize: 11 * scale, fontWeight: 700, padding: `${3 * scale}px ${8 * scale}px`, borderRadius: 6 }}>{it}</span>)}</div>;
      case "agent_card": case "developer_block": case "testimonial_block": return <div key={key} style={{ color: p.text, fontSize: 12 * scale, fontWeight: 700, opacity: 0.9 }}>{b.text}</div>;
      case "logo_slot": return <div key={key} style={{ color: p.text, fontSize: 13 * scale, fontWeight: 900, opacity: 0.85 }}>{b.text}</div>;
      case "image_placeholder": return b.imageUrl
        ? <img key={key} src={b.imageUrl} alt="" style={{ width: "100%", borderRadius: 10 * scale, objectFit: "cover", maxHeight: 180 * scale }} />
        : <div key={key} style={{ background: "rgba(255,255,255,0.08)", border: `1px dashed ${p.muted}`, borderRadius: 10 * scale, color: p.muted, fontSize: 10 * scale, display: "grid", placeItems: "center", minHeight: 60 * scale, flex: "0 0 auto" }}>🖼 {b.text}</div>;
      default: return null;
    }
  };
  return (
    <div dir="rtl" style={{ aspectRatio: `${data.width} / ${data.height}`, background: `linear-gradient(160deg, ${p.bg2}, ${p.bg})`, borderRadius: 12, padding: 16 * scale, display: "flex", flexDirection: "column", gap: 8 * scale, overflow: "hidden", width: "100%" }}>
      {data.blocks.map(block)}
    </div>
  );
}

function OutputsSection({ outputs, assets, et, eid, r, wrap }: { outputs: Output[]; assets: CreativeAsset[]; et: string; eid: string; r: Runner; wrap: Wrap }) {
  const [assetId, setAssetId] = useState(assets[0]?.id ?? "");
  const [open, setOpen] = useState<Output | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-ink text-lg font-black">קריאייטיב מוכן</h2>
          <p className="text-muted text-[12px]">ZONO מפיק וריאציות קריאייטיב ערוכות (HTML/CSS) המבוססות על ה-DNA, הקמפיין, הנכס והקופי. התמונות יתווספו בשלב הוויזואלי הבא.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select value={assetId} onChange={(e) => setAssetId(e.target.value)} className="border-line bg-surface text-ink h-9 max-w-[220px] rounded-lg border px-2 text-sm">
            <option value="">בחר נכס שיווק</option>
            {assets.map((a) => <option key={a.id} value={a.id}>{(CREATIVE_ASSET_TYPE_LABELS[a.asset_type] ?? a.asset_type)} · {a.title}</option>)}
          </select>
          <Button size="sm" loading={r.busyId === "gen-output"} disabled={!assetId} onClick={() => wrap(() => generateOutputsAction({ creativeAssetId: assetId, entityType: et, entityId: eid }), "gen-output", "ZONO מפיק קריאייטיב...")}>
            <Icon name="Sparkles" size={14} />הפק קריאייטיב
          </Button>
        </div>
      </div>
      {outputs.length === 0 ? (
        <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">אין קריאייטיב עדיין — בחר נכס שיווק ולחץ ״הפק קריאייטיב״.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {outputs.map((o) => <OutputCard key={o.id} o={o} et={et} eid={eid} wrap={wrap} onOpen={() => setOpen(o)} />)}
        </div>
      )}
      {open && <OutputDrawer o={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function OutputCard({ o, et, eid, wrap, onOpen }: { o: Output; et: string; eid: string; wrap: Wrap; onOpen: () => void }) {
  return (
    <div className={`bg-card border-line flex flex-col gap-2 rounded-2xl border p-2.5 shadow-sm ${o.is_approved ? "ring-1 ring-success" : o.status === "rejected" ? "opacity-60" : ""}`}>
      <button onClick={onOpen} className="block w-full text-right"><CreativePreview data={o.render_data} scale={0.85} /></button>
      <div className="flex items-center justify-between gap-1 px-0.5">
        <span className="text-muted text-[10px] font-bold">{OUTPUT_TYPE_LABELS[o.output_type] ?? o.output_type}</span>
        <span className="text-success text-sm font-black">{o.overall_score}</span>
      </div>
      <div className="border-line flex flex-wrap gap-1.5 border-t pt-2 text-[10px]">
        <button onClick={() => wrap(() => approveOutputAction({ outputId: o.id, entityType: et, entityId: eid }), `oa-${o.id}`)} className={`font-bold ${o.is_approved ? "text-success" : "text-muted"}`}><Icon name="UserCheck" size={12} /> אשר</button>
        <button onClick={() => wrap(() => rejectOutputAction({ outputId: o.id, entityType: et, entityId: eid }), `or-${o.id}`)} className="text-danger font-bold">דחה</button>
        <button onClick={() => wrap(() => favoriteOutputAction({ outputId: o.id, value: !o.is_favorite, entityType: et, entityId: eid }), `of-${o.id}`)} className={`font-bold ${o.is_favorite ? "text-warning" : "text-muted"}`}><Icon name="Flame" size={12} /></button>
        <button onClick={() => wrap(() => duplicateOutputAction({ outputId: o.id, entityType: et, entityId: eid }), `od-${o.id}`)} className="text-muted font-bold"><Icon name="Plus" size={12} /></button>
        <button onClick={() => wrap(() => regenerateOutputAction({ outputId: o.id, entityType: et, entityId: eid }), `og-${o.id}`)} className="text-muted font-bold"><Icon name="Sparkles" size={12} /></button>
      </div>
    </div>
  );
}

function OutputDrawer({ o, onClose }: { o: Output; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div dir="rtl" className="bg-card max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[11px] font-bold">{OUTPUT_TYPE_LABELS[o.output_type] ?? o.output_type}</span>
          <button onClick={onClose} className="text-muted"><Icon name="Minus" size={18} /></button>
        </div>
        <div className="mx-auto max-w-[260px]"><CreativePreview data={o.render_data} /></div>
        <p className="text-ink mt-3 text-sm font-black">{o.title}</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Mini label="מותג" value={o.brand_match_score} />
          <Mini label="שיווק" value={o.marketing_match_score} />
          <Mini label="קריאוּת" value={o.readability_score} />
          <Mini label="היררכיה" value={o.hierarchy_score} />
          <Mini label="המרה" value={o.conversion_score} />
          <Mini label="כללי" value={o.overall_score} />
        </div>
        <p className="text-muted mt-3 text-[12px]">קריאייטיב ערוך מובנה — נשמר כאובייקט render ולא כתמונה. בשלב הוויזואלי הבא ZONO יזריק תמונות אמיתיות למקומות המסומנים.</p>
      </div>
    </div>
  );
}

function VisualsSection({ visuals, outputs, et, eid, r, wrap }: { visuals: Visual[]; outputs: Output[]; et: string; eid: string; r: Runner; wrap: Wrap }) {
  const [outputId, setOutputId] = useState(outputs[0]?.id ?? "");
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-ink text-lg font-black">ויזואלים</h2>
          <p className="text-muted text-[12px]">ZONO מייצר תמונות שיווק אוטומטית מתוך ה-DNA הוויזואלי, הקמפיין והנכס. ויזואל מאושר מוזרק אוטומטית לקריאייטיב. ללא כתיבת פרומפטים — הכל מאחורי הקלעים.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <select value={outputId} onChange={(e) => setOutputId(e.target.value)} className="border-line bg-surface text-ink h-9 max-w-[220px] rounded-lg border px-2 text-sm">
            <option value="">בחר קריאייטיב</option>
            {outputs.map((o) => <option key={o.id} value={o.id}>{(OUTPUT_TYPE_LABELS[o.output_type] ?? o.output_type)} · {o.title}</option>)}
          </select>
          <Button size="sm" loading={r.busyId === "gen-visual"} disabled={!outputId} onClick={() => wrap(() => generateVisualAction({ creativeOutputId: outputId, entityType: et, entityId: eid }), "gen-visual", "ZONO מייצר ויזואל...")}>
            <Icon name="Sparkles" size={14} />צור ויזואל
          </Button>
        </div>
      </div>
      {visuals.length === 0 ? (
        <div className="bg-surface text-muted rounded-2xl px-4 py-8 text-center text-sm">אין ויזואלים עדיין — בחר קריאייטיב ולחץ ״צור ויזואל״.</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visuals.map((v) => <VisualCard key={v.id} v={v} et={et} eid={eid} wrap={wrap} />)}
        </div>
      )}
    </section>
  );
}

function VisualCard({ v, et, eid, wrap }: { v: Visual; et: string; eid: string; wrap: Wrap }) {
  const [showVar, setShowVar] = useState(false);
  return (
    <div className={`bg-card border-line flex flex-col gap-2 rounded-2xl border p-2.5 shadow-sm ${v.is_approved ? "ring-1 ring-success" : v.is_rejected ? "opacity-60" : ""}`}>
      {v.image_url
        ? <img src={v.image_url} alt={v.visual_type} className="aspect-square w-full rounded-xl object-cover" />
        : <div className="bg-surface text-muted grid aspect-square w-full place-items-center rounded-xl text-[11px]">אין תצוגה</div>}
      <div className="flex items-center justify-between gap-1 px-0.5">
        <span className="text-muted text-[10px] font-bold">{VISUAL_TYPE_LABELS[v.visual_type] ?? v.visual_type}</span>
        <span className="text-success text-sm font-black">{v.overall_score}</span>
      </div>
      <span className="text-muted text-[9px] font-bold">{v.provider === "mock" ? "הדגמה" : v.provider}</span>
      <div className="border-line flex flex-wrap gap-1.5 border-t pt-2 text-[10px]">
        <button onClick={() => wrap(() => approveVisualAction({ visualId: v.id, entityType: et, entityId: eid }), `va-${v.id}`)} className={`font-bold ${v.is_approved ? "text-success" : "text-muted"}`}><Icon name="UserCheck" size={12} /> אשר</button>
        <button onClick={() => wrap(() => rejectVisualAction({ visualId: v.id, entityType: et, entityId: eid }), `vr-${v.id}`)} className="text-danger font-bold">דחה</button>
        <button onClick={() => wrap(() => favoriteVisualAction({ visualId: v.id, value: !v.is_favorite, entityType: et, entityId: eid }), `vf-${v.id}`)} className={`font-bold ${v.is_favorite ? "text-warning" : "text-muted"}`}><Icon name="Flame" size={12} /></button>
        <button onClick={() => setShowVar(!showVar)} className="text-brand-strong font-bold">וריאציות</button>
      </div>
      {showVar && (
        <div className="border-line flex flex-wrap gap-1 border-t pt-2">
          {VARIATION_MODES.slice(0, 6).map((m) => (
            <button key={m.key} onClick={() => wrap(() => variationVisualAction({ visualId: v.id, mode: m.key, entityType: et, entityId: eid }), `vv-${v.id}-${m.key}`)} className="bg-surface text-ink rounded-full px-2 py-0.5 text-[10px] font-bold">{m.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

const QUICK_CARDS: { type: string; title: string; desc: string; cta: string }[] = [
  { type: "testimonial_post", title: "פוסט המלצה", desc: "הפכו המלצה של מוכר או קונה לפוסט ממותג שמחזק אמון.", cta: "צור פוסט המלצה" },
  { type: "sold_post", title: "פוסט נמכר", desc: "צרו פוסט נמכר ממותג שמביא עוד מוכרים.", cta: "צור פוסט נמכר" },
  { type: "property_ad_post", title: "פוסט פרסום דירה", desc: "צרו מודעת נכס ממותגת עם תמונה, פרטים וקריאה לפעולה.", cta: "צור פוסט פרסום דירה" },
];

function QuickCreativeSection({ outputs, et, eid, wrap, canViewPrompt }: { outputs: QuickOutput[]; et: string; eid: string; wrap: Wrap; canViewPrompt?: boolean }) {
  const [wizardType, setWizardType] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <div><h2 className="text-ink text-lg font-black">יצירה מהירה</h2><p className="text-muted text-[12px]">לחצו, מלאו טופס קצר וקבלו 4 וריאציות עיצוב ממותגות ומוכנות לפרסום.</p></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {QUICK_CARDS.map((c) => (
          <div key={c.type} className="bg-card border-line flex flex-col gap-2 rounded-2xl border p-4 shadow-sm">
            <p className="text-ink font-black">{c.title}</p>
            <p className="text-muted flex-1 text-[12px]">{c.desc}</p>
            <Button size="sm" onClick={() => setWizardType(c.type)}><Icon name="Sparkles" size={14} />{c.cta}</Button>
          </div>
        ))}
      </div>
      {outputs.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-ink text-sm font-black">תוצאות יצירה מהירה</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {outputs.map((o) => <QuickResultCard key={o.id} o={o} et={et} eid={eid} wrap={wrap} canViewPrompt={canViewPrompt} />)}
          </div>
        </div>
      )}
      {wizardType && <QuickCreativeWizard type={wizardType} et={et} eid={eid} onClose={() => setWizardType(null)} />}
    </section>
  );
}

function QuickResultCard({ o, et, eid, wrap, canViewPrompt }: { o: QuickOutput; et: string; eid: string; wrap: Wrap; canViewPrompt?: boolean }) {
  const [showPrompt, setShowPrompt] = useState(false);
  return (
    <div className={`bg-card border-line flex flex-col gap-2 rounded-2xl border p-2.5 shadow-sm ${o.is_approved ? "ring-1 ring-success" : o.status === "rejected" ? "opacity-60" : ""}`}>
      <CreativePreview data={o.render_data} scale={0.8} />
      <div className="flex items-center justify-between gap-1 px-0.5">
        <span className="text-muted text-[10px] font-bold">{o.variant_name}</span>
        <span className="text-success text-sm font-black">{o.overall_score}</span>
      </div>
      <div className="text-muted flex flex-wrap gap-1 px-0.5 text-[9px] font-bold">
        <span>מוכרים {o.seller_lead_score}</span><span>·</span><span>קונים {o.buyer_lead_score}</span>
      </div>
      <div className="border-line flex flex-wrap gap-1.5 border-t pt-2 text-[10px]">
        <button onClick={() => wrap(() => approveQuickAction({ outputId: o.id, entityType: et, entityId: eid }), `qa-${o.id}`)} className={`font-bold ${o.is_approved ? "text-success" : "text-muted"}`}><Icon name="UserCheck" size={12} /> אשר</button>
        <button onClick={() => wrap(() => rejectQuickAction({ outputId: o.id, entityType: et, entityId: eid }), `qj-${o.id}`)} className="text-danger font-bold">דחה</button>
        <button onClick={() => wrap(() => favoriteQuickAction({ outputId: o.id, value: !o.is_favorite, entityType: et, entityId: eid }), `qf-${o.id}`)} className={`font-bold ${o.is_favorite ? "text-warning" : "text-muted"}`}><Icon name="Flame" size={12} /></button>
        <button onClick={() => wrap(() => regenerateQuickAction({ requestId: o.request_id, entityType: et, entityId: eid }), `qg-${o.id}`)} className="text-muted font-bold"><Icon name="Sparkles" size={12} /></button>
        <button onClick={() => wrap(() => duplicateQuickAction({ outputId: o.id, entityType: et, entityId: eid }), `qd-${o.id}`)} className="text-muted font-bold"><Icon name="Plus" size={12} /></button>
        <span className="text-muted/50 cursor-not-allowed" title="בקרוב">PNG</span>
      </div>
      {o.scroll_stop_reason && <p className="text-muted px-0.5 text-[10px]">⚡ {o.scroll_stop_reason}</p>}
      {canViewPrompt && (
        <div className="border-line border-t pt-1.5">
          <button onClick={() => setShowPrompt(!showPrompt)} className="text-brand-strong text-[10px] font-bold">{showPrompt ? "הסתר" : "הצג"} פרומפט פנימי</button>
          {showPrompt && (
            <div className="bg-surface mt-1 rounded-lg p-2 text-[10px]" dir="ltr">
              <p className="text-muted">[{o.creative_strategy}] · anti-AI {o.anti_ai_score} · scroll {o.scroll_stop_score} · RTL {o.rtl_readability_score}</p>
              <p className="text-ink mt-1 whitespace-pre-wrap break-words">{o.internal_prompt}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function QuickCreativeWizard({ type, et, eid, onClose }: { type: string; et: string; eid: string; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [format, setFormat] = useState("feed_4_5");
  const [improve, setImprove] = useState(false);
  const [f, setF] = useState<Record<string, string | boolean | number>>({});
  const [brand, setBrand] = useState<{ warnings?: string[]; agentName?: string | null; officeName?: string | null; colors?: string[]; agentPhoto?: string | null; officeLogo?: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string | boolean | number) => setF((p) => ({ ...p, [k]: v }));
  const str = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : "");

  const loadBrand = async () => { const b = await brandPreviewAction({ entityType: et, entityId: eid }); setBrand(b); };
  const goStep3 = () => { setStep(3); loadBrand(); };

  const requiredOk = type === "testimonial_post" ? (str("testimonialText") && str("recommenderName") && str("address"))
    : type === "sold_post" ? !!str("address")
    : (str("address") && str("importantText"));

  const submit = async () => {
    setBusy(true); setErr(null);
    const input: Record<string, unknown> = {
      propertyImage: str("propertyImage") || null, neighborhood: str("neighborhood") || null, city: str("city") || null, address: str("address") || null, customCta: str("customCta") || null,
      testimonialText: str("testimonialText") || null, recommenderName: str("recommenderName") || null, stars: f.stars ? Number(f.stars) : null, dealDate: str("dealDate") || null,
      propertyType: str("propertyType") || null, salePrice: str("salePrice") || null, exclusive: !!f.exclusive, saleTime: str("saleTime") || null, sellerName: str("sellerName") || null,
      importantText: str("importantText") || null, price: str("price") || null, rooms: str("rooms") || null, sizeSqm: str("sizeSqm") || null, floor: str("floor") || null, parking: str("parking") || null, storage: !!f.storage, balcony: !!f.balcony, elevator: !!f.elevator, evacuationDate: str("evacuationDate") || null,
      improveText: improve,
    };
    const res = await generateQuickCreativeAction({ requestType: type as never, input: input as never, format, entityType: et, entityId: eid });
    if (res.error) { setErr(res.error); setBusy(false); return; }
    onClose(); router.refresh();
  };

  const Field = (k: string, label: string, ph?: string) => (
    <label key={k} className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">{label}</span>
      <input defaultValue={str(k)} onChange={(e) => set(k, e.target.value)} placeholder={ph} className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm" /></label>
  );
  const Area = (k: string, label: string, ph?: string) => (
    <label key={k} className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">{label}</span>
      <textarea defaultValue={str(k)} onChange={(e) => set(k, e.target.value)} placeholder={ph} rows={3} className="border-line bg-surface text-ink rounded-lg border px-3 py-2 text-sm" /></label>
  );
  const Check = (k: string, label: string) => (
    <label key={k} className="text-ink flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} />{label}</label>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div dir="rtl" className="bg-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-ink text-lg font-black">{QUICK_TYPE_LABELS[type] ?? type} · שלב {step}/4</h3>
          <button onClick={onClose} className="text-muted"><Icon name="Minus" size={18} /></button>
        </div>

        {step === 1 && (
          <div className="flex flex-col gap-3">
            <p className="text-muted text-sm">בחרו פורמט והמשיכו למילוי הפרטים.</p>
            <div className="flex gap-2">
              {[["feed_4_5", "פוסט פיד 4:5"], ["story_9_16", "סטורי 9:16"]].map(([v, l]) => (
                <button key={v} onClick={() => setFormat(v)} className={`rounded-full px-3 py-1.5 text-sm font-bold ${format === v ? "bg-brand text-white" : "bg-surface text-muted"}`}>{l}</button>
              ))}
            </div>
            <Button size="sm" className="w-fit" onClick={() => setStep(2)}>המשך</Button>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-3">
            {type === "testimonial_post" && (<>
              {Area("testimonialText", "טקסט המלצה *", "ההמלצה כלשונה — ZONO לא ימציא תוכן")}
              {Field("recommenderName", "שם הממליץ / מוכר *")}
              {Field("address", "כתובת עסקה *")}
              <div className="grid grid-cols-2 gap-2">{Field("neighborhood", "שכונה")}{Field("city", "עיר")}</div>
              <div className="grid grid-cols-2 gap-2">{Field("stars", "דירוג כוכבים (1-5)")}{Field("dealDate", "תאריך עסקה")}</div>
              <label className="text-ink flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={improve} onChange={(e) => setImprove(e.target.checked)} />שיפור ניסוח (תיקון דקדוק קל בלבד)</label>
            </>)}
            {type === "sold_post" && (<>
              {Field("address", "כתובת עסקה *")}
              <div className="grid grid-cols-2 gap-2">{Field("propertyType", "סוג נכס")}{Field("salePrice", "מחיר מכירה")}</div>
              <div className="grid grid-cols-2 gap-2">{Field("neighborhood", "שכונה")}{Field("city", "עיר")}</div>
              <div className="grid grid-cols-2 gap-2">{Field("saleTime", "זמן מכירה")}{Field("sellerName", "שם מוכר")}</div>
              {Check("exclusive", "נמכר בבלעדיות")}
            </>)}
            {type === "property_ad_post" && (<>
              {Field("address", "כתובת הדירה *")}
              {Area("importantText", "טקסט חשוב של הדירה *", "הטקסט כלשונו — ZONO לא ימציא פרטים")}
              <div className="grid grid-cols-2 gap-2">{Field("price", "מחיר")}{Field("rooms", "חדרים")}</div>
              <div className="grid grid-cols-2 gap-2">{Field("sizeSqm", "שטח (מ״ר)")}{Field("floor", "קומה")}</div>
              <div className="grid grid-cols-2 gap-2">{Field("parking", "חניות")}{Field("neighborhood", "שכונה")}</div>
              <div className="flex flex-wrap gap-3">{Check("storage", "מחסן")}{Check("balcony", "מרפסת")}{Check("elevator", "מעלית")}</div>
            </>)}
            {Field("propertyImage", "תמונת דירה (קישור URL, אופציונלי)")}
            {Field("customCta", "CTA מותאם (אופציונלי)")}
            {!requiredOk && <p className="text-warning text-[12px]">יש למלא את שדות החובה המסומנים ב-*</p>}
            <div className="flex gap-2"><Button size="sm" disabled={!requiredOk} onClick={goStep3}>המשך</Button><Button size="sm" variant="ghost" onClick={() => setStep(1)}>חזרה</Button></div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-3">
            <p className="text-ink text-sm font-black">תצוגת מותג</p>
            {!brand ? <p className="text-muted text-sm">טוען נתוני מותג...</p> : (
              <div className="bg-surface flex flex-col gap-2 rounded-xl p-3 text-[13px]">
                <span className="text-ink">סוכן: {brand.agentName ?? "—"}{brand.agentPhoto ? " · תמונה ✓" : ""}</span>
                <span className="text-ink">משרד: {brand.officeName ?? "—"}{brand.officeLogo ? " · לוגו ✓" : ""}</span>
                <div className="flex items-center gap-2"><span className="text-muted">צבעים:</span>{(brand.colors ?? []).length ? (brand.colors ?? []).map((c, i) => <span key={i} className="border-line h-5 w-5 rounded-full border" style={{ background: c }} />) : <span className="text-muted">—</span>}</div>
                {(brand.warnings ?? []).length > 0 && <div className="text-warning text-[12px]">{(brand.warnings ?? []).join(" · ")} (ניתן להמשיך בכל מקרה)</div>}
              </div>
            )}
            <div className="flex gap-2"><Button size="sm" onClick={() => setStep(4)}>המשך ליצירה</Button><Button size="sm" variant="ghost" onClick={() => setStep(2)}>חזרה</Button></div>
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-3">
            <p className="text-ink text-sm">ZONO ייצר 4 וריאציות ממותגות: Premium Clean · Modern Sales · Trust/Authority · Bold Social.</p>
            {err && <p className="text-danger text-[12px]">{err}</p>}
            <div className="flex gap-2"><Button size="sm" loading={busy} onClick={submit}><Icon name="Sparkles" size={14} />צור 4 וריאציות</Button><Button size="sm" variant="ghost" onClick={() => setStep(3)}>חזרה</Button></div>
            <p className="text-muted text-[11px]">לאחר היצירה הוריאציות יופיעו ב״תוצאות יצירה מהירה״ לאישור ועריכה.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function UploadModal({ onClose, onDone, orgId, userId, et, eid }: { onClose: () => void; onDone: () => void; orgId: string; userId: string; et: string; eid: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [assetType, setAssetType] = useState("property_photo");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (k: string) => setFlags((f) => ({ ...f, [k]: !f[k] }));
  const submit = async () => {
    if (!file) { setErr("בחר קובץ"); return; }
    setBusy(true); setErr(null);
    try {
      await uploadMarketingAsset(file, {
        orgId, entityType: et, entityId: eid, uploadedBy: userId, assetType, title: title || null, description: description || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean), flags,
      });
      onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : "ההעלאה נכשלה"); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div dir="rtl" className="bg-card max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h3 className="text-ink text-lg font-black">העלאת חומרים</h3><button onClick={onClose} className="text-muted"><Icon name="Minus" size={18} /></button></div>
        <div className="flex flex-col gap-3">
          <input type="file" accept=".png,.jpg,.jpeg,.webp,.pdf,.svg,.mp4" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">סוג חומר</span>
            <select value={assetType} onChange={(e) => setAssetType(e.target.value)} className="border-line bg-surface text-ink h-9 rounded-lg border px-2 text-sm">
              {Object.entries(ASSET_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="כותרת" className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="תיאור / הערות" rows={2} className="border-line bg-surface text-ink rounded-lg border px-3 py-2 text-sm" />
          <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="תגיות (מופרדות בפסיק)" className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm" />
          <div className="grid grid-cols-2 gap-1.5 text-[12px]">
            {[["is_approved_reference", "רפרנס מאושר"], ["is_rejected_reference", "רפרנס שנפסל"], ["is_competitor_reference", "רפרנס מתחרה"], ["is_property_photo", "תמונת נכס"], ["is_floor_plan", "תוכנית דירה"], ["is_project_render", "הדמיית פרויקט"], ["is_agent_brand_asset", "חומר מותג סוכן"]].map(([k, label]) => (
              <label key={k} className="text-ink flex items-center gap-1.5"><input type="checkbox" checked={!!flags[k]} onChange={() => toggle(k)} />{label}</label>
            ))}
          </div>
          {err && <p className="text-danger text-[12px]">{err}</p>}
          <div className="flex gap-2">
            <Button size="sm" loading={busy} disabled={!file} onClick={submit}><Icon name="Plus" size={14} />העלה</Button>
            <Button size="sm" variant="ghost" onClick={onClose}>ביטול</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
