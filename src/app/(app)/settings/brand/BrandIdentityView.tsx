"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { saveBrandProfileAction, saveBrandColorsAction, saveBrandAssetAction } from "@/lib/brand-identity/actions";
import { uploadBrandFile } from "@/lib/brand-identity/upload";
import { extractColorsFromFile, type ExtractedColors } from "@/lib/brand-identity/color-extraction";
import { BRAND_STYLES, BRAND_TONES, POST_STYLES, VISIBILITY, computeCompletion } from "@/lib/brand-identity/engine";
import type { BrandStudio } from "@/lib/brand-identity/service";

type P = Record<string, unknown>;
const ASSET_KINDS: { kind: string; label: string }[] = [
  { kind: "secondary_logo", label: "לוגו משני" }, { kind: "watermark", label: "סימן מים" }, { kind: "signature_image", label: "תמונת חתימה" },
  { kind: "agent_signature", label: "חתימת סוכן" }, { kind: "office_stamp", label: "חותמת משרד" }, { kind: "cover_image", label: "תמונת כיסוי" }, { kind: "office_image", label: "תמונת משרד" },
];

export function BrandIdentityView({ studio, orgId }: { studio: BrandStudio; orgId: string; userId?: string }) {
  const router = useRouter();
  const r = useActionRunner();
  const p = (studio.profile ?? {}) as P;
  const str = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  const et = studio.entityType, eid = studio.entityId;
  const wrap = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, id: string, pending?: string) =>
    r.run(async () => { const res = await fn(); if (res.error) throw new Error(res.error); return res; }, { id, pendingMessage: pending, success: (x) => x.message ?? null });

  // Part 1 profile fields
  const [fullName, setFullName] = useState(str("full_name"));
  const [displayName, setDisplayName] = useState(str("display_name"));
  const [title, setTitle] = useState(str("title"));
  const [bio, setBio] = useState(str("short_bio"));
  const [phone, setPhone] = useState(str("phone"));
  const [whatsapp, setWhatsapp] = useState(str("whatsapp"));
  const [email, setEmail] = useState(str("email"));
  const [officeName, setOfficeName] = useState(str("office_name"));
  const [years, setYears] = useState(p.years_experience != null ? String(p.years_experience) : "");
  const [visibility, setVisibility] = useState(str("profile_visibility") || "public");
  const arrStr = (k: string) => (Array.isArray(p[k]) ? (p[k] as string[]).join(", ") : "");
  const [serviceAreas, setServiceAreas] = useState(arrStr("service_areas"));
  const [specialties, setSpecialties] = useState(arrStr("specialties"));
  const [languages, setLanguages] = useState(arrStr("languages"));

  // colors
  const [colors, setColors] = useState<ExtractedColors | null>(p.brand_primary ? { primary: str("brand_primary"), secondary: str("brand_secondary"), accent: str("brand_accent"), palette: Array.isArray(p.brand_palette) ? p.brand_palette as string[] : [], confidence: (p.color_confidence_score as number) ?? 0 } : null);
  const [extracting, setExtracting] = useState(false);

  // images
  const [profileImg, setProfileImg] = useState(str("profile_image_url"));
  const [logo, setLogo] = useState(str("logo_url"));

  // style/tone + content profile
  const [style, setStyle] = useState(str("brand_style"));
  const [tone, setTone] = useState(str("brand_tone"));
  const [writingStyle, setWritingStyle] = useState(str("writing_style"));
  const [commTone, setCommTone] = useState(str("communication_tone"));
  const [personality, setPersonality] = useState(str("brand_personality"));
  const [audience, setAudience] = useState(str("target_audience"));
  const [ctaStyle, setCtaStyle] = useState(str("preferred_cta_style"));
  const [designLang, setDesignLang] = useState(str("preferred_design_language"));
  const [postStyle, setPostStyle] = useState(str("preferred_post_style"));

  // inheritance
  const [inherit, setInherit] = useState(p.inherit_brand_settings !== false);

  const completion = computeCompletion({ full_name: fullName, phone, logo_url: logo, brand_primary: colors?.primary ?? null, profile_image_url: profileImg, brand_style: style });

  const saveProfile = () => wrap(() => saveBrandProfileAction({
    entityType: et, entityId: eid, full_name: fullName, display_name: displayName, title, short_bio: bio, phone, whatsapp, email, office_name: officeName,
    years_experience: years ? Number(years) : undefined, profile_visibility: visibility,
    service_areas: serviceAreas.split(",").map((s) => s.trim()).filter(Boolean), specialties: specialties.split(",").map((s) => s.trim()).filter(Boolean), languages: languages.split(",").map((s) => s.trim()).filter(Boolean),
    brand_style: style, brand_tone: tone, writing_style: writingStyle, communication_tone: commTone, brand_personality: personality, target_audience: audience,
    preferred_cta_style: ctaStyle, preferred_design_language: designLang, preferred_post_style: postStyle, inherit_brand_settings: inherit,
  }), "save", "שומר פרופיל מותג...");

  const onProfileImage = async (file: File) => {
    try { const { url } = await uploadBrandFile(file, { orgId, entityType: et, entityId: eid, kind: "profile_image" }); setProfileImg(url); await wrap(() => saveBrandProfileAction({ entityType: et, entityId: eid, profile_image_url: url, profile_image_thumb: url, profile_image_status: "active" }), "pimg"); }
    catch (e) { alert(e instanceof Error ? e.message : "ההעלאה נכשלה"); }
  };
  const onLogo = async (file: File) => {
    setExtracting(true);
    try {
      const { url } = await uploadBrandFile(file, { orgId, entityType: et, entityId: eid, kind: "office_logo" });
      setLogo(url);
      await saveBrandProfileAction({ entityType: et, entityId: eid, logo_url: url, logo_type: file.type, logo_status: "active" });
      if (file.type !== "image/svg+xml") { const ex = await extractColorsFromFile(file); setColors(ex); }
      router.refresh();
    } catch (e) { alert(e instanceof Error ? e.message : "ההעלאה נכשלה"); }
    finally { setExtracting(false); }
  };
  const approveColors = () => { if (!colors) return; wrap(() => saveBrandColorsAction({ entityType: et, entityId: eid, primary: colors.primary, secondary: colors.secondary, accent: colors.accent, palette: colors.palette, confidence: colors.confidence, source: logo ? "extracted" : "manual" }), "colors", "שומר צבעים..."); };
  const setColor = (key: "primary" | "secondary" | "accent", v: string) => setColors((c) => ({ primary: c?.primary ?? "", secondary: c?.secondary ?? "", accent: c?.accent ?? "", palette: c?.palette ?? [], confidence: c?.confidence ?? 0, [key]: v }));
  const onAsset = async (file: File, kind: string) => {
    try { const { url, path } = await uploadBrandFile(file, { orgId, entityType: et, entityId: eid, kind }); await wrap(() => saveBrandAssetAction({ entityType: et, entityId: eid, assetKind: kind, url, storagePath: path }), `asset-${kind}`); }
    catch (e) { alert(e instanceof Error ? e.message : "ההעלאה נכשלה"); }
  };

  const pal = colors?.palette ?? [];
  const cPrimary = colors?.primary || "#5B21B6";
  const cAccent = colors?.accent || "#FBBF24";

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-brand text-xs font-bold">Settings → Brand & Identity</p>
          <h1 className="text-ink mt-1 text-2xl font-black">מותג וזהות</h1>
          <p className="text-muted mt-1 text-sm">מקור האמת היחיד למיתוג שלך — נצרך אוטומטית ע״י כל מחוללי העיצוב, האתרים, הפורטלים, הפוסטים, ה-WhatsApp וה-PDF.</p>
        </div>
        <div className="bg-card border-line flex items-center gap-3 rounded-2xl border p-3 shadow-sm">
          <div className="relative h-12 w-12">
            <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-surface, #eee)" strokeWidth="4" /><circle cx="18" cy="18" r="15" fill="none" stroke="currentColor" strokeWidth="4" className="text-brand" strokeDasharray={`${completion.score * 0.94} 100`} strokeLinecap="round" /></svg>
            <span className="text-ink absolute inset-0 grid place-items-center text-[11px] font-black">{completion.score}%</span>
          </div>
          <div className="text-[11px]"><p className="text-ink font-bold">השלמת מותג</p><p className="text-muted">פרופיל · לוגו · צבעים · תמונה · סגנון</p></div>
        </div>
      </header>

      <ActionFeedback runner={r} />

      {/* PART 1 — PROFILE */}
      <Section title="פרטי סוכן">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <In label="שם מלא" v={fullName} on={setFullName} /><In label="שם תצוגה" v={displayName} on={setDisplayName} />
          <In label="תפקיד" v={title} on={setTitle} /><In label="שם משרד" v={officeName} on={setOfficeName} />
          <In label="טלפון" v={phone} on={setPhone} /><In label="וואטסאפ" v={whatsapp} on={setWhatsapp} />
          <In label="אימייל" v={email} on={setEmail} /><In label="שנות ניסיון" v={years} on={setYears} />
          <In label="אזורי שירות (פסיקים)" v={serviceAreas} on={setServiceAreas} /><In label="התמחויות (פסיקים)" v={specialties} on={setSpecialties} />
          <In label="שפות (פסיקים)" v={languages} on={setLanguages} />
          <Sel label="נראות פרופיל" v={visibility} on={setVisibility} opts={VISIBILITY} />
        </div>
        <Area label="ביו קצר" v={bio} on={setBio} />
      </Section>

      {/* PART 2 + 3 — IMAGE + LOGO */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Section title="תמונת פרופיל מקצועית">
          <div className="flex items-center gap-3">
            {profileImg ? <img src={profileImg} alt="" className="border-line h-20 w-20 rounded-full border object-cover" /> : <div className="bg-surface text-muted grid h-20 w-20 place-items-center rounded-full"><Icon name="UserCheck" size={26} /></div>}
            <label className="cursor-pointer"><span className="bg-brand text-white inline-block rounded-lg px-3 py-1.5 text-sm font-bold">העלה תמונה</span><input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onProfileImage(e.target.files[0])} /></label>
          </div>
        </Section>
        <Section title="לוגו משרד">
          <div className="flex items-center gap-3">
            {logo ? <img src={logo} alt="" className="border-line bg-surface h-20 w-20 rounded-xl border object-contain p-1" /> : <div className="bg-surface text-muted grid h-20 w-20 place-items-center rounded-xl"><Icon name="Building2" size={26} /></div>}
            <label className="cursor-pointer"><span className="bg-brand text-white inline-block rounded-lg px-3 py-1.5 text-sm font-bold">{extracting ? "מנתח צבעים..." : "העלה לוגו"}</span><input type="file" accept=".png,.jpg,.jpeg,.webp,.svg" className="hidden" onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} /></label>
          </div>
          <p className="text-muted text-[11px]">PNG / SVG / JPG / WEBP · לאחר העלאה הצבעים מופקים אוטומטית.</p>
        </Section>
      </div>

      {/* PART 4 — BRAND COLORS */}
      <Section title="אינטליגנציית צבעי מותג">
        {colors ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              {(["primary", "secondary", "accent"] as const).map((k) => (
                <label key={k} className="flex flex-col items-center gap-1">
                  <input type="color" value={colors[k] || "#000000"} onChange={(e) => setColor(k, e.target.value.toUpperCase())} className="h-12 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
                  <span className="text-muted text-[10px] font-bold">{k === "primary" ? "ראשי" : k === "secondary" ? "משני" : "מבטא"}</span>
                  <span className="text-muted text-[9px]">{colors[k]}</span>
                </label>
              ))}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${colors.confidence >= 60 ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>ביטחון {colors.confidence}%</span>
            </div>
            {pal.length > 0 && <div className="flex flex-wrap gap-1.5">{pal.map((c, i) => <span key={i} className="border-line h-6 w-6 rounded-full border" style={{ background: c }} />)}</div>}
            <Button size="sm" className="w-fit" loading={r.busyId === "colors"} onClick={approveColors}><Icon name="UserCheck" size={14} />אשר צבעים</Button>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-muted text-[12px]">אין לוגו עדיין — בחר צבעים ידנית (עד 3).</p>
            <Button size="sm" variant="secondary" className="w-fit" onClick={() => setColors({ primary: "#5B21B6", secondary: "#7C3AED", accent: "#FBBF24", palette: [], confidence: 0 })}>בחירת צבעים ידנית</Button>
          </div>
        )}
      </Section>

      {/* PART 5 — BRAND PREVIEW */}
      <Section title="תצוגת מותג חיה">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[["אתר", "Map"], ["פורטל", "Eye"], ["פוסט נכס", "Building2"], ["חבילת המלצות", "Sparkles"], ["פוסט סושיאל", "MessageCircle"], ["כרטיס וואטסאפ", "MessageCircle"], ["דוח PDF", "Presentation"], ["מצגת", "Presentation"]].map(([label, icon]) => (
            <div key={label} className="overflow-hidden rounded-xl border" style={{ borderColor: cPrimary + "33" }}>
              <div className="flex items-center gap-1 p-2 text-white" style={{ background: cPrimary }}>{logo ? <img src={logo} alt="" className="h-4 w-4 object-contain" /> : <Icon name={icon} size={12} className="text-white" />}<span className="truncate text-[10px] font-bold">{officeName || fullName || "ZONO"}</span></div>
              <div className="bg-card p-2"><p className="text-ink truncate text-[11px] font-black">{label}</p><div className="mt-1 h-1.5 w-2/3 rounded-full" style={{ background: cAccent }} /></div>
            </div>
          ))}
        </div>
      </Section>

      {/* PART 6 + 9 — STYLE / TONE / CONTENT */}
      <Section title="סגנון וטון מותג">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Sel label="סגנון מותג" v={style} on={setStyle} opts={BRAND_STYLES} />
          <Sel label="טון מותג" v={tone} on={setTone} opts={BRAND_TONES} />
          <In label="סגנון כתיבה" v={writingStyle} on={setWritingStyle} /><In label="טון תקשורת" v={commTone} on={setCommTone} />
          <In label="אישיות מותג" v={personality} on={setPersonality} /><In label="קהל יעד" v={audience} on={setAudience} />
          <In label="סגנון CTA מועדף" v={ctaStyle} on={setCtaStyle} /><In label="שפת עיצוב מועדפת" v={designLang} on={setDesignLang} />
          <Sel label="סגנון פוסט מועדף" v={postStyle} on={setPostStyle} opts={POST_STYLES} />
        </div>
      </Section>

      {/* PART 7 — BRAND ASSETS */}
      <Section title="נכסי מותג">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ASSET_KINDS.map((a) => (
            <label key={a.kind} className="border-line bg-surface flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed p-3 text-center">
              <Icon name="Plus" size={16} className="text-muted" /><span className="text-ink text-[11px] font-bold">{a.label}</span>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onAsset(e.target.files[0], a.kind)} />
            </label>
          ))}
        </div>
        {studio.assets.length > 0 && <div className="flex flex-wrap gap-2">{studio.assets.map((as) => <img key={as.id as string} src={as.url as string} alt="" className="border-line bg-surface h-14 w-14 rounded-lg border object-contain p-1" />)}</div>}
      </Section>

      {/* PART 11 — OFFICE OVERRIDE / INHERITANCE */}
      <Section title="ירושת מותג מהמשרד">
        <label className="text-ink flex items-center gap-2 text-sm"><input type="checkbox" checked={inherit} onChange={(e) => setInherit(e.target.checked)} />ירש את מיתוג המשרד כברירת מחדל</label>
        {studio.isManager && <p className="text-muted text-[12px]">כמנהל, ההגדרות שתשמור ברמת המשרד יורשו אוטומטית ע״י הסוכנים (אלא אם תאפשר override).</p>}
      </Section>

      <div className="flex flex-wrap gap-2">
        <Button loading={r.busyId === "save"} onClick={saveProfile}><Icon name="UserCheck" size={16} />שמור פרופיל מותג</Button>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-4 shadow-sm"><h2 className="text-ink text-sm font-black">{title}</h2>{children}</section>;
}
function In({ label, v, on }: { label: string; v: string; on: (s: string) => void }) {
  return <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">{label}</span><input value={v} onChange={(e) => on(e.target.value)} className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm" /></label>;
}
function Area({ label, v, on }: { label: string; v: string; on: (s: string) => void }) {
  return <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">{label}</span><textarea value={v} onChange={(e) => on(e.target.value)} rows={2} className="border-line bg-surface text-ink rounded-lg border px-3 py-2 text-sm" /></label>;
}
function Sel({ label, v, on, opts }: { label: string; v: string; on: (s: string) => void; opts: { key: string; label: string }[] }) {
  return <label className="flex flex-col gap-1"><span className="text-muted text-[11px] font-bold">{label}</span><select value={v} onChange={(e) => on(e.target.value)} className="border-line bg-surface text-ink h-9 rounded-lg border px-2 text-sm"><option value="">—</option>{opts.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select></label>;
}
