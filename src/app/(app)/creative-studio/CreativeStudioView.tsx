"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { CreativeGenerationModal } from "@/components/creative/CreativeGenerationModal";
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
import type { FinalAdData, FinalAdScores } from "@/lib/creative-studio/final-creative-engine";
import type { BrandDNA, BrandGuidance } from "@/lib/creative-studio/brand-dna-engine";
import type { DesignExecutionPlan, DesignFamily } from "@/lib/creative-studio/design-system-engine";
import { BUILD_SIGNATURE } from "@/lib/creative-studio/build-signature";

// Read-only AI image-provider status (computed server-side), used only to tell the
// user whether creatives are AI-produced or deterministic-fallback. No secrets here.
export type AiProviderStatus = { provider: string; reason?: string };
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
  generateQuickCreativeAction, brandPreviewAction, favoriteQuickAction, approveQuickAction, rejectQuickAction, duplicateQuickAction, regenerateQuickAction, listCreativeCandidatesAction, listQuickOutputsAction,
} from "@/lib/creative-studio/quick-creative-actions";
import type { FinalAdPreview } from "@/components/creative/FinalAdsSkeleton";
import { QUICK_TYPE_LABELS } from "@/lib/creative-studio/quick-creative-engine";
import type { CreativeStudio } from "@/lib/creative-studio/service";

type QuickOutput = Record<string, unknown> & {
  id: string; request_id: string; output_type: string; variant_name: string; format: string; title: string | null; render_data: RenderData;
  headline: string | null; cta_text: string | null; overall_score: number; brand_match_score: number; readability_score: number; seller_lead_score: number; buyer_lead_score: number; is_approved: boolean; is_favorite: boolean; status: string;
  internal_prompt: string | null; creative_strategy: string | null; visual_hook: string | null; scroll_stop_reason: string | null; scroll_stop_score: number; creative_director_score: number; anti_ai_score: number; rtl_readability_score: number;
  image_url: string | null; image_status: string | null; image_error: string | null;
  overall_quality_score: number; wow_score: number; quality_status: string | null;
  property_primary_angle: string | null; critic_summary: string | null;
  creative_selection_metadata: { candidatesTotal?: number; rounds?: number } | null;
};

type Visual = Record<string, unknown> & {
  id: string; visual_type: string; provider: string; image_url: string | null; generation_reason: string | null; overall_score: number;
  brand_match_score: number; realism_score: number; property_relevance_score: number; marketing_relevance_score: number; conversion_score: number; status: string; is_approved: boolean; is_rejected: boolean; is_favorite: boolean;
};

type RenderBlock = { component: string; text?: string; items?: string[]; align?: string; emphasis?: string; imageUrl?: string };
type WowView = { luxury: number; trust: number; readability: number; attention: number; premiumFeel: number; visualImpact: number; overall: number; approved: boolean; threshold: number; weakest?: { axis: string; score: number }; critique?: { director: string; artDirector: string; marketing: string; conversion: string } };
type FinalAdView = FinalAdData & { template?: string; scores?: FinalAdScores; brandDNA?: BrandDNA; brandGuidance?: BrandGuidance; designPlan?: DesignExecutionPlan; wow?: WowView; wowCandidates?: { template: string; familyLabel: string; overall: number; approved: boolean }[]; isTopConcept?: boolean };
type RenderData = { format: string; width: number; height: number; layoutLabel?: string; palette: { bg: string; bg2: string; text: string; muted: string; accent: string; onAccent: string }; blocks: RenderBlock[]; ad?: FinalAdView; fullAd?: boolean; qa?: { overall?: number; score?: number; creativeWow?: number | null } | null };
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

