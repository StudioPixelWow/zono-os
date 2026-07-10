"use client";
// ============================================================================
// 👤 ZONO — Agent Personal Area / Profile Studio. A premium brand control center
// over the EXISTING agent_websites row (single source of truth). Tabs for
// identity, branding, expertise, testimonials, experience, contact, social, the
// agent site, and privacy. Photo/cover/office-logo upload (reuses uploadBrandFile),
// completion score, live public preview, sticky save. Changes flow to the
// generated Agent Website automatically. RTL, mobile, permission-aware.
// ============================================================================
/* eslint-disable @next/next/no-img-element -- profile/cover/logo are external CDN urls */
import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Spinner } from "@/components/ui/Button";
import { saveMyProfileAction } from "@/lib/my-profile/actions";
import { publishAgentWebsiteAction, unpublishAgentWebsiteAction } from "@/lib/agent-website/actions";
import { updateOfficeWebsiteAction } from "@/lib/office-website/actions";
import { uploadBrandFile } from "@/lib/brand-identity/upload";
import type { MyProfile, ProfileTestimonial } from "@/lib/my-profile/service";

type Tab = "identity" | "branding" | "expertise" | "testimonials" | "experience" | "contact" | "social" | "site" | "privacy";
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "identity", label: "פרטים אישיים", icon: "UserCircle" }, { key: "branding", label: "מיתוג ותמונות", icon: "Image" },
  { key: "expertise", label: "אזורי התמחות", icon: "MapPin" }, { key: "testimonials", label: "המלצות", icon: "MessageCircle" },
  { key: "experience", label: "ניסיון והישגים", icon: "Award" }, { key: "contact", label: "פרטי קשר", icon: "Phone" },
  { key: "social", label: "רשתות חברתיות", icon: "Globe" }, { key: "site", label: "אתר הסוכן", icon: "Building2" },
  { key: "privacy", label: "פרטיות וחשיפה", icon: "Lock" },
];
const SOCIAL_KEYS: { key: string; label: string }[] = [
  { key: "facebook", label: "Facebook" }, { key: "instagram", label: "Instagram" }, { key: "linkedin", label: "LinkedIn" },
  { key: "youtube", label: "YouTube" }, { key: "tiktok", label: "TikTok" }, { key: "x", label: "X / Twitter" }, { key: "website", label: "אתר אישי" },
];
const THEMES = ["luxury-light", "modern-clean", "dark-prestige", "warm-boutique", "minimal-mono"];
const SITE_SECTIONS: { key: string; label: string }[] = [
  { key: "featured", label: "נכסים מובילים" }, { key: "areas", label: "אזורי פעילות" },
  { key: "about", label: "אודות" }, { key: "testimonials", label: "המלצות" }, { key: "contact", label: "יצירת קשר" },
];

const inputCls = "bg-surface border-line focus:border-brand w-full rounded-xl border px-3 py-2.5 text-sm outline-none";

