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
  ENTITY_LABELS, ASSET_TYPE_LABELS, LIBRARY_FILTERS, assetBadges, DNA_SCORES, FEEDBACK_BUTTONS, type AssetLike,
} from "@/lib/creative-studio/engine";
import type { CreativeStudio } from "@/lib/creative-studio/service";

type Asset = Record<string, unknown> & AssetLike & { id: string; title: string | null; file_url: string; thumbnail_url: string | null; file_mime_type: string | null; created_at: string; tags: string[] };
type Dna = Record<string, unknown>;
type Runner = ReturnType<typeof useActionRunner>;
type Wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) => void;

export function CreativeStudioView({ studio, orgId, userId }: { studio: CreativeStudio; orgId: string; userId: string }) {
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