export function CreativeStudioView({ studio, concepts: conceptsRaw, campaigns: campaignsRaw, campaignAssets: campaignAssetsRaw, creativeAssets: creativeAssetsRaw, copyAssets: copyAssetsRaw, creativeOutputs: creativeOutputsRaw, visuals: visualsRaw, quickOutputs: quickOutputsRaw, isManager = false, orgId, userId, quickPrefill, aiProvider }: { studio: CreativeStudio; concepts?: Record<string, unknown>[]; campaigns?: Record<string, unknown>[]; campaignAssets?: Record<string, unknown>[]; creativeAssets?: Record<string, unknown>[]; copyAssets?: Record<string, unknown>[]; creativeOutputs?: Record<string, unknown>[]; visuals?: Record<string, unknown>[]; quickOutputs?: Record<string, unknown>[]; isManager?: boolean; orgId: string; userId: string; quickPrefill?: Record<string, string | boolean | number>; aiProvider?: AiProviderStatus }) {
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

  // Defensive: never assume the server DTO carries every field — a missing
  // assets/stats array must not crash the whole studio for the property.
  const assets = (studio.assets ?? []) as Asset[];
  const dna = (studio.dna ?? null) as Dna | null;
  const stats = (studio.stats ?? {}) as Partial<CreativeStudio["stats"]>;
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
          <p className="text-muted text-sm">ZONO קריאייטיב — כל החומרים, הסגנון וה-DNA השיווקי במקום אחד.</p>
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
        <Kpi label="חומרים" value={stats.totalAssets ?? 0} tone="text-ink" />
        <Kpi label="רפרנסים מאושרים" value={stats.approvedReferences ?? 0} tone="text-success" />
        <Kpi label="רפרנסים שנפסלו" value={stats.rejectedReferences ?? 0} tone="text-danger" />
        <Kpi label="מתחרים" value={stats.competitorReferences ?? 0} tone="text-warning" />
        <Kpi label="סטטוס DNA" value={(stats.dnaStatus && DNA_STATUS[stats.dnaStatus]) ?? "—"} tone="text-brand-strong" />
        <Kpi label="ביטחון AI" value={dna ? `${(dna.ai_confidence_score as number) ?? 0}%` : "—"} tone="text-ink" />
      </div>
      {stats.lastAnalyzedAt && <p className="text-muted text-[12px]">ניתוח אחרון: {new Date(stats.lastAnalyzedAt).toLocaleString("he-IL")}</p>}

      <ActionFeedback runner={r} />

      {/* QUICK CREATIVE TEMPLATES — יצירה מהירה */}
      <QuickCreativeSection outputs={quickOutputs} et={et} eid={eid} wrap={wrap} canViewPrompt={isManager} orgId={orgId} userId={userId} prefill={quickPrefill} aiProvider={aiProvider} />

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

// ── ZONO Premium Ad Renderer (HYBRID) ─────────────────────────────────────────
// Real assets stay real (real property photo as cinematic hero, real brand text,
// locked Hebrew with the system font — no AI text), but the DESIGN around them is
// premium and dynamic: full-bleed photo, gradient depth, glass layers, strong
// hierarchy, luxury spacing. One real photo, multiple distinct concept layouts.
type AdConcept = "premium_clean" | "luxury_editorial" | "modern_sales" | "bold_broker" | "minimal";

function extractAd(data: RenderData) {
  // render_data for full-AI ads / failed / legacy rows has no `blocks` array —
  // never let a missing blocks list crash the whole studio (reading 'find').
  const blocks = data.blocks ?? [];
  const find = (...names: string[]) => blocks.find((b) => names.includes(b.component));
  const chipsBlock = find("property_features", "project_details", "investment_block");
  return {
    headline: find("headline")?.text ?? "",
    subheadline: find("subheadline")?.text ?? "",
    price: find("price_badge")?.text ?? "",
    location: find("location_badge")?.text ?? "",
    cta: find("cta_button", "whatsapp_cta")?.text ?? "",
    isWhatsapp: Boolean(find("whatsapp_cta")),
    agent: find("agent_card", "developer_block", "testimonial_block")?.text ?? "",
    logo: find("logo_slot")?.text ?? "",
    chips: (chipsBlock?.items ?? []).slice(0, 5),
    image: find("image_placeholder")?.imageUrl ?? null,
  };
}

const CONCEPT_BY_STRATEGY: Record<string, AdConcept> = {
  "Premium Clean": "premium_clean", "Trust / Authority": "luxury_editorial",
  "Modern Sales": "modern_sales", "Bold Social": "bold_broker",
};
function conceptFor(data: RenderData, strategy?: string | null): AdConcept {
  if (strategy && CONCEPT_BY_STRATEGY[strategy]) return CONCEPT_BY_STRATEGY[strategy];
  if (data.layoutLabel && CONCEPT_BY_STRATEGY[data.layoutLabel]) return CONCEPT_BY_STRATEGY[data.layoutLabel];
  return "premium_clean";
}

const GOLD = "#C9A14A";

// ── ZONO Final Ad Renderer ────────────────────────────────────────────────────
// Renders a COMPLETE, ready-to-post square real-estate ad from the deterministic
// final-ad spec: real agency logo, real property photo (hero), strong headline,
// location, feature icon row, big price block, agent photo + name + phone, CTA.
// All Hebrew is system-font + RTL (no AI text). Follows the Creative DNA.
const AD_FEATURE_ICON: Record<string, string> = { Sofa: "Sofa", Maximize: "Maximize", Sun: "Sun", Building2: "Building2", Car: "Car", ArrowUpDown: "ArrowUpDown", Package: "Package", MapPin: "MapPin" };

// ── DEP-DRIVEN CANVAS — production only ───────────────────────────────────────
// Executes the Design Execution Plan VERBATIM: every element is placed by the
// DEP's zone rect (% of canvas), sized by the DEP type scale, shown/hidden by the
// DEP flags. It invents NO layout, copy, hierarchy, concept, image, Hebrew or
// logo — all strings/assets are the locked real values from `ad`. 1:1 square.
// ── Per-template VISUAL LANGUAGE ─────────────────────────────────────────────
// The DEP controls geometry; this controls the actual treatment of each element
// so the 10 master templates look like DIFFERENT advertisements, not one card
// with moved boxes. image frame · scrim · headline case · CTA style · price style
// · feature style · badge style · editorial dividers / corner marks.
type TplStyle = {
  image: "full" | "rounded" | "framed" | "band";
  scrim: string;
  headlineUpper: boolean; headlineTracking: number; headlineColor: "white" | "accent"; headlineWeightDelta: number;
  divider: boolean; cornerMarks: boolean;
  badge: "pill" | "bar" | "hairline" | "none";
  price: "block" | "tag" | "bare" | "underline";
  cta: "pill" | "bar" | "outline" | "link";
  features: "chips" | "grid" | "inline" | "none";
};
const SCRIM_SOFT = "linear-gradient(180deg, rgba(0,0,0,0.28), transparent 26%, transparent 60%, rgba(0,0,0,0.6))";
const SCRIM_CINE = "linear-gradient(180deg, rgba(0,0,0,0.45), transparent 30%, transparent 48%, rgba(0,0,0,0.82))";
const SCRIM_EDIT = "linear-gradient(180deg, rgba(0,0,0,0.15), transparent 22%, transparent 50%, rgba(0,0,0,0.74))";
const SCRIM_BAND = "linear-gradient(180deg, rgba(0,0,0,0.35), transparent 45%, rgba(0,0,0,0.5))";
const TPL_STYLE: Record<DesignFamily, TplStyle> = {
  // Almost no overlays — the photo IS the ad.
  premium_clean:        { image: "rounded", scrim: SCRIM_SOFT, headlineUpper: false, headlineTracking: 0, headlineColor: "white", headlineWeightDelta: 0, divider: false, cornerMarks: false, badge: "none",     price: "bare",      cta: "link",    features: "inline" },
  // Cinematic prestige.
  luxury_dark:          { image: "full",    scrim: SCRIM_CINE, headlineUpper: true,  headlineTracking: 2, headlineColor: "white", headlineWeightDelta: -100, divider: true, cornerMarks: false, badge: "hairline", price: "bare",      cta: "outline", features: "none" },
  penthouse_collection: { image: "full",    scrim: SCRIM_CINE, headlineUpper: true,  headlineTracking: 3, headlineColor: "white", headlineWeightDelta: -100, divider: true, cornerMarks: false, badge: "hairline", price: "bare",      cta: "outline", features: "none" },
  // Magazine editorial.
  luxury_editorial:     { image: "full",    scrim: SCRIM_EDIT, headlineUpper: true,  headlineTracking: 1, headlineColor: "white", headlineWeightDelta: -50, divider: true, cornerMarks: false, badge: "none",     price: "underline", cta: "link",    features: "inline" },
  // Architecture-led, thin type, corner ticks.
  architectural_showcase:{ image: "framed", scrim: SCRIM_EDIT, headlineUpper: true,  headlineTracking: 4, headlineColor: "white", headlineWeightDelta: -150, divider: false, cornerMarks: true, badge: "none",     price: "bare",      cta: "link",    features: "none" },
  // Warm boutique.
  boutique_residence:   { image: "rounded", scrim: SCRIM_SOFT, headlineUpper: false, headlineTracking: 0, headlineColor: "white", headlineWeightDelta: 0, divider: true, cornerMarks: false, badge: "hairline", price: "tag",       cta: "outline", features: "inline" },
  // Data-led investment.
  editorial_real_estate:{ image: "band",    scrim: SCRIM_BAND, headlineUpper: false, headlineTracking: 0, headlineColor: "white", headlineWeightDelta: 0, divider: false, cornerMarks: false, badge: "bar",      price: "tag",       cta: "bar",     features: "grid" },
  // Price-driven conversion.
  high_conversion_sales:{ image: "band",    scrim: SCRIM_BAND, headlineUpper: false, headlineTracking: 0, headlineColor: "white", headlineWeightDelta: 0, divider: false, cornerMarks: false, badge: "pill",     price: "block",     cta: "bar",     features: "chips" },
  // Corporate project launch.
  developer_launch:     { image: "band",    scrim: SCRIM_BAND, headlineUpper: true,  headlineTracking: 1, headlineColor: "white", headlineWeightDelta: 0, divider: false, cornerMarks: false, badge: "bar",      price: "tag",       cta: "bar",     features: "grid" },
  // City luxury.
  urban_prestige:       { image: "full",    scrim: SCRIM_CINE, headlineUpper: true,  headlineTracking: 1, headlineColor: "white", headlineWeightDelta: 0, divider: false, cornerMarks: false, badge: "pill",     price: "block",     cta: "pill",    features: "inline" },
};

function DepCanvas({ ad, dep, scale = 1, refId }: { ad: FinalAdView; dep: DesignExecutionPlan; scale?: number; refId?: string }) {
  const pal = ad.palette; const T = dep.typography; const f = dep.flags;
  const st = TPL_STYLE[dep.family] ?? TPL_STYLE.premium_clean;
  const bp = 14 * scale; const fs = (m: number) => `${bp * m}px`;
  const pct = (n: number) => `${n}%`;
  const shadow = { textShadow: "0 2px 14px rgba(0,0,0,0.6)" } as React.CSSProperties;
  const zoneBox = (zn: DesignExecutionPlan["zones"]["headline"], extra?: React.CSSProperties): React.CSSProperties => ({
    position: "absolute", top: pct(zn.top), left: pct(zn.left), width: pct(zn.width), height: pct(zn.height),
    display: "flex", flexDirection: "column", justifyContent: "center",
    alignItems: zn.align === "center" ? "center" : zn.align === "end" ? "flex-end" : "flex-start",
    textAlign: zn.align, overflow: "hidden", minWidth: 0, ...extra,
  });
  // Deterministic, scale-invariant text auto-fit: the canvas is always 1:1, so a
  // full-width line holds ~140 chars at 1em (1.4 chars per 1% width). Estimate the
  // chars this zone can hold and shrink the font (down to 55%) so text never crops
  // or overflows — preventing the overlapping/cut-off text the QA gate rejects.
  const CHARS_PER_PCT_AT_1EM = 1.4;
  const fitScale = (text: string | null | undefined, zoneWidthPct: number, baseEm: number, lines = 1): number => {
    if (!text) return baseEm;
    const maxChars = Math.max(1, (zoneWidthPct * CHARS_PER_PCT_AT_1EM * lines) / baseEm);
    const ratio = maxChars / text.length;
    return ratio >= 1 ? baseEm : Math.max(baseEm * 0.55, baseEm * ratio);
  };
  const Z = dep.zones;
  const initials = (ad.agentName || "").trim().slice(0, 1) || "ZO";
  // Creative Production Engine: AI advertising scene behind the locked composite.
  // ai_hero → the scene IS the property hero (skip the separate photo zone);
  // ai_scene → scene is atmosphere only, real photo stays locked in its zone.
  const sceneUrl = ad.sceneUrl ?? null;
  const heroScene = sceneUrl != null && ad.sceneStatus === "ai_hero";
  const showPhotoZone = Z.image.shown && !heroScene;

  return (
    <div id={refId} dir="rtl" style={{ position: "relative", aspectRatio: `${dep.canvas.width} / ${dep.canvas.height}`, width: "100%", overflow: "hidden", borderRadius: 14 * scale, background: `linear-gradient(160deg, ${pal.bg2}, ${pal.bg})`, color: pal.text, fontFamily: "inherit" }}>
      {/* BASE: AI advertising scene (full-bleed) + readability scrim */}
      {sceneUrl && (
        <div style={{ position: "absolute", inset: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sceneUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.35), transparent 30%, transparent 55%, rgba(0,0,0,0.72))" }} />
        </div>
      )}
      {/* IMAGE ZONE — locked real property photo, framed per template language */}
      {showPhotoZone && (
        <div style={{ position: "absolute", top: pct(Z.image.top), left: pct(Z.image.left), width: pct(Z.image.width), height: pct(Z.image.height), overflow: "hidden", borderRadius: st.image === "rounded" ? 20 * scale : 0, border: st.image === "framed" ? `${2 * scale}px solid rgba(255,255,255,0.85)` : undefined, boxShadow: st.image === "rounded" ? `0 ${10 * scale}px ${30 * scale}px rgba(0,0,0,0.3)` : undefined }}>
          {ad.propertyImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.propertyImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
          ) : <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: `linear-gradient(160deg, ${pal.bg2}, ${pal.bg})`, color: pal.muted, fontSize: fs(0.8) }}>אין תמונת נכס</div>}
          <div style={{ position: "absolute", inset: 0, background: st.scrim }} />
          {/* Architectural corner ticks */}
          {st.cornerMarks && [["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h],i)=>(
            <div key={i} style={{ position:"absolute",[v]:8*scale,[h]:8*scale,width:18*scale,height:18*scale,[`border${v[0].toUpperCase()+v.slice(1)}`]:`${2*scale}px solid rgba(255,255,255,0.9)`,[`border${h[0].toUpperCase()+h.slice(1)}`]:`${2*scale}px solid rgba(255,255,255,0.9)` } as React.CSSProperties} />
          ))}
        </div>
      )}

      {/* LOGO ZONE — real logo file only (never recreated as a mark) */}
      {Z.logo.shown && (ad.logoUrl || ad.logoText) && (
        <div style={zoneBox(Z.logo, { alignItems: Z.logo.align === "end" ? "flex-end" : "flex-start" })}>
          {ad.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.logoUrl} alt="" style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
          ) : <span style={{ fontSize: fs(0.95), fontWeight: 900, color: pal.text, opacity: 0.9 }}>{ad.logoText}</span>}
        </div>
      )}

      {/* BADGE ZONE — treatment varies per template */}
      {Z.badge.shown && ad.badge && st.badge !== "none" && (
        <div style={zoneBox(Z.badge, { alignItems: Z.badge.align === "end" ? "flex-end" : "flex-start" })}>
          {st.badge === "pill" && <span style={{ background: pal.accent, color: pal.onAccent, fontSize: fs(0.8), fontWeight: 900, padding: `${4 * scale}px ${10 * scale}px`, borderRadius: 999, whiteSpace: "nowrap" }}>{ad.badge}</span>}
          {st.badge === "bar" && <span style={{ background: pal.accent, color: pal.onAccent, fontSize: fs(0.78), fontWeight: 900, padding: `${4 * scale}px ${12 * scale}px`, borderRadius: 0, letterSpacing: 1, whiteSpace: "nowrap" }}>{ad.badge}</span>}
          {st.badge === "hairline" && <span style={{ color: "#fff", fontSize: fs(0.72), fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", borderTop: `${1.5 * scale}px solid ${pal.accent}`, paddingTop: 4 * scale, whiteSpace: "nowrap", ...shadow }}>{ad.badge}</span>}
        </div>
      )}

      {/* HEADLINE ZONE — exact Hebrew string, RTL, auto-fit; styled per template */}
      {Z.headline.shown && (
        <div style={zoneBox(Z.headline)}>
          <div style={{ color: st.headlineColor === "accent" ? pal.accent : "#fff", fontSize: fs(fitScale(ad.headline, Z.headline.width, T.headline, 2)), fontWeight: Math.max(300, T.headlineWeight + st.headlineWeightDelta), lineHeight: st.headlineUpper ? 1.12 : 1.06, letterSpacing: st.headlineTracking * scale, textTransform: st.headlineUpper ? "uppercase" : "none", ...shadow, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{ad.headline}</div>
          {st.divider && <div style={{ marginTop: 6 * scale, width: 44 * scale, height: 2 * scale, background: pal.accent, alignSelf: Z.headline.align === "center" ? "center" : Z.headline.align === "end" ? "flex-end" : "flex-start" }} />}
        </div>
      )}
      {/* SUBHEADLINE ZONE */}
      {Z.subheadline.shown && ad.subheadline && (
        <div style={zoneBox(Z.subheadline)}>
          <div style={{ color: pal.accent, fontSize: fs(fitScale(ad.subheadline, Z.subheadline.width, T.subheadline, 1)), fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", ...shadow }}>{ad.subheadline}</div>
        </div>
      )}

      {/* PRICE ZONE — treatment varies per template (block / tag / bare / underline) */}
      {Z.price.shown && ad.price && (
        <div style={zoneBox(Z.price)}>
          {st.price === "block" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2 * scale, background: pal.accent, color: pal.onAccent, borderRadius: 14 * scale, padding: `${8 * scale}px ${14 * scale}px`, width: "100%", height: "100%", boxShadow: `0 ${10 * scale}px ${26 * scale}px ${pal.accent}66`, overflow: "hidden" }}>
              <span style={{ fontSize: fs(0.78), fontWeight: 800, opacity: 0.85, whiteSpace: "nowrap" }}>{ad.priceLabel}</span>
              <span style={{ fontSize: fs(fitScale(ad.price, Z.price.width - 6, T.price, 1)), fontWeight: 900, lineHeight: 1, letterSpacing: -0.5, whiteSpace: "nowrap" }}>{ad.price}</span>
            </div>
          )}
          {st.price === "tag" && (
            <div style={{ display: "inline-flex", alignItems: "baseline", gap: 6 * scale, border: `${1.5 * scale}px solid ${pal.accent}`, borderRadius: 8 * scale, padding: `${5 * scale}px ${12 * scale}px`, maxWidth: "100%", overflow: "hidden" }}>
              <span style={{ color: pal.accent, fontSize: fs(0.74), fontWeight: 700, whiteSpace: "nowrap" }}>{ad.priceLabel}</span>
              <span style={{ color: "#fff", fontSize: fs(fitScale(ad.price, Z.price.width - 6, T.price, 1)), fontWeight: 900, whiteSpace: "nowrap", ...shadow }}>{ad.price}</span>
            </div>
          )}
          {st.price === "bare" && (
            <div style={{ display: "flex", flexDirection: "column", maxWidth: "100%", overflow: "hidden" }}>
              <span style={{ color: "#fff", opacity: 0.7, fontSize: fs(0.66), fontWeight: 600, letterSpacing: 2, textTransform: "uppercase", whiteSpace: "nowrap", ...shadow }}>{ad.priceLabel}</span>
              <span style={{ color: "#fff", fontSize: fs(fitScale(ad.price, Z.price.width, T.price * 1.15, 1)), fontWeight: 800, lineHeight: 1, whiteSpace: "nowrap", ...shadow }}>{ad.price}</span>
            </div>
          )}
          {st.price === "underline" && (
            <div style={{ display: "inline-flex", flexDirection: "column", maxWidth: "100%", overflow: "hidden", borderBottom: `${2 * scale}px solid ${pal.accent}`, paddingBottom: 3 * scale }}>
              <span style={{ color: "#fff", fontSize: fs(fitScale(`${ad.priceLabel} ${ad.price}`, Z.price.width, T.price, 1)), fontWeight: 800, whiteSpace: "nowrap", ...shadow }}>{ad.price}</span>
            </div>
          )}
        </div>
      )}

      {/* FEATURES ZONE — grid (data) / chips (sales) / inline text (editorial) / none (luxury) */}
      {Z.features.shown && st.features !== "none" && ad.features.length > 0 && (
        <div style={zoneBox(Z.features, { justifyContent: "flex-start" })}>
          {st.features === "grid" ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 * scale, width: "100%" }}>
              {ad.features.slice(0, 4).map((ft, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10 * scale, padding: `${7 * scale}px ${9 * scale}px` }}>
                  <span style={{ color: pal.text, fontSize: fs(T.featureValue), fontWeight: 900, lineHeight: 1 }}>{ft.value || "✓"}</span>
                  <span style={{ display: "block", color: pal.muted, fontSize: fs(T.featureLabel), fontWeight: 700 }}>{ft.label}</span>
                </div>
              ))}
            </div>
          ) : st.features === "inline" ? (
            <div style={{ display: "flex", flexWrap: "nowrap", alignItems: "center", gap: 6 * scale, width: "100%", overflow: "hidden", justifyContent: Z.features.align === "center" ? "center" : "flex-start" }}>
              {ad.features.slice(0, 4).map((ft, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 6 * scale, color: "#fff", fontSize: fs(T.featureLabel), fontWeight: 600, whiteSpace: "nowrap", ...shadow }}>
                  {i > 0 && <span style={{ color: pal.accent, opacity: 0.8 }}>·</span>}
                  {ft.value ? `${ft.value} ${ft.label}` : ft.label}
                </span>
              ))}
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 * scale, width: "100%", justifyContent: Z.features.align === "center" ? "center" : "flex-start" }}>
              {ad.features.slice(0, 5).map((ft, i) => (
                <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 * scale, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 999, padding: `${4 * scale}px ${9 * scale}px`, color: "#fff", fontSize: fs(T.featureLabel), fontWeight: 700, backdropFilter: "blur(6px)" }}>
                  <span style={{ color: pal.accent, display: "inline-flex" }}><Icon name={AD_FEATURE_ICON[ft.icon] ?? "Dot"} size={13 * scale} /></span>
                  {ft.value ? `${ft.value} ${ft.label}` : ft.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CTA ZONE — treatment varies per template (pill / bar / outline / link) */}
      {Z.cta.shown && ad.cta && (() => {
        const ctaFs = fs(fitScale(ad.cta, Z.cta.width - 6, T.cta, 1));
        return (
        <div style={zoneBox(Z.cta)}>
          {st.cta === "pill" && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5 * scale, maxWidth: "100%", background: `linear-gradient(135deg, ${pal.accent}, ${pal.accent2})`, color: pal.onAccent, fontSize: ctaFs, fontWeight: 900, padding: `${8 * scale}px ${14 * scale}px`, borderRadius: 999, whiteSpace: "nowrap", overflow: "hidden", boxShadow: `0 ${8 * scale}px ${20 * scale}px ${pal.accent}55` }}>
              <Icon name="MessageCircle" size={13 * scale} /> {ad.cta}
            </div>
          )}
          {st.cta === "bar" && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 * scale, width: "100%", height: "100%", background: pal.accent, color: pal.onAccent, fontSize: ctaFs, fontWeight: 900, borderRadius: 4 * scale, whiteSpace: "nowrap", overflow: "hidden" }}>
              {ad.cta} <Icon name="ArrowLeft" size={14 * scale} />
            </div>
          )}
          {st.cta === "outline" && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 * scale, maxWidth: "100%", border: `${1.5 * scale}px solid #fff`, color: "#fff", fontSize: ctaFs, fontWeight: 700, padding: `${7 * scale}px ${16 * scale}px`, borderRadius: 4 * scale, letterSpacing: 1, whiteSpace: "nowrap", overflow: "hidden", ...shadow }}>
              {ad.cta} <Icon name="ArrowLeft" size={13 * scale} />
            </div>
          )}
          {st.cta === "link" && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6 * scale, maxWidth: "100%", color: "#fff", fontSize: ctaFs, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", borderBottom: `${2 * scale}px solid ${pal.accent}`, paddingBottom: 3 * scale, ...shadow }}>
              {ad.cta} <Icon name="ArrowLeft" size={13 * scale} />
            </div>
          )}
        </div>
        );
      })()}

      {/* AGENT ZONE — only when DEP says showAgentImage; photo only if real */}
      {Z.agent.shown && f.agentShown && (ad.agentName || ad.agentPhone || f.agentPhotoShown) && (
        <div style={zoneBox(Z.agent, { flexDirection: "row", justifyContent: Z.agent.align === "end" ? "flex-end" : "flex-start", gap: 8 * scale })}>
          {f.agentPhotoShown && ad.agentPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ad.agentPhoto} alt="" style={{ width: 40 * scale, height: 40 * scale, borderRadius: 999, objectFit: "cover", border: `2px solid ${pal.accent}`, flexShrink: 0 }} />
          ) : (
            <div style={{ width: 36 * scale, height: 36 * scale, borderRadius: 999, display: "grid", placeItems: "center", background: pal.accent, color: pal.onAccent, fontSize: fs(1.1), fontWeight: 900, flexShrink: 0 }}>{initials}</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            {ad.agentName && <span style={{ color: "#fff", fontSize: fs(T.agent), fontWeight: 900, whiteSpace: "nowrap", ...shadow }}>{ad.agentName}</span>}
            {ad.agentPhone && <span style={{ color: pal.muted, fontSize: fs(T.agent * 0.92), fontWeight: 700, direction: "ltr" }}>{ad.agentPhone}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function FinalAdRenderer({ ad, scale = 1, refId }: { ad: FinalAdView; scale?: number; refId?: string }) {
  // PRODUCTION ONLY: execute the approved Design Execution Plan verbatim.
  if (ad.designPlan) return <DepCanvas ad={ad} dep={ad.designPlan} scale={scale} refId={refId} />;
  const pal = ad.palette;
  const s = (n: number) => n * scale;
  const initials = (ad.agentName || "").trim().slice(0, 1) || "ZO";
  const shadow = { textShadow: "0 2px 14px rgba(0,0,0,0.6)" } as React.CSSProperties;

  // ── Shared atoms (plain render fns → satisfy react-hooks/static-components) ──
  const heroFill = (overlay?: string) => (
    <>
      {ad.propertyImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ad.propertyImage} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: `linear-gradient(160deg, ${pal.bg2}, ${pal.bg})`, color: pal.muted, fontSize: s(12), fontWeight: 700 }}>אין תמונת נכס</div>
      )}
      {overlay && <div style={{ position: "absolute", inset: 0, background: overlay }} />}
    </>
  );
  const logo = (dark = false) => ad.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={ad.logoUrl} alt="" style={{ height: s(30), maxWidth: s(124), objectFit: "contain" }} />
  ) : <span style={{ fontSize: s(13), fontWeight: 900, color: dark ? pal.onAccent : pal.text, opacity: 0.95 }}>{ad.logoText || ""}</span>;
  const badge = () => ad.badge ? <span style={{ background: pal.accent, color: pal.onAccent, fontSize: s(11), fontWeight: 900, padding: `${s(3)}px ${s(10)}px`, borderRadius: 999, whiteSpace: "nowrap" }}>{ad.badge}</span> : null;
  const featureRow = (light = true) => ad.features.length ? (
    <div style={{ display: "flex", justifyContent: "space-around", gap: s(6), padding: `${s(8)}px ${s(6)}px`, background: light ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.25)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: s(12), backdropFilter: "blur(6px)" }}>
      {ad.features.map((f, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: s(2), flex: 1, minWidth: 0 }}>
          <span style={{ color: pal.accent, display: "inline-flex" }}><Icon name={AD_FEATURE_ICON[f.icon] ?? "Dot"} size={s(17)} /></span>
          {f.value && <span style={{ color: pal.text, fontSize: s(13.5), fontWeight: 900, lineHeight: 1 }}>{f.value}</span>}
          <span style={{ color: pal.muted, fontSize: s(9), fontWeight: 700, textAlign: "center", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{f.label}</span>
        </div>
      ))}
    </div>
  ) : null;
  const ctaPill = (full = false) => (
    <div style={{ display: "inline-flex", alignSelf: full ? "stretch" : "flex-start", justifyContent: "center", alignItems: "center", gap: s(6), background: `linear-gradient(135deg, ${pal.accent}, ${pal.accent2})`, color: pal.onAccent, fontSize: s(12), fontWeight: 900, padding: `${s(9)}px ${s(16)}px`, borderRadius: 999, boxShadow: `0 ${s(8)}px ${s(20)}px ${pal.accent}55`, whiteSpace: "nowrap" }}>
      <Icon name="MessageCircle" size={s(14)} /> {ad.cta}
    </div>
  );
  const agentStrip = (big = false) => (ad.agentName || ad.agentPhone || ad.agentPhoto) ? (
    <div style={{ display: "flex", alignItems: "center", gap: s(8), minWidth: 0 }}>
      {ad.agentPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ad.agentPhoto} alt="" style={{ width: s(big ? 48 : 38), height: s(big ? 48 : 38), borderRadius: 999, objectFit: "cover", border: `2px solid ${pal.accent}` }} />
      ) : (
        <div style={{ width: s(big ? 48 : 38), height: s(big ? 48 : 38), borderRadius: 999, display: "grid", placeItems: "center", background: pal.accent, color: pal.onAccent, fontSize: s(15), fontWeight: 900 }}>{initials}</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        {ad.agentName && <span style={{ color: pal.text, fontSize: s(12.5), fontWeight: 900, whiteSpace: "nowrap" }}>{ad.agentName}</span>}
        {ad.agentPhone && <span style={{ color: pal.muted, fontSize: s(11), fontWeight: 700, direction: "ltr", textAlign: "right" }}>{ad.agentPhone}</span>}
      </div>
    </div>
  ) : null;

  const frame: React.CSSProperties = { position: "relative", aspectRatio: "1 / 1", width: "100%", overflow: "hidden", borderRadius: s(16), background: `linear-gradient(160deg, ${pal.bg2}, ${pal.bg})`, color: pal.text, fontFamily: "inherit" };

  // ── Composition: URGENCY — bold top banner, big price, action-now ────────────
  if (ad.composition === "urgency_banner") {
    return (
      <div id={refId} dir="rtl" style={frame}>
        <div style={{ position: "absolute", insetInline: 0, top: 0, height: "26%", background: `linear-gradient(120deg, ${pal.accent}, ${pal.bg2})`, padding: s(14), display: "flex", flexDirection: "column", justifyContent: "center", gap: s(4) }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>{logo()}{badge()}</div>
          <div style={{ color: "#fff", fontSize: s(25), fontWeight: 900, lineHeight: 1.0, ...shadow }}>{ad.headline}</div>
        </div>
        <div style={{ position: "absolute", insetInline: 0, top: "26%", bottom: "30%", overflow: "hidden" }}>{heroFill("linear-gradient(180deg, transparent 50%, rgba(0,0,0,0.55))")}
          {ad.subheadline && <div style={{ position: "absolute", insetInline: s(14), bottom: s(8), color: "#fff", fontSize: s(13), fontWeight: 800, ...shadow }}>{ad.subheadline}</div>}
        </div>
        <div style={{ position: "absolute", insetInline: 0, bottom: 0, height: "30%", padding: s(12), display: "flex", flexDirection: "column", justifyContent: "center", gap: s(8) }}>
          {ad.price && <div style={{ alignSelf: "center", display: "flex", alignItems: "baseline", gap: s(6), background: pal.accent, color: pal.onAccent, padding: `${s(6)}px ${s(16)}px`, borderRadius: s(12), boxShadow: `0 ${s(10)}px ${s(24)}px ${pal.accent}66` }}><span style={{ fontSize: s(28), fontWeight: 900 }}>{ad.price}</span><span style={{ fontSize: s(12), fontWeight: 800 }}>בלבד!</span></div>}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: s(8) }}>{agentStrip()}{ctaPill()}</div>
        </div>
      </div>
    );
  }

  // ── Composition: LIFESTYLE (family) — warm, photo-forward, trust ─────────────
  if (ad.composition === "lifestyle") {
    return (
      <div id={refId} dir="rtl" style={frame}>
        <div style={{ position: "absolute", insetInline: s(12), top: s(12), height: "50%", borderRadius: s(16), overflow: "hidden", boxShadow: `0 ${s(16)}px ${s(36)}px rgba(0,0,0,0.4)` }}>
          {heroFill(`linear-gradient(180deg, rgba(0,0,0,0.05), transparent 40%, ${pal.bg}22)`)}
          <div style={{ position: "absolute", top: s(10), insetInlineEnd: s(10) }}>{logo()}</div>
          {ad.badge && <div style={{ position: "absolute", top: s(10), insetInlineStart: s(10) }}>{badge()}</div>}
        </div>
        <div style={{ position: "absolute", insetInline: s(14), top: "calc(50% + 22px)", bottom: s(12), display: "flex", flexDirection: "column", gap: s(8) }}>
          <div style={{ color: pal.text, fontSize: s(23), fontWeight: 900, lineHeight: 1.05 }}>{ad.headline}</div>
          {ad.subheadline && <div style={{ color: pal.accent, fontSize: s(12.5), fontWeight: 800 }}>{ad.subheadline}</div>}
          {featureRow()}
          {ad.price && <div style={{ color: pal.text, fontSize: s(20), fontWeight: 900 }}>{ad.price}</div>}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: s(8), marginTop: "auto" }}>{agentStrip(true)}{ctaPill()}</div>
        </div>
      </div>
    );
  }

  // ── Composition: INVESTMENT — structured data panel, rational ────────────────
  if (ad.composition === "data_panel") {
    const metrics = [ad.price ? { v: ad.price, l: "מחיר" } : null, ...ad.features.slice(0, 3).map((f) => ({ v: f.value || "✓", l: f.label }))].filter(Boolean).slice(0, 4) as { v: string; l: string }[];
    return (
      <div id={refId} dir="rtl" style={frame}>
        <div style={{ position: "absolute", insetInline: 0, top: 0, height: "40%", overflow: "hidden" }}>{heroFill("linear-gradient(180deg, rgba(0,0,0,0.25), transparent 40%, rgba(0,0,0,0.55))")}
          <div style={{ position: "absolute", top: s(12), insetInlineEnd: s(14) }}>{logo()}</div>
          {ad.badge && <div style={{ position: "absolute", top: s(12), insetInlineStart: s(14) }}>{badge()}</div>}
          <div style={{ position: "absolute", insetInline: s(14), bottom: s(10), color: "#fff", fontSize: s(22), fontWeight: 900, ...shadow }}>{ad.headline}</div>
        </div>
        <div style={{ position: "absolute", insetInline: s(14), top: "calc(40% + 12px)", bottom: s(12), display: "flex", flexDirection: "column", gap: s(8) }}>
          {ad.subheadline && <div style={{ color: pal.accent, fontSize: s(12), fontWeight: 800 }}>{ad.subheadline}</div>}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: s(7) }}>
            {metrics.map((m, i) => (
              <div key={i} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: s(10), padding: `${s(8)}px ${s(10)}px`, display: "flex", flexDirection: "column", gap: s(1) }}>
                <span style={{ color: pal.text, fontSize: s(16), fontWeight: 900, lineHeight: 1 }}>{m.v}</span>
                <span style={{ color: pal.muted, fontSize: s(9.5), fontWeight: 700 }}>{m.l}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: s(8), marginTop: "auto" }}>{agentStrip()}{ctaPill()}</div>
        </div>
      </div>
    );
  }

  // ── Composition: PRICE HERO — the price dominates ────────────────────────────
  if (ad.composition === "price_hero") {
    return (
      <div id={refId} dir="rtl" style={frame}>
        <div style={{ position: "absolute", insetInline: 0, top: 0, height: "40%", overflow: "hidden" }}>{heroFill("linear-gradient(180deg, rgba(0,0,0,0.3), transparent 35%, rgba(0,0,0,0.6))")}
          <div style={{ position: "absolute", top: s(12), insetInlineEnd: s(14) }}>{logo()}</div>
          {ad.badge && <div style={{ position: "absolute", top: s(12), insetInlineStart: s(14) }}>{badge()}</div>}
          <div style={{ position: "absolute", insetInline: s(14), bottom: s(8), color: "#fff", fontSize: s(18), fontWeight: 900, ...shadow }}>{ad.headline}</div>
        </div>
        <div style={{ position: "absolute", insetInline: 0, top: "40%", bottom: "20%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: s(2) }}>
          <span style={{ color: pal.muted, fontSize: s(12), fontWeight: 800, letterSpacing: 2 }}>{ad.priceLabel}</span>
          {ad.price && <span style={{ color: pal.accent, fontSize: s(44), fontWeight: 900, lineHeight: 1, letterSpacing: -1 }}>{ad.price}</span>}
          {ad.subheadline && <span style={{ color: pal.text, fontSize: s(12.5), fontWeight: 700, marginTop: s(4) }}>{ad.subheadline}</span>}
        </div>
        <div style={{ position: "absolute", insetInline: 0, bottom: 0, height: "20%", padding: s(12), display: "flex", alignItems: "center", justifyContent: "space-between", gap: s(8), background: "linear-gradient(180deg, transparent, rgba(0,0,0,0.4))" }}>{agentStrip()}{ctaPill()}</div>
      </div>
    );
  }

  // ── Composition: EDITORIAL (luxury) — cinematic full-bleed, lots of air ──────
  return (
    <div id={refId} dir="rtl" style={frame}>
      {heroFill("linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.2) 38%, rgba(0,0,0,0.82))")}
      <div style={{ position: "absolute", top: s(14), insetInline: s(16), display: "flex", alignItems: "center", justifyContent: "space-between" }}>{logo()}{badge()}</div>
      <div style={{ position: "absolute", insetInline: 0, top: "30%", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: `0 ${s(22)}px`, gap: s(8) }}>
        <span style={{ color: pal.accent, fontSize: s(10), fontWeight: 800, letterSpacing: 3 }}>{ad.triggerLabel} · ZONO</span>
        <div style={{ color: "#fff", fontSize: s(26), fontWeight: 900, lineHeight: 1.08, ...shadow }}>{ad.headline}</div>
        <div style={{ width: s(46), height: s(2), background: pal.accent }} />
        {ad.subheadline && <div style={{ color: "#fff", fontSize: s(12.5), fontWeight: 600, opacity: 0.92, ...shadow }}>{ad.subheadline}</div>}
      </div>
      {ad.price && <div style={{ position: "absolute", insetInlineStart: s(16), bottom: s(70), background: "rgba(0,0,0,0.4)", border: `1px solid ${pal.accent}`, color: pal.accent, fontSize: s(15), fontWeight: 900, padding: `${s(5)}px ${s(12)}px`, borderRadius: s(8), backdropFilter: "blur(6px)" }}>{ad.price}</div>}
      <div style={{ position: "absolute", insetInline: 0, bottom: 0, padding: `${s(10)}px ${s(16)}px`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: s(8) }}>{agentStrip()}{ctaPill()}</div>
    </div>
  );
}

/** Render the final ad offscreen at full resolution and download a square PNG
 *  (ready-to-post). Best-effort: real assets are inlined when CORS allows. */
async function exportFinalAdPng(ad: FinalAdView, filename: string): Promise<void> {
  const [{ toPng }, { createRoot }, React] = await Promise.all([
    import("html-to-image"), import("react-dom/client"), import("react"),
  ]);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-99999px;top:0;width:360px;height:360px;z-index:-1;";
  document.body.appendChild(host);
  const root = createRoot(host);
  await new Promise<void>((res) => { root.render(React.createElement(FinalAdRenderer, { ad, scale: 1 })); setTimeout(res, 80); });
  // Give real images a moment to load before capture.
  await Promise.all(Array.from(host.querySelectorAll("img")).map((img) => img.complete ? Promise.resolve() : new Promise((r) => { img.onload = img.onerror = () => r(null); })));
  try {
    const url = await toPng(host.firstElementChild as HTMLElement, { pixelRatio: 3, cacheBust: true, width: 360, height: 360 });
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  } finally { root.unmount(); host.remove(); }
}

function CreativePreview({ data, scale = 1, backgroundImageUrl, concept }: { data: RenderData; scale?: number; backgroundImageUrl?: string | null; concept?: AdConcept }) {
  // FULL-AD mode: the image model already designed the complete ad — just show it.
  if ((data as { fullAd?: boolean }).fullAd && backgroundImageUrl) {
    return (
      <div style={{ position: "relative", aspectRatio: `${data.width || 1080} / ${data.height || 1080}`, width: "100%", overflow: "hidden", borderRadius: 14 * scale, background: "#0b0b0b" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={backgroundImageUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }
  // FINAL AD mode: render the complete designer-grade square ad.
  if (data.ad) return <FinalAdRenderer ad={data.ad} scale={scale} />;
  const p = data.palette;
  const ad = extractAd(data);
  const c = concept ?? conceptFor(data);
  const photo = ad.image ?? backgroundImageUrl ?? null;
  const s = (n: number) => n * scale;

  // Cinematic crop position per concept for visual variety from ONE real photo.
  const objectPos = c === "luxury_editorial" ? "center 30%" : c === "modern_sales" ? "center 60%" : "center";
  // Render helpers (plain functions returning JSX — NOT components, so they keep
  // no state and satisfy react-hooks/static-components).
  const renderPhoto = () => photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: objectPos }} />
  ) : (
    <div style={{ position: "absolute", inset: 0, background: `radial-gradient(120% 120% at 80% 10%, ${p.accent}33, transparent), linear-gradient(160deg, ${p.bg2}, ${p.bg})` }} />
  );
  const renderChips = (light = true) => ad.chips.length ? (
    <div style={{ display: "flex", flexWrap: "wrap", gap: s(5), justifyContent: "flex-start" }}>
      {ad.chips.map((it, j) => (
        <span key={j} style={{ background: light ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.28)", color: "#fff", fontSize: s(10.5), fontWeight: 700, padding: `${s(4)}px ${s(9)}px`, borderRadius: 999, border: "1px solid rgba(255,255,255,0.28)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}>{it}</span>
      ))}
    </div>
  ) : null;
  const renderCta = (block = false) => ad.cta ? (
    <div style={{ alignSelf: block ? "stretch" : "flex-start", textAlign: "center", background: `linear-gradient(135deg, ${p.accent}, ${p.accent}cc)`, color: p.onAccent, fontSize: s(13), fontWeight: 900, padding: `${s(9)}px ${s(18)}px`, borderRadius: 999, boxShadow: `0 ${s(8)}px ${s(20)}px ${p.accent}66` }}>{ad.isWhatsapp ? "💬 " : ""}{ad.cta}</div>
  ) : null;
  const renderFooter = () => (ad.agent || ad.logo) ? (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: s(8), color: "#fff" }}>
      {ad.agent && <span style={{ fontSize: s(10.5), fontWeight: 700, opacity: 0.95 }}>{ad.agent}</span>}
      {ad.logo && <span style={{ fontSize: s(11), fontWeight: 900, letterSpacing: 0.5, opacity: 0.95 }}>{ad.logo}</span>}
    </div>
  ) : null;
  const shadow = { textShadow: "0 1px 12px rgba(0,0,0,0.55)" } as React.CSSProperties;

  const frame: React.CSSProperties = { position: "relative", aspectRatio: `${data.width} / ${data.height}`, borderRadius: s(14), overflow: "hidden", width: "100%", background: `linear-gradient(160deg, ${p.bg2}, ${p.bg})` };

  // ── Concept: Premium Clean — photo hero + bottom gradient + glass content ────
  if (c === "premium_clean") {
    return (
      <div dir="rtl" style={frame}>
        {renderPhoto()}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.18) 0%, transparent 28%, transparent 42%, rgba(0,0,0,0.82) 100%)" }} />
        {ad.location && <div style={{ position: "absolute", top: s(14), insetInlineEnd: s(14), ...shadow, color: "#fff", fontSize: s(11), fontWeight: 700 }}>📍 {ad.location}</div>}
        <div style={{ position: "absolute", insetInline: 0, bottom: 0, padding: s(16), display: "flex", flexDirection: "column", gap: s(8) }}>
          <div style={{ width: s(34), height: s(3), background: p.accent, borderRadius: 2 }} />
          <div style={{ color: "#fff", fontSize: s(25), fontWeight: 900, lineHeight: 1.05, ...shadow }}>{ad.headline}</div>
          {ad.price && <div style={{ color: "#fff", fontSize: s(20), fontWeight: 900, ...shadow }}>{ad.price}</div>}
          {renderChips()}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: s(8), marginTop: s(2) }}>{renderCta()}{renderFooter()}</div>
        </div>
      </div>
    );
  }
  // ── Concept: Luxury Editorial — dark cinematic, centered, gold accent ────────
  if (c === "luxury_editorial") {
    return (
      <div dir="rtl" style={frame}>
        {renderPhoto()}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.85))" }} />
        {ad.price && <div style={{ position: "absolute", top: s(14), insetInlineStart: s(14), background: "rgba(0,0,0,0.4)", border: `1px solid ${GOLD}`, color: GOLD, fontSize: s(12), fontWeight: 900, padding: `${s(4)}px ${s(10)}px`, borderRadius: 6, backdropFilter: "blur(6px)" }}>{ad.price}</div>}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: s(20), gap: s(8) }}>
          <span style={{ color: GOLD, fontSize: s(10), fontWeight: 800, letterSpacing: 3 }}>ZONO · אקסקלוסיבי</span>
          <div style={{ color: "#fff", fontSize: s(26), fontWeight: 900, lineHeight: 1.1, ...shadow }}>{ad.headline}</div>
          <div style={{ width: s(48), height: s(2), background: GOLD }} />
          {ad.subheadline && <div style={{ color: "#fff", fontSize: s(13), fontWeight: 600, opacity: 0.9, ...shadow }}>{ad.subheadline}</div>}
        </div>
        <div style={{ position: "absolute", insetInline: 0, bottom: 0, padding: s(14), display: "flex", alignItems: "center", justifyContent: "space-between", gap: s(8) }}>{renderCta()}{renderFooter()}</div>
      </div>
    );
  }
  // ── Concept: Modern Sales — photo top + frosted glass content card ───────────
  if (c === "modern_sales") {
    return (
      <div dir="rtl" style={frame}>
        {renderPhoto()}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.45))" }} />
        {ad.price && <div style={{ position: "absolute", top: s(14), insetInlineStart: s(14), background: p.accent, color: p.onAccent, fontSize: s(15), fontWeight: 900, padding: `${s(5)}px ${s(12)}px`, borderRadius: 10, boxShadow: `0 ${s(8)}px ${s(18)}px ${p.accent}66` }}>{ad.price}</div>}
        <div style={{ position: "absolute", insetInline: s(12), bottom: s(12), padding: s(14), borderRadius: s(16), background: "rgba(20,16,40,0.55)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", display: "flex", flexDirection: "column", gap: s(8) }}>
          <div style={{ color: "#fff", fontSize: s(22), fontWeight: 900, lineHeight: 1.08 }}>{ad.headline}</div>
          {renderChips()}
          {renderCta(true)}
          {renderFooter()}
        </div>
      </div>
    );
  }
  // ── Concept: Bold Broker — accent header block + photo + agent strip ─────────
  if (c === "bold_broker") {
    return (
      <div dir="rtl" style={frame}>
        <div style={{ position: "absolute", insetInline: 0, top: 0, height: "34%", background: `linear-gradient(135deg, ${p.accent}, ${p.bg2})`, padding: s(16), display: "flex", flexDirection: "column", justifyContent: "center", gap: s(6) }}>
          <div style={{ color: "#fff", fontSize: s(24), fontWeight: 900, lineHeight: 1.05, ...shadow }}>{ad.headline}</div>
          {ad.price && <div style={{ color: "#fff", fontSize: s(18), fontWeight: 900 }}>{ad.price}</div>}
        </div>
        <div style={{ position: "absolute", insetInline: 0, top: "34%", bottom: "16%", overflow: "hidden" }}>{renderPhoto()}<div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.5))" }} /><div style={{ position: "absolute", insetInline: s(14), bottom: s(8) }}>{renderChips()}</div></div>
        <div style={{ position: "absolute", insetInline: 0, bottom: 0, height: "16%", background: p.text, padding: `0 ${s(14)}px`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: s(8) }}>
          <span style={{ color: p.bg, fontSize: s(11), fontWeight: 800 }}>{ad.agent || ad.location}</span>
          <span style={{ color: p.accent, fontSize: s(12), fontWeight: 900 }}>{ad.logo || ad.cta}</span>
        </div>
      </div>
    );
  }
  // ── Concept: Minimal High-End — framed photo, refined type, lots of space ────
  return (
    <div dir="rtl" style={{ ...frame, background: "#0e0c16", padding: s(12) }}>
      <div style={{ position: "absolute", inset: s(12), borderRadius: s(10), overflow: "hidden" }}>
        {renderPhoto()}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.15), transparent 40%, rgba(0,0,0,0.7))" }} />
        <div style={{ position: "absolute", top: s(12), insetInlineEnd: s(12), color: "#fff", fontSize: s(11), fontWeight: 700, letterSpacing: 1, ...shadow }}>{ad.location}</div>
        <div style={{ position: "absolute", insetInline: s(14), bottom: s(12), display: "flex", flexDirection: "column", gap: s(6) }}>
          <div style={{ color: "#fff", fontSize: s(22), fontWeight: 800, lineHeight: 1.1, ...shadow }}>{ad.headline}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: s(8) }}>
            {ad.price && <span style={{ color: "#fff", fontSize: s(16), fontWeight: 900, ...shadow }}>{ad.price}</span>}
            {renderFooter()}
          </div>
          {renderCta()}
        </div>
      </div>
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