export function MyProfileView({ profile }: { profile: MyProfile | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("identity");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // editable form state (clone of the profile row)
  const [f, setF] = useState(() => profile);
  const p = f;

  if (!profile || !p) {
    return <div dir="rtl" className="mx-auto max-w-md p-16 text-center"><p className="text-muted">האזור האישי אינו זמין. התחבר מחדש ונסה שוב.</p></div>;
  }

  const set = <K extends keyof MyProfile>(key: K, value: MyProfile[K]) => setF((s) => (s ? { ...s, [key]: value } : s));

  const save = () => {
    setErr(null); setSaved(false);
    start(async () => {
      const r = await saveMyProfileAction({
        patch: {
          display_name: p.displayName, title_hebrew: p.title, headline_hebrew: p.headline, bio_hebrew: p.bio,
          years_experience: p.yearsExperience, languages: p.languages, specialties: p.specialties, service_areas: p.serviceAreas,
          phone: p.phone, whatsapp: p.whatsapp, email: p.email,
          profile_image_url: p.profileImageUrl, cover_image_url: p.coverImageUrl,
          social_links: p.social, testimonials: p.testimonials, enabled_sections: p.enabledSections,
        },
        user: { fullName: p.displayName, title: p.title || null, avatarUrl: p.profileImageUrl },
        ...(p.themePreset ? { themePreset: p.themePreset } : {}),
        achievements: p.achievements,
      });
      if (r.ok) { setSaved(true); router.refresh(); setTimeout(() => setSaved(false), 2500); }
      else setErr(r.error ?? "השמירה נכשלה.");
    });
  };

  const doPublish = (publish: boolean) => start(async () => {
    const r = publish ? await publishAgentWebsiteAction() : await unpublishAgentWebsiteAction();
    if (r.ok) { set("status", publish ? "published" : "disabled"); router.refresh(); } else setErr(r.error ?? "הפעולה נכשלה.");
  });

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-[1200px] flex-col gap-4 pb-24">
      {/* Header */}
      <section className="relative overflow-hidden rounded-[24px] border border-white/50 bg-[linear-gradient(120deg,#f6f2ff,#efe9ff_55%,#f8f6ff)] p-5 shadow-[var(--shadow-card)] sm:p-6">
        <div className="pointer-events-none absolute -left-16 -top-20 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(124,58,237,0.22),transparent_70%)] blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="from-brand to-brand-light grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br p-[2px]">
              <div className="bg-card grid h-full w-full place-items-center overflow-hidden rounded-2xl">
                {p.profileImageUrl ? <img src={p.profileImageUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-brand text-xl font-black">{p.displayName.charAt(0)}</span>}
              </div>
            </div>
            <div className="min-w-0">
              <h1 className="text-ink truncate text-2xl font-black">{p.displayName}</h1>
              <div className="text-muted mt-0.5 flex items-center gap-2 text-[13px]">
                {p.officeLogo ? <img src={p.officeLogo} alt={p.officeName} className="h-4 w-auto max-w-[90px] object-contain" /> : <Icon name="Building2" size={13} />}
                <span className="font-bold">{p.officeName}</span>{p.title && <span>· {p.title}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-black ${p.status === "published" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>
              <Icon name="Globe" size={13} /> {p.status === "published" ? "פרופיל ציבורי" : "טיוטה"}
            </span>
            {p.publicUrl
              ? <Link href={p.publicUrl} target="_blank" className="bg-card border-line hover:border-brand-light inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[13px] font-bold"><Icon name="Globe" size={14} /> פתח אתר סוכן</Link>
              : <span className="text-muted text-[12px]">פרסם כדי לצפות באתר החי</span>}
          </div>
        </div>
        {/* completion */}
        <div className="relative mt-4">
          <div className="mb-1 flex items-center justify-between text-[12px] font-bold"><span className="text-ink">השלמת פרופיל</span><span className="text-brand-strong">{p.completion.score}%</span></div>
          <div className="bg-white/60 h-2 w-full overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full transition-all" style={{ width: `${p.completion.score}%` }} /></div>
          {p.completion.items.some((i) => !i.done) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {p.completion.items.filter((i) => !i.done).slice(0, 4).map((i) => <span key={i.key} className="bg-white/70 text-brand-strong rounded-full px-2.5 py-1 text-[11px] font-bold">{i.hint}</span>)}
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        {/* Tabs */}
        <aside className="flex gap-1.5 overflow-x-auto lg:flex-col">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-right text-[13px] font-bold transition ${tab === t.key ? "bg-brand text-white" : "text-muted hover:bg-brand-soft hover:text-ink"}`}>
              <Icon name={t.icon} size={15} /> {t.label}
            </button>
          ))}
        </aside>

        {/* Content */}
        <div className="bg-card border-line rounded-[20px] border p-5 shadow-sm sm:p-6">
          {tab === "identity" && <Identity p={p} set={set} />}
          {tab === "branding" && <Branding p={p} set={set} />}
          {tab === "expertise" && <Expertise p={p} set={set} />}
          {tab === "testimonials" && <Testimonials p={p} set={set} />}
          {tab === "experience" && <Experience p={p} set={set} />}
          {tab === "contact" && <Contact p={p} set={set} />}
          {tab === "social" && <Social p={p} set={set} />}
          {tab === "site" && <Site p={p} set={set} onPublish={doPublish} pending={pending} />}
          {tab === "privacy" && <Privacy p={p} set={set} onPublish={doPublish} />}
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/40 bg-white/85 p-3 backdrop-blur" style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-1">
          <div className="text-[12px] font-bold">
            {err ? <span className="text-danger">{err}</span> : saved ? <span className="text-success">נשמר ✓</span> : <span className="text-muted">שינויים מתעדכנים באתר הסוכן לאחר שמירה</span>}
          </div>
          <button onClick={save} disabled={pending} className="btn-zono-primary zono-focus-ring inline-flex items-center gap-1.5 rounded-xl px-6 py-2.5 text-sm font-black text-white disabled:opacity-60">
            {pending ? <Spinner size={16} /> : <Icon name="Check" size={16} />} שמור
          </button>
        </div>
      </div>
    </div>
  );
}

type SetFn = <K extends keyof MyProfile>(key: K, value: MyProfile[K]) => void;
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-muted mb-1 block text-[12px] font-bold">{label}</span>{children}</label>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="flex flex-col gap-3"><h2 className="text-ink text-lg font-black">{title}</h2>{children}</div>;
}

// ── Chip editor (expertise/areas/languages/achievements) ─────────────────────
function ChipEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [val, setVal] = useState("");
  const add = () => { const v = val.trim(); if (v && !items.includes(v)) onChange([...items, v]); setVal(""); };
  return (
    <div>
      <div className="flex gap-1.5">
        <input value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder={placeholder} className={inputCls} />
        <button type="button" onClick={add} className="btn-zono-secondary shrink-0 rounded-xl px-3 text-sm font-bold">הוסף</button>
      </div>
      {items.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {items.map((it, i) => (
            <span key={it} className="bg-brand-soft text-brand-strong inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold">
              {it}<button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="hover:text-danger" aria-label="הסר"><Icon name="X" size={12} /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Image upload button (reuses uploadBrandFile) ─────────────────────────────
function ImageUpload({ label, url, onUploaded, orgId, userId, kind, aspect = "aspect-[3/1]" }: { label: string; url: string | null; onUploaded: (u: string) => void; orgId: string; userId: string; kind: string; aspect?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [uErr, setUErr] = useState<string | null>(null);
  const pick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setUErr(null);
    uploadBrandFile(file, { orgId, entityType: "agent", entityId: userId, kind })
      .then((r) => onUploaded(r.url)).catch((x) => setUErr(x instanceof Error ? x.message : "ההעלאה נכשלה")).finally(() => setBusy(false));
  };
  return (
    <Field label={label}>
      <div className={`border-line relative ${aspect} w-full overflow-hidden rounded-2xl border`}>
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <div className="bg-surface text-muted grid h-full w-full place-items-center text-[12px]">אין תמונה</div>}
        <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="absolute inset-x-3 bottom-3 mx-auto inline-flex w-fit items-center gap-1.5 rounded-xl bg-white/90 px-3 py-1.5 text-[12px] font-black shadow disabled:opacity-60">
          {busy ? <Spinner size={13} /> : <Icon name="Image" size={13} />} {url ? "החלף" : "העלה"}
        </button>
        <input ref={ref} type="file" accept="image/*" onChange={pick} className="hidden" />
      </div>
      {uErr && <p className="text-danger mt-1 text-[11px] font-bold">{uErr}</p>}
    </Field>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────
function Identity({ p, set }: { p: MyProfile; set: SetFn }) {
  return (
    <Section title="פרטים אישיים">
      <Field label="שם לתצוגה *"><input value={p.displayName} onChange={(e) => set("displayName", e.target.value)} className={inputCls} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="תפקיד / התמחות"><input value={p.title} onChange={(e) => set("title", e.target.value)} className={inputCls} placeholder="למשל: יועץ נדל״ן בכיר" /></Field>
        <Field label="שנות ניסיון"><input value={p.yearsExperience ?? ""} onChange={(e) => set("yearsExperience", e.target.value ? Number(e.target.value.replace(/[^\d]/g, "")) : null)} inputMode="numeric" className={inputCls} /></Field>
      </div>
      <Field label="כותרת אישית (Headline)"><input value={p.headline} onChange={(e) => set("headline", e.target.value)} className={inputCls} placeholder="משפט מיצוב אחד" /></Field>
      <Field label="תיאור מקצועי (ביו)"><textarea value={p.bio} onChange={(e) => set("bio", e.target.value)} rows={5} className={inputCls} placeholder="ספר על עצמך, הגישה והערך שאתה מביא ללקוחות." /></Field>
      <Field label="שפות"><ChipEditor items={p.languages} onChange={(v) => set("languages", v)} placeholder="עברית, אנגלית, רוסית…" /></Field>
    </Section>
  );
}

function Branding({ p, set }: { p: MyProfile; set: SetFn }) {
  const [logoBusy, setLogoBusy] = useState(false);
  const logoRef = useRef<HTMLInputElement>(null);
  const pickLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setLogoBusy(true);
    uploadBrandFile(file, { orgId: p.orgId, entityType: "office", entityId: p.orgId, kind: "logo" })
      .then(async (r) => { const res = await updateOfficeWebsiteAction({ logo_url: r.url }); if (res.ok) set("officeLogo", r.url); })
      .catch(() => {}).finally(() => setLogoBusy(false));
  };
  return (
    <Section title="מיתוג ותמונות">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ImageUpload label="תמונת פרופיל" url={p.profileImageUrl} onUploaded={(u) => set("profileImageUrl", u)} orgId={p.orgId} userId={p.userId} kind="profile" aspect="aspect-square" />
        <ImageUpload label="תמונת קאבר" url={p.coverImageUrl} onUploaded={(u) => set("coverImageUrl", u)} orgId={p.orgId} userId={p.userId} kind="cover" aspect="aspect-[3/1]" />
      </div>
      <div className="border-line rounded-2xl border p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            {p.officeLogo ? <img src={p.officeLogo} alt={p.officeName} className="h-8 w-auto max-w-[120px] object-contain" /> : <span className="bg-brand-soft text-brand grid h-8 w-8 place-items-center rounded-lg"><Icon name="Building2" size={16} /></span>}
            <div><p className="text-ink text-[13px] font-black">לוגו המשרד</p><p className="text-muted text-[11px]">{p.officeName}</p></div>
          </div>
          {p.isManager ? (
            <button type="button" onClick={() => logoRef.current?.click()} disabled={logoBusy} className="btn-zono-secondary inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold disabled:opacity-60">{logoBusy ? <Spinner size={13} /> : <Icon name="Image" size={13} />} החלף לוגו</button>
          ) : <span className="text-muted text-[11px]">רק מנהל משרד יכול לשנות</span>}
          <input ref={logoRef} type="file" accept="image/*" onChange={pickLogo} className="hidden" />
        </div>
      </div>
      <p className="text-muted text-[12px]">התמונות מוצגות בכותרת אתר הסוכן ובכרטיס האישי. אתה תמיד יכול להחליף או להסיר.</p>
    </Section>
  );
}

function Expertise({ p, set }: { p: MyProfile; set: SetFn }) {
  return (
    <Section title="אזורי התמחות">
      <Field label="אזורי פעילות (ערים / שכונות / רחובות)"><ChipEditor items={p.serviceAreas} onChange={(v) => set("serviceAreas", v)} placeholder="תל אביב, פלורנטין, רחוב הרצל…" /></Field>
      <Field label="התמחויות (סוגי נכס / יוקרה / השקעות)"><ChipEditor items={p.specialties} onChange={(v) => set("specialties", v)} placeholder="דירות יוקרה, השקעות, מסחרי…" /></Field>
      <p className="text-muted text-[12px]">אזורים אלה מזינים את אתר הסוכן, החיפוש והמלצות ה-Territory. מוצגים ציבורית באתר.</p>
    </Section>
  );
}

function Testimonials({ p, set }: { p: MyProfile; set: SetFn }) {
  const list = p.testimonials;
  const upd = (i: number, patch: Partial<ProfileTestimonial>) => set("testimonials", list.map((t, j) => j === i ? { ...t, ...patch } : t));
  const add = () => set("testimonials", [...list, { id: `t${Date.now()}`, name: "", text: "", visible: true, featured: false }]);
  return (
    <Section title="המלצות">
      {list.length === 0 && <p className="text-muted text-[13px]">אין עדיין המלצות. הוסף המלצה אמיתית של לקוח.</p>}
      <div className="flex flex-col gap-3">
        {list.map((t, i) => (
          <div key={t.id} className="border-line rounded-2xl border p-3.5">
            <div className="grid grid-cols-2 gap-2">
              <Field label="שם הלקוח"><input value={t.name} onChange={(e) => upd(i, { name: e.target.value })} className={inputCls} /></Field>
              <Field label="אזור / סוג עסקה"><input value={t.area ?? ""} onChange={(e) => upd(i, { area: e.target.value })} className={inputCls} /></Field>
            </div>
            <Field label="תוכן ההמלצה"><textarea value={t.text} onChange={(e) => upd(i, { text: e.target.value })} rows={2} className={`${inputCls} mt-2`} /></Field>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <label className="text-muted flex items-center gap-1.5 text-[12px] font-bold"><input type="checkbox" checked={t.visible !== false} onChange={(e) => upd(i, { visible: e.target.checked })} className="h-4 w-4" /> מוצג באתר</label>
              <label className="text-muted flex items-center gap-1.5 text-[12px] font-bold"><input type="checkbox" checked={!!t.featured} onChange={(e) => upd(i, { featured: e.target.checked })} className="h-4 w-4" /> מומלץ</label>
              <button type="button" onClick={() => set("testimonials", list.filter((_, j) => j !== i))} className="text-danger mr-auto text-[12px] font-bold">מחק</button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className="btn-zono-secondary inline-flex w-fit items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-bold"><Icon name="Plus" size={15} /> הוסף המלצה</button>
      <p className="text-muted text-[12px]">רק המלצות שסומנו כ&quot;מוצג באתר&quot; יופיעו באתר הציבורי. אין להוסיף המלצות שאינן אמיתיות.</p>
    </Section>
  );
}

function Experience({ p, set }: { p: MyProfile; set: SetFn }) {
  return (
    <Section title="ניסיון והישגים">
      <Field label="שנות ניסיון"><input value={p.yearsExperience ?? ""} onChange={(e) => set("yearsExperience", e.target.value ? Number(e.target.value.replace(/[^\d]/g, "")) : null)} inputMode="numeric" className={inputCls} /></Field>
      <Field label="הישגים והסמכות (מוצהר עצמית)"><ChipEditor items={p.achievements} onChange={(v) => set("achievements", v)} placeholder="חבר לשכת המתווכים, פרס מכירות 2024…" /></Field>
      <p className="text-muted text-[12px]">הישגים אלה מוצהרים על ידך. אין להזין נתונים שאינם נכונים — נתוני מכירות מאומתים מגיעים ממערכת ZONO בלבד.</p>
    </Section>
  );
}

function Contact({ p, set }: { p: MyProfile; set: SetFn }) {
  const bad = (v: string, re: RegExp) => v.length > 0 && !re.test(v);
  return (
    <Section title="פרטי קשר">
      <div className="grid grid-cols-2 gap-3">
        <Field label="טלפון"><input value={p.phone} onChange={(e) => set("phone", e.target.value)} inputMode="tel" className={inputCls} />{bad(p.phone, /^[\d+\-() ]{6,}$/) && <span className="text-danger text-[11px]">מספר לא תקין</span>}</Field>
        <Field label="וואטסאפ"><input value={p.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} inputMode="tel" className={inputCls} placeholder="9725…" /></Field>
      </div>
      <Field label="אימייל"><input value={p.email} onChange={(e) => set("email", e.target.value)} inputMode="email" className={inputCls} />{bad(p.email, /^[^@\s]+@[^@\s]+\.[^@\s]+$/) && <span className="text-danger text-[11px]">אימייל לא תקין</span>}</Field>
      <p className="text-muted text-[12px]">פרטי הקשר מזינים את כפתורי יצירת הקשר וה-WhatsApp באתר הסוכן.</p>
    </Section>
  );
}

function Social({ p, set }: { p: MyProfile; set: SetFn }) {
  const upd = (k: string, v: string) => set("social", { ...p.social, [k]: v });
  return (
    <Section title="רשתות חברתיות">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {SOCIAL_KEYS.map((s) => (
          <Field key={s.key} label={s.label}><input value={p.social[s.key] ?? ""} onChange={(e) => upd(s.key, e.target.value)} className={inputCls} placeholder="https://…" /></Field>
        ))}
      </div>
      <p className="text-muted text-[12px]">רק קישורים שמולאו יוצגו באתר. רשתות ריקות מוסתרות אוטומטית.</p>
    </Section>
  );
}

function Site({ p, set, onPublish, pending }: { p: MyProfile; set: SetFn; onPublish: (v: boolean) => void; pending: boolean }) {
  return (
    <Section title="אתר הסוכן">
      <div className="border-line flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
        <div>
          <p className="text-ink text-[13px] font-black">סטטוס אתר: {p.status === "published" ? "פורסם" : "טיוטה"}</p>
          <p className="text-muted text-[11px]">{p.publicUrl ? `כתובת: ${p.publicUrl}` : "פרסם כדי לקבל כתובת ציבורית"}</p>
        </div>
        {p.status === "published"
          ? <button onClick={() => onPublish(false)} disabled={pending} className="btn-zono-secondary rounded-xl px-4 py-2 text-sm font-bold disabled:opacity-60">בטל פרסום</button>
          : <button onClick={() => onPublish(true)} disabled={pending} className="btn-zono-primary rounded-xl px-4 py-2 text-sm font-black text-white disabled:opacity-60">פרסם אתר</button>}
      </div>
      <Field label="ערכת עיצוב">
        <div className="flex flex-wrap gap-1.5">
          {THEMES.map((t) => <button key={t} type="button" onClick={() => set("themePreset", t)} className={`rounded-lg px-2.5 py-1.5 text-[12px] font-bold ${p.themePreset === t ? "bg-brand text-white" : "bg-surface text-muted hover:text-ink"}`}>{t}</button>)}
        </div>
      </Field>
      <p className="text-muted text-[12px]">ניהול מלא של סקשנים, נכסים מובילים ו-SEO זמין ב<Link href="/agent-website" className="text-brand font-bold"> בונה אתר הסוכן</Link> — אותם נתונים בדיוק.</p>
    </Section>
  );
}

function Privacy({ p, set, onPublish }: { p: MyProfile; set: SetFn; onPublish: (v: boolean) => void }) {
  const toggle = (k: string, v: boolean) => set("enabledSections", { ...p.enabledSections, [k]: v });
  return (
    <Section title="פרטיות וחשיפה">
      <div className="border-line flex items-center justify-between gap-3 rounded-2xl border p-4">
        <div><p className="text-ink text-[13px] font-black">אתר סוכן ציבורי</p><p className="text-muted text-[11px]">כאשר מכובה, האתר אינו נגיש לציבור.</p></div>
        <button onClick={() => onPublish(p.status !== "published")} className={`rounded-full px-3 py-1.5 text-[12px] font-black ${p.status === "published" ? "bg-success-soft text-success" : "bg-surface text-muted"}`}>{p.status === "published" ? "מופעל" : "כבוי"}</button>
      </div>
      <p className="text-muted text-[12px] font-bold">אילו סקשנים יוצגו באתר</p>
      <div className="flex flex-col gap-2">
        {SITE_SECTIONS.map((sct) => {
          const on = p.enabledSections[sct.key] !== false;
          return (
            <label key={sct.key} className="border-line flex items-center justify-between gap-2 rounded-xl border p-3">
              <span className="text-ink text-[13px] font-bold">{sct.label}</span>
              <input type="checkbox" checked={on} onChange={(e) => toggle(sct.key, e.target.checked)} className="h-4 w-4" />
            </label>
          );
        })}
      </div>
    </Section>
  );
}