function QuickCreativeSection({ outputs, et, eid, wrap, canViewPrompt, orgId, userId, prefill, aiProvider }: { outputs: QuickOutput[]; et: string; eid: string; wrap: Wrap; canViewPrompt?: boolean; orgId: string; userId: string; prefill?: Record<string, string | boolean | number>; aiProvider?: AiProviderStatus }) {
  const [wizardType, setWizardType] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <div><h2 className="text-ink text-lg font-black">יצירה מהירה</h2><p className="text-muted text-[12px]">לחצו, מלאו טופס קצר וקבלו 4 וריאציות עיצוב ממותגות ומוכנות לפרסום.</p></div>
      {/* BUILD SIGNATURE — proves which build is running (diagnostic only) */}
      <div dir="ltr" className="bg-surface border-line text-muted flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-3 py-2 font-mono text-[10px]">
        <span className="text-brand-strong font-bold">ZONO Build Signature</span>
        <span>commit: <b className="text-ink">{BUILD_SIGNATURE.commit}</b></span>
        <span>branch: {BUILD_SIGNATURE.branch}</span>
        <span>signed: {BUILD_SIGNATURE.signedAt}</span>
        <span>renderer: <b className="text-ink">{BUILD_SIGNATURE.rendererVersion}</b></span>
        <span>concept-engine: <b className="text-ink">{BUILD_SIGNATURE.conceptEngineVersion}</b></span>
        <span>design-system: <b className="text-ink">{BUILD_SIGNATURE.designSystemVersion}</b></span>
      </div>
      {/* AI PROVIDER STATUS — explains whether creatives are AI-produced or deterministic fallback */}
      {aiProvider && (
        aiProvider.provider === "mock" ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            <Icon name="TriangleAlert" size={14} />
            <b>ספק תמונות AI לא מוגדר</b>
            <span>— הקריאייטיבים נוצרים במנוע הדטרמיניסטי (fallback). להפעלת סצנות AI יש להגדיר ZONO_IMAGE_PROVIDER=openai עם OPENAI_API_KEY (או =gemini עם GEMINI_API_KEY).</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
            <Icon name="Sparkles" size={14} />
            <b>ספק תמונות AI פעיל: {aiProvider.provider}</b>
            <span>— כל קונספט מקבל סצנת פרסום קולנועית; הנכס, הלוגו, הסוכן והטקסט בעברית נשארים נעולים.</span>
          </div>
        )
      )}
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
      {canViewPrompt && <AdminCandidatesPanel et={et} eid={eid} />}
      {wizardType && <QuickCreativeWizard type={wizardType} et={et} eid={eid} orgId={orgId} userId={userId} prefill={prefill} onClose={() => setWizardType(null)} />}
    </section>
  );
}

/** Admin/debug: every generated candidate (selected + rejected) with scores + critic. */
function AdminCandidatesPanel({ et, eid }: { et: string; eid: string }) {
  const [open, setOpen] = useState(false);
  const [cands, setCands] = useState<Record<string, unknown>[] | null>(null);
  const load = async () => { const r = await listCreativeCandidatesAction({ entityType: et, entityId: eid }); setCands(r.candidates); };
  return (
    <div className="border-line bg-surface/50 rounded-2xl border p-3">
      <button onClick={() => { setOpen(!open); if (!cands) void load(); }} className="text-brand-strong inline-flex items-center gap-1 text-[12px] font-bold">
        <Icon name="Shield" size={13} /> מנוע איכות — מועמדים שנוצרו (אדמין)
      </button>
      {open && (
        <div className="mt-2 flex flex-col gap-1.5">
          {cands == null ? <p className="text-muted text-[11px]">טוען…</p>
            : cands.length === 0 ? <p className="text-muted text-[11px]">אין מועמדים שמורים עדיין — צור קריאייטיב חדש.</p>
            : cands.slice(0, 40).map((c) => {
              const sel = Boolean(c.is_selected);
              return (
                <div key={String(c.id)} className={`bg-card border-line flex items-center gap-2 rounded-lg border p-2 text-[11px] ${sel ? "ring-1 ring-success" : "opacity-80"}`}>
                  <span className={`rounded px-1.5 py-0.5 font-black ${sel ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{sel ? "נבחר" : "נדחה"}</span>
                  <span className="text-muted">{String(c.candidate_family ?? "")}</span>
                  <span className="text-ink font-bold">ציון {String(c.quality_score ?? 0)}</span>
                  <span className="text-brand-strong font-bold">WOW {String(c.wow_score ?? 0)}</span>
                  <span className="text-muted truncate flex-1">{String(c.rejection_reason ?? c.property_primary_angle ?? "")}</span>
                  <span className="text-muted/60">סבב {String(c.generation_round ?? 1)}</span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

function QuickResultCard({ o, et, eid, wrap, canViewPrompt }: { o: QuickOutput; et: string; eid: string; wrap: Wrap; canViewPrompt?: boolean }) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [adOnly, setAdOnly] = useState(false);
  // FINAL AD mode: the complete ready-to-post creative carries an `ad` spec.
  const ad = o.render_data?.ad as FinalAdView | undefined;
  // FULL-AD mode: the image model designed the whole ad; we just show o.image_url.
  const fullAd = Boolean(o.render_data?.fullAd) && Boolean(o.image_url);
  // FINAL_AD_IMAGE_ONLY: the thumbnail must BE the AI poster (or an error), never a card.
  const isFinalImage = Boolean(o.image_url) && (o.image_status === "ai_full_ad" || o.image_status === "generated" || Boolean(o.render_data?.fullAd));
  const isFailed = !o.image_url && (o.image_status === "failed" || o.quality_status === "failed");
  const adScores = ad?.scores ?? (o.creative_selection_metadata as unknown as Partial<FinalAdScores> | undefined);
  const adWarnings = adScores?.warnings ?? [];
  // The real property photo comes from the final ad or the render's image_placeholder.
  const blocks = (o.render_data?.blocks ?? []) as { component?: string; imageUrl?: string }[];
  const hasPropertyImage = ad ? Boolean(ad.propertyImage) : blocks.some((b) => b.component === "image_placeholder" && b.imageUrl);
  const doExport = async () => {
    if (!ad) return; setExporting(true);
    try { await exportFinalAdPng(ad, `zono-ad-${o.id}.png`); } catch { /* best-effort */ } finally { setExporting(false); }
  };
  return (
    <div className={`bg-card border-line flex flex-col gap-2 rounded-2xl border p-2.5 shadow-sm ${o.is_approved ? "ring-1 ring-success" : o.status === "rejected" ? "opacity-60" : ""}`}>
      {/* Text-locked composite: ZONO renderer draws Hebrew (system font, RTL) +
          real photo/assets on top of the AI's TEXT-FREE background. The AI never
          writes Hebrew and never invents assets. */}
      <div className="relative">
        {isFinalImage ? (
          // FINAL_AD_IMAGE_ONLY: the thumbnail IS the full AI-generated poster — no
          // card renderer, no overlays. This is the finished social-media ad.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={o.image_url as string} alt={o.variant_name ?? "מודעה סופית"} className="border-line w-full rounded-xl border object-contain" />
        ) : isFailed ? (
          // Generation failed — show an explicit error, NEVER a card fallback.
          <div className="border-danger/40 bg-danger-soft/40 flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-xl border p-4 text-center">
            <span className="bg-danger-soft text-danger grid h-12 w-12 place-items-center rounded-full"><Icon name="AlertTriangle" size={22} /></span>
            <p className="text-danger text-sm font-black">יצירת התמונה נכשלה</p>
            <p className="text-muted text-[11px]">נסה/י שוב — לחצ/י על כפתור היצירה מחדש למטה.</p>
          </div>
        ) : (
          <CreativePreview data={o.render_data} scale={0.8} backgroundImageUrl={o.image_url} concept={conceptFor(o.render_data, o.creative_strategy)} />
        )}
        {isFinalImage && (
          <span className="bg-success text-card absolute bottom-1.5 right-1.5 rounded-md px-1.5 py-0.5 text-[9px] font-black">✓ עבר QA{o.render_data?.qa?.creativeWow ? ` · WOW ${o.render_data.qa.creativeWow}` : ""}</span>
        )}
      </div>
      {fullAd && (
        <p className="bg-success-soft text-success rounded-lg px-2 py-1 text-[10px] font-bold">✓ עבר QA (טקסט/מספרים/לוגו/סוכן/RTL) + Creative QA (אימפקט, יוקרה, המרה, היררכיה). מומלץ לוודא פרטים לפני פרסום.</p>
      )}
      {ad && (
        <div className="flex flex-wrap items-center gap-1 px-0.5">
          {ad.isTopConcept && <span className="bg-ink text-card rounded-full px-1.5 py-0.5 text-[9px] font-black">★ קונספט מוביל</span>}
          {ad.wow && <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-black ${ad.wow.approved ? "bg-success text-card" : ad.wow.overall >= 85 ? "bg-brand-soft text-brand-strong" : "bg-warning-soft text-warning"}`}>WOW {ad.wow.overall}</span>}
          <span className="bg-brand-soft text-brand-strong rounded-full px-1.5 py-0.5 text-[9px] font-bold">{ad.designPlan?.familyLabel ?? ad.triggerLabel ?? ad.angleLabel}</span>
          {ad.artDirection?.emotionalTrigger && <span className="bg-surface text-muted rounded-full px-1.5 py-0.5 text-[9px] font-bold">{ad.artDirection.emotionalTrigger}</span>}
        </div>
      )}
      {ad?.wow && (
        <div className="text-muted flex flex-wrap gap-x-2 gap-y-0.5 px-0.5 text-[9px] font-bold">
          <span>יוקרה {ad.wow.luxury}</span><span>אמון {ad.wow.trust}</span><span>קריאות {ad.wow.readability}</span>
          <span>תשומת-לב {ad.wow.attention}</span><span>פרימיום {ad.wow.premiumFeel}</span><span>אימפקט {ad.wow.visualImpact}</span>
        </div>
      )}
      {/* Per-creative identity — proves the new engine produced this output */}
      {ad && (
        <p dir="ltr" className="text-muted px-0.5 font-mono text-[9px]">{ad.trigger} · {ad.designPlan?.family ?? "no-DEP"} · {ad.designPlan?.depId ?? "—"}</p>
      )}
      {ad && adWarnings.length > 0 && (
        <p className="bg-warning-soft text-warning rounded-lg px-2 py-1 text-[10px] font-bold">{adWarnings.join(" · ")}</p>
      )}
      {/* Source-asset transparency (RULE 10) */}
      <div className="flex flex-wrap gap-1 px-0.5">
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${hasPropertyImage ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{hasPropertyImage ? "✓ תמונת נכס אמיתית" : "חסרה תמונת נכס"}</span>
      </div>
      {!hasPropertyImage && (
        <p className="bg-danger-soft text-danger rounded-lg px-2 py-1 text-[10px] font-bold">יש להעלות תמונת נכס לפני יצירת מודעה.</p>
      )}
      {o.image_status === "no_provider" && !o.image_url && (
        <p className="bg-warning-soft text-warning rounded-lg px-2 py-1 text-[10px] font-bold">לא מוגדר ספק רקע AI. מוצגת מודעה עם רקע מותג נקי (הטקסט והנכס אמיתיים).</p>
      )}
      {o.image_status === "failed" && !o.image_url && o.image_error && (
        <p className="bg-danger-soft text-danger rounded-lg px-2 py-1 text-[9px] font-bold break-words" dir="ltr">{o.image_error}</p>
      )}
      {/* ZONO Creative Quality badges */}
      <div className="flex flex-wrap gap-1 px-0.5">
        {o.overall_quality_score > 0 && <span className="bg-ink text-card rounded-full px-1.5 py-0.5 text-[9px] font-black">ציון {o.overall_quality_score}</span>}
        {o.wow_score > 0 && <span className="bg-brand-soft text-brand-strong rounded-full px-1.5 py-0.5 text-[9px] font-black">WOW {o.wow_score}</span>}
        {o.quality_status === "passed" && <span className="bg-success-soft text-success rounded-full px-1.5 py-0.5 text-[9px] font-bold">✓ עבר בקרת איכות</span>}
        {o.creative_selection_metadata?.candidatesTotal ? <span className="bg-surface text-muted rounded-full px-1.5 py-0.5 text-[9px] font-bold">נבחר מתוך {o.creative_selection_metadata.candidatesTotal} גרסאות</span> : null}
        {o.property_primary_angle && <span className="bg-warning-soft text-warning rounded-full px-1.5 py-0.5 text-[9px] font-bold">זווית: {o.property_primary_angle}</span>}
      </div>
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
        {fullAd && o.image_url ? (
          <>
            <button onClick={() => setAdOnly(true)} className="text-brand-strong font-bold"><Icon name="Maximize2" size={12} /> מודעה בלבד</button>
            <a href={o.image_url} download={`zono-ad-${o.id}.png`} target="_blank" rel="noreferrer" className="text-brand-strong font-bold"><Icon name="Download" size={12} /> הורד תמונה</a>
          </>
        ) : ad ? (
          <>
            <button onClick={() => setAdOnly(true)} className="text-brand-strong font-bold"><Icon name="Maximize2" size={12} /> מודעה בלבד</button>
            <button onClick={() => void doExport()} disabled={exporting} className="text-brand-strong font-bold disabled:opacity-50"><Icon name="Download" size={12} /> {exporting ? "מייצא…" : "הורד PNG"}</button>
          </>
        ) : (
          <span className="text-muted/50 cursor-not-allowed" title="זמין במודעות סופיות">PNG</span>
        )}
      </div>
      {/* AD-ONLY JUDGING VIEW — the final creative alone, no card chrome. */}
      {adOnly && (ad || fullAd) && (
        <div onClick={() => setAdOnly(false)} className="fixed inset-0 z-[120] flex flex-col items-center justify-center gap-3 bg-black/80 p-4" role="dialog">
          <div className="w-full max-w-[540px]" onClick={(e) => e.stopPropagation()}>
            <CreativePreview data={o.render_data} scale={1.6} backgroundImageUrl={o.image_url} concept={conceptFor(o.render_data, o.creative_strategy)} />
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-bold text-white" dir="ltr">{fullAd ? "AI · " : ""}{ad?.trigger ?? "ad"} · {ad?.designPlan?.familyLabel ?? "OpenAI"}</span>
            <button onClick={() => setAdOnly(false)} className="rounded-full bg-white px-4 py-1.5 text-[12px] font-black text-black">סגור</button>
          </div>
        </div>
      )}
      {o.scroll_stop_reason && <p className="text-muted px-0.5 text-[10px]">⚡ {o.scroll_stop_reason}</p>}
      {o.internal_prompt && (
        <button
          type="button"
          onClick={() => { void navigator.clipboard?.writeText(o.internal_prompt ?? "").then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
          className="bg-brand-soft text-brand-strong inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold"
        >
          <Icon name={copied ? "Check" : "Copy"} size={12} />{copied ? "הועתק" : "העתק Prompt ל-AI"}
        </button>
      )}
      {ad && (
        <div className="border-line border-t pt-1.5">
          <button onClick={() => setShowDebug(!showDebug)} className="text-brand-strong inline-flex items-center gap-1 text-[10px] font-bold"><Icon name="Search" size={11} />{showDebug ? "הסתר בדיקת שכבות" : "🔍 בדיקת שכבות (Debug)"}</button>
          {showDebug && <CreativeDebugPanel ad={ad} o={o} />}
        </div>
      )}
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

// ── ISSUE 12: Creative generation observability — layer-by-layer inspector ────
// When a creative looks wrong, this shows exactly which layer produced what, so
// the failing layer is obvious. No black-box generation.
function DebugKV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-2 py-0.5"><span className="text-muted shrink-0">{k}</span><span className="text-ink min-w-0 break-words text-left font-bold" dir="auto">{v === null || v === undefined || v === "" ? "—" : v}</span></div>;
}
function CreativeDebugPanel({ ad, o }: { ad: FinalAdView; o: QuickOutput }) {
  const t = ad.trace; const adr = ad.artDirection; const sc = ad.scores;
  const yn = (b?: boolean) => (b ? "✓" : "✗");
  const section = (title: string, body: React.ReactNode) => (
    <div className="bg-surface rounded-lg p-2">
      <p className="text-brand-strong mb-1 text-[10px] font-black">{title}</p>
      <div className="text-[10px]">{body}</div>
    </div>
  );
  return (
    <div dir="rtl" className="mt-1.5 flex flex-col gap-1.5">
      {section("Property Snapshot", <>
        <DebugKV k="property_id" v={<span dir="ltr">{(o.property_id as string) ?? "—"}</span>} />
        <DebugKV k="סוג / עיר / שכונה" v={[t?.property.propertyType, t?.property.city, t?.property.neighborhood].filter(Boolean).join(" · ")} />
        <DebugKV k="כתובת" v={t?.property.address} />
        <DebugKV k="מחיר / חדרים / מ״ר / קומה" v={[t?.property.price, t?.property.rooms, t?.property.sizeSqm, t?.property.floor].filter((x) => x != null && x !== "").join(" · ")} />
        <DebugKV k="מדיה נבחרת" v={t?.property.mediaUrl ? <a href={t.property.mediaUrl} target="_blank" rel="noreferrer" className="text-brand-strong underline" dir="ltr">תמונה</a> : "—"} />
      </>)}
      {section("Brand Snapshot", <>
        <DebugKV k="סוכן / טלפון" v={[t?.brand.agentName, t?.brand.agentPhone].filter(Boolean).join(" · ")} />
        <DebugKV k="משרד" v={t?.brand.officeName} />
        <DebugKV k="לוגו / תמונת סוכן" v={`${yn(t?.brand.hasLogo)} לוגו · ${yn(t?.brand.hasAgentPhoto)} תמונה`} />
        <DebugKV k="צבעי מותג" v={(t?.brand.colors ?? []).join(", ") || "ברירת מחדל"} />
        <DebugKV k="luxury" v={t?.brand.luxury} />
      </>)}
      {ad.brandDNA && section("Brand DNA", <>
        <DebugKV k="אישיות מותג" v={`${ad.brandDNA.personalityLabel} (${ad.brandDNA.personality})`} />
        <DebugKV k="פלטה" v={`${ad.brandDNA.palette.primary} · ${ad.brandDNA.palette.accent} · ${ad.brandDNA.palette.mode} · ${ad.brandDNA.palette.source}`} />
        <DebugKV k="לוגו" v={ad.brandDNA.logoUsage.show ? `${ad.brandDNA.logoUsage.placement} · ${ad.brandDNA.logoUsage.size}` : "אין לוגו"} />
        <DebugKV k="תמונת סוכן" v={`${ad.brandDNA.agentImageUsage.show}${ad.brandGuidance ? ` · בקונספט זה: ${ad.brandGuidance.showAgentImage ? "מוצג" : "לא מוצג"}` : ""}`} />
        <DebugKV k="טיפוגרפיה" v={ad.brandDNA.typographyDirection} />
        <DebugKV k="צפיפות / יוקרה / CTA" v={`${ad.brandDNA.visualDensity} · ${ad.brandDNA.luxuryLevel} · ${ad.brandDNA.ctaTone}`} />
        <DebugKV k="אפקטים מותרים (קונספט)" v={(ad.brandGuidance?.allowedEffects ?? []).join(", ")} />
        <DebugKV k="מגבלות עיצוב" v={ad.brandDNA.designRestrictions.join(" · ")} />
        {ad.brandDNA.missingAssets.length ? <DebugKV k="נכסים חסרים" v={ad.brandDNA.missingAssets.join(" · ")} /> : <DebugKV k="נכסים" v="כל נכסי המותג קיימים ✓" />}
      </>)}
      {section("Creative Brief", <>
        <DebugKV k="קהל יעד" v={t?.brief.targetAudience} />
        <DebugKV k="ערך מרכזי" v={t?.brief.keyBenefit} />
        <DebugKV k="זווית שיווקית" v={t?.brief.marketingAngle} />
        <DebugKV k="טריגר רגשי" v={t?.brief.emotionalTrigger} />
        <DebugKV k="כותרת" v={ad.headline} />
        <DebugKV k="CTA" v={ad.cta} />
      </>)}
      {section("Marketing Concept", <>
        <DebugKV k="קונספט" v={`${t?.concept.name} (${t?.concept.trigger})`} />
        <DebugKV k="הבטחה מרכזית" v={t?.concept.mainPromise} />
        <DebugKV k="למה ממיר" v={t?.concept.whyConvert} />
      </>)}
      {section("Art Direction", <>
        <DebugKV k="composition / crop" v={`${adr?.composition} · ${adr?.imageCrop}`} />
        <DebugKV k="focal / hierarchy" v={`${adr?.focalPoint} · ${(adr?.hierarchy ?? []).join(" → ")}`} />
        <DebugKV k="מיקומים (מחיר/CTA/לוגו/סוכן)" v={[adr?.pricePlacement, adr?.ctaPlacement, adr?.logoPlacement, adr?.agentPlacement].filter(Boolean).join(" · ")} />
        <DebugKV k="color system / feel" v={`${adr?.colorSystem} · ${adr?.emotionalFeel}`} />
        <DebugKV k="AI סביבה" v={adr ? `${adr.aiEnvironment.atmosphere} · ${adr.aiEnvironment.lighting}` : "—"} />
      </>)}
      {ad.designPlan && section("Design Execution Plan (Renderer executes this)", <>
        <DebugKV k="design family" v={`${ad.designPlan.familyLabel} (${ad.designPlan.family})`} />
        <DebugKV k="layout" v={ad.designPlan.layoutStructure} />
        <DebugKV k="דומיננטיות" v={`מחיר ${ad.designPlan.flags.priceDominant ? "✓" : "✗"} · תמונה ${ad.designPlan.flags.propertyImageDominant ? "✓" : "✗"}`} />
        <DebugKV k="סוכן / לוגו" v={`סוכן ${ad.designPlan.flags.agentShown ? (ad.designPlan.flags.agentPhotoShown ? "תמונה" : "אינישלים") : "לא מוצג"} · לוגו ${ad.designPlan.flags.logoShown ? "✓" : "✗"}`} />
        <DebugKV k="type scale (H/price/cta)" v={`${ad.designPlan.typography.headline} / ${ad.designPlan.typography.price} / ${ad.designPlan.typography.cta}`} />
        <DebugKV k="background" v={`${ad.designPlan.backgroundTreatment.mode} · ${ad.designPlan.backgroundTreatment.scrim}`} />
        <DebugKV k="effects" v={ad.designPlan.effects.join(", ")} />
        <DebugKV k="zones מבוצעים" v={Object.entries(ad.designPlan.zones).filter(([, z]) => (z as { shown: boolean }).shown).map(([n]) => n).join(", ")} />
        <DebugKV k="not-a-card" v={ad.designPlan.notCardProof.reasons.join(" · ")} />
      </>)}
      {ad.designPlan?.layout && section("Layout Integrity (QA gate)", <>
        <DebugKV k="status" v={ad.designPlan.layout.approved ? "✓ עבר — ללא חפיפות, בתוך השוליים, מחיר לא חתוך" : "✗ נכשל"} />
        {ad.designPlan.layout.violations.length > 0 && <DebugKV k="הפרות" v={ad.designPlan.layout.violations.map((v) => v.detail).join(" · ")} />}
        {ad.designPlan.layout.fixes.length > 0 && <DebugKV k="תיקונים אוטומטיים" v={ad.designPlan.layout.fixes.join(" · ")} />}
      </>)}
      {ad.wow && section("WOW Score (6 axes · gate ≥95)", <>
        <DebugKV k="overall" v={`${ad.wow.overall} ${ad.wow.approved ? "✓ אושר" : "✗ נדרש שיפור"}${ad.isTopConcept ? " · ★ מוביל" : ""}`} />
        <DebugKV k="יוקרה / אמון / קריאות" v={`${ad.wow.luxury} · ${ad.wow.trust} · ${ad.wow.readability}`} />
        <DebugKV k="תשומת-לב / פרימיום / אימפקט" v={`${ad.wow.attention} · ${ad.wow.premiumFeel} · ${ad.wow.visualImpact}`} />
        {ad.wow.weakest && <DebugKV k="הציר החלש" v={`${ad.wow.weakest.axis} (${ad.wow.weakest.score})`} />}
        {ad.wowCandidates && ad.wowCandidates.length > 1 && <DebugKV k="תבניות שנבחנו" v={ad.wowCandidates.map((c) => `${c.familyLabel}=${c.overall}`).join(" · ")} />}
        {ad.wow.critique && <>
          <DebugKV k="Creative Director" v={ad.wow.critique.director} />
          <DebugKV k="Art Director" v={ad.wow.critique.artDirector} />
          <DebugKV k="Marketing" v={ad.wow.critique.marketing} />
          <DebugKV k="Conversion" v={ad.wow.critique.conversion} />
        </>}
      </>)}
      {section("Final Prompt (AI environment — text-free)", <p dir="ltr" className="text-muted whitespace-pre-wrap break-words">{t?.finalPrompt ?? adr?.aiEnvironment.imageModelPrompt ?? "—"}</p>)}
      {section("Creative Production Engine (AI scene)", <>
        <DebugKV k="scene status" v={ad.sceneStatus ?? "— (deterministic / no provider)"} />
        <DebugKV k="scene mode" v={ad.sceneMode ?? "—"} />
        <DebugKV k="scene URL" v={ad.sceneUrl ? <a dir="ltr" href={ad.sceneUrl} target="_blank" rel="noreferrer" className="text-brand-strong break-all underline">{ad.sceneUrl}</a> : "—"} />
        <DebugKV k="composite" v={ad.sceneStatus === "ai_hero" ? "AI scene = hero · locked logo/agent/Hebrew overlaid" : ad.sceneUrl ? "AI scene background · locked photo + logo/agent/Hebrew overlaid" : "deterministic renderer (no AI scene)"} />
      </>)}
      {section("Validation & Run", <>
        <DebugKV k="readiness" v={sc?.finalPostReadiness} />
        <DebugKV k="asset / hebrew / rtl" v={sc ? `${sc.assetAuthenticity} · ${sc.hebrewAccuracy} · ${sc.rtlCorrectness}` : "—"} />
        <DebugKV k="hierarchy / conversion / brand" v={sc ? `${sc.visualHierarchy} · ${sc.conversionStrength} · ${sc.brandConsistency}` : "—"} />
        {sc?.warnings?.length ? <DebugKV k="אזהרות" v={sc.warnings.join(" · ")} /> : null}
        {sc?.blockers?.length ? <DebugKV k="חוסמים" v={sc.blockers.join(" · ")} /> : null}
        <DebugKV k="זמן הפקה" v={t?.generationMs != null ? `${t.generationMs}ms` : "—"} />
        <DebugKV k="ספק חשיבה (AI)" v={t?.thinkingProvider ?? "—"} />
        <DebugKV k="נכסים בשימוש" v={`${yn(Boolean(t?.selectedAssets.propertyImage))} תמונה · ${yn(Boolean(t?.selectedAssets.logoUrl))} לוגו · ${yn(Boolean(t?.selectedAssets.agentPhoto))} סוכן · ${yn(Boolean(t?.selectedAssets.agentPhone))} טלפון`} />
      </>)}
    </div>
  );
}

/** Upload an image from the computer (no URL pasting) — uploads to storage and
 *  returns the public URL via onChange (#P2-6). Also accepts a pasted URL. */
function ImageUploadField({ label, value, orgId, userId, et, eid, onChange }: { label: string; value: string; orgId: string; userId: string; et: string; eid: string; onChange: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const upload = async (file: File | null) => {
    if (!file) return;
    setBusy(true); setErr(null);
    try {
      const row = await uploadMarketingAsset(file, { orgId, entityType: et, entityId: eid, uploadedBy: userId, assetType: "property_photo", title: file.name, flags: { is_property_photo: true } });
      onChange((row as { file_url: string }).file_url);
    } catch (e) { setErr(e instanceof Error ? e.message : "ההעלאה נכשלה"); }
    finally { setBusy(false); }
  };
  const [drag, setDrag] = useState(false);
  const inputId = `imgup-${label}`;
  if (value && !busy) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-muted text-[11px] font-bold">{label}</span>
        <div className="border-line bg-surface flex items-center gap-3 rounded-xl border p-2">
          <img src={value} alt="" className="border-line h-14 w-14 rounded-lg border object-cover" />
          <span className="text-success flex-1 text-[12px] font-bold">תמונה הועלתה ✓</span>
          <button type="button" onClick={() => onChange("")} className="text-muted hover:text-danger text-[12px] font-bold"><Icon name="Trash2" size={14} /> הסר</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted text-[11px] font-bold">{label}</span>
      <label
        htmlFor={inputId}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void upload(e.dataTransfer.files?.[0] ?? null); }}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center transition ${drag ? "border-brand bg-brand-soft" : "border-line bg-surface hover:border-brand-light"}`}
      >
        {busy ? (
          <><Icon name="Loader" size={20} className="text-brand animate-spin" /><span className="text-muted text-xs">מעלה…</span></>
        ) : (
          <>
            <span className="bg-brand-soft text-brand grid h-9 w-9 place-items-center rounded-xl"><Icon name="Upload" size={18} /></span>
            <span className="text-ink text-sm font-bold">העלה תמונה מהמחשב</span>
            <span className="text-muted text-[11px]">או גרור קובץ לכאן · JPG / PNG / WEBP</span>
          </>
        )}
        <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy} onChange={(e) => upload(e.target.files?.[0] ?? null)} />
      </label>
      {err && <span className="text-danger text-[11px]">{err}</span>}
    </div>
  );
}

function QuickCreativeWizard({ type, et, eid, orgId, userId, prefill, onClose }: { type: string; et: string; eid: string; orgId: string; userId: string; prefill?: Record<string, string | boolean | number>; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [format, setFormat] = useState("feed_4_5");
  const [improve, setImprove] = useState(false);
  // Prefill from the launching property (#P3-4) so the agent doesn't retype.
  const [f, setF] = useState<Record<string, string | boolean | number>>(() => ({ ...(prefill ?? {}) }));
  const [brand, setBrand] = useState<{ warnings?: string[]; agentName?: string | null; officeName?: string | null; colors?: string[]; agentPhoto?: string | null; officeLogo?: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [finalAds, setFinalAds] = useState<FinalAdPreview[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: string | boolean | number) => setF((p) => ({ ...p, [k]: v }));
  const str = (k: string) => (typeof f[k] === "string" ? (f[k] as string) : "");

  const loadBrand = async () => { const b = await brandPreviewAction({ entityType: et, entityId: eid }); setBrand(b); };
  const goStep3 = () => { setStep(3); loadBrand(); };

  const requiredOk = type === "testimonial_post" ? (str("testimonialText") && str("recommenderName") && str("address"))
    : type === "sold_post" ? !!str("address")
    : (str("address") && str("importantText"));

  const submit = async () => {
    // RULE 1/5: real property image required for a property ad — never invent one.
    if (type === "property_ad_post" && !str("propertyImage")) { setErr("יש להעלות תמונת נכס לפני יצירת מודעה."); setStep(3); return; }
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
    // Pull the just-generated outputs so the modal's final cards show the REAL
    // produced ads (image when available; labeled "ready" tile otherwise) instead
    // of empty boxes. Best-effort — never blocks completion.
    try {
      const { outputs } = await listQuickOutputsAction({ entityType: et, entityId: eid });
      const mine = outputs
        .filter((o) => (o as { output_type?: string }).output_type === type)
        .slice(0, 2)
        .map((o) => ({
          imageUrl: ((o as { image_url?: string | null }).image_url) ?? null,
          label: ((o as { variant_name?: string }).variant_name) ?? "מודעה סופית",
          failed: (o as { image_status?: string }).image_status === "failed" || (o as { quality_status?: string }).quality_status === "failed",
        }));
      setFinalAds(mine);
    } catch { /* non-critical */ }
    // We NEVER fake completion — `done` only flips after the real backend response.
    setBusy(false); setDone(true);
  };

  const Field = (k: string, label: string, ph?: string) => (
    <label key={k} className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">{label}</span>
      <input defaultValue={str(k)} onChange={(e) => set(k, e.target.value)} placeholder={ph} className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm" /></label>
  );
  const Area = (k: string, label: string, ph?: string) => (
    <label key={k} className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">{label}</span>
      <textarea defaultValue={str(k)} onChange={(e) => set(k, e.target.value)} placeholder={ph} rows={3} className="border-line bg-surface text-ink rounded-lg border px-3 py-2 text-sm" /></label>
  );
  const ImageField = (k: string, label: string) => (
    <ImageUploadField key={k} label={label} value={str(k)} orgId={orgId} userId={userId} et={et} eid={eid} onChange={(url) => set(k, url)} />
  );
  const Check = (k: string, label: string) => (
    <label key={k} className="text-ink flex items-center gap-1.5 text-[12px]"><input type="checkbox" checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} />{label}</label>
  );

  // While generating (and until the user clicks "view results"), show the premium
  // ZONO Creative Engine waiting experience instead of the form. Generation logic
  // is untouched — `busy` = running, `done` = real backend response received.
  if (busy || done) {
    return <CreativeGenerationModal complete={done} finalAds={finalAds} onView={() => { onClose(); router.refresh(); }} />;
  }

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
            {ImageField("propertyImage", "תמונת דירה (העלאה מהמחשב, אופציונלי)")}
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
            <p className="text-ink text-sm">ZONO ייצר מנוע איכות מלא ויציג רק את 4 הגרסאות החזקות ביותר.</p>
            {busy ? (
              <div className="bg-surface flex flex-col gap-1.5 rounded-xl p-3">
                {["מנתח את הנכס…", "מושך השראות מהמערכת…", "מייצר מועמדים…", "בודק איכות…", "משפר תוצאות…", "מציג את 4 הגרסאות הטובות ביותר"].map((s, i) => (
                  <div key={s} className="flex items-center gap-2 text-[12px] font-bold text-ink">
                    <span className="bg-brand-soft text-brand-strong grid h-5 w-5 place-items-center rounded-full text-[10px] font-black">{i + 1}</span>{s}
                  </div>
                ))}
              </div>
            ) : null}
            {err && <p className="text-danger text-[12px]">{err}</p>}
            <div className="flex gap-2"><Button size="sm" loading={busy} onClick={submit}><Icon name="Sparkles" size={14} />צור עם בקרת איכות</Button><Button size="sm" variant="ghost" onClick={() => setStep(3)}>חזרה</Button></div>
            <p className="text-muted text-[11px]">המערכת מייצרת 16 מועמדים פנימיים, מדרגת אותם בקפדנות ומציגה רק את הטובים ביותר.</p>
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
