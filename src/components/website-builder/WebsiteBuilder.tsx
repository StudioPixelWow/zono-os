"use client";
// ============================================================================
// 🌐 ZONO Website Builder OS™ — premium control center (RTL). 38.1.
// A preview-first control center over the EXISTING website stack. Left: a live
// preview of the published site (real iframe) + status/health/last-updated.
// Right: theme selector (reuses SITE_THEMES), sections order+visibility, contact
// & lead-CTA settings, SEO preview, recommendations, analytics, Ask ZONO.
// Every control maps to a REAL server action (layout/template/theme/contact/
// publish/unpublish); nothing auto-publishes. No new renderer, no fabricated data.
// ============================================================================
import { useState, useTransition } from "react";
import type { BuilderView, BuilderTarget, BuilderSection } from "@/lib/website-builder/types";
import { moveSection } from "@/lib/website-builder/assemble";
import { SITE_THEMES } from "@/lib/brokerage-site/branding";
import {
  saveWebsiteLayoutAction, applyWebsiteTemplateAction, publishWebsiteAction, unpublishWebsiteAction,
  saveWebsiteThemeAction, saveWebsiteContactAction, askWebsiteAction, getWebsiteBuilderAction,
} from "@/lib/website-builder/actions";

type Mode = "agent" | "office" | "landing";
type Tab = "design" | "sections" | "contact" | "seo" | "recs" | "analytics" | "ask" | "templates";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "design", label: "עיצוב", icon: "🎨" }, { id: "sections", label: "סקשנים", icon: "🧩" },
  { id: "contact", label: "יצירת קשר", icon: "📞" }, { id: "seo", label: "SEO", icon: "🔎" },
  { id: "recs", label: "המלצות", icon: "✨" }, { id: "analytics", label: "נתונים", icon: "📊" },
  { id: "templates", label: "תבניות", icon: "🗂️" }, { id: "ask", label: "שאל", icon: "🔮" },
];
const impCls: Record<string, string> = { high: "bg-danger-soft text-danger", medium: "bg-warning-soft text-warning", low: "bg-surface text-muted" };
const bandCls: Record<string, string> = { strong: "bg-success-soft text-success", fair: "bg-warning-soft text-warning", weak: "bg-danger-soft text-danger" };
const recIcon: Record<string, string> = { missing_image: "🖼️", missing_contact: "📵", missing_featured: "🏠", missing_cta: "🎯", missing_faq: "❓", missing_section: "🧩", weak_seo: "🔎", low_content: "✍️", poor_conversion: "📉" };

// Representative swatch per theme (builder-only cosmetics; the live tokens come
// from the shared theme system on the public site).
const THEME_SWATCH: Record<string, string> = {
  "luxury-light": "linear-gradient(135deg,#6d28d9,#8b5cf6)", "dark-prestige": "linear-gradient(135deg,#0f172a,#334155)",
  "urban-glass": "linear-gradient(135deg,#0ea5e9,#6366f1)", "boutique-agent": "linear-gradient(135deg,#be185d,#f472b6)",
  "developer-project": "linear-gradient(135deg,#0891b2,#22d3ee)", "investment": "linear-gradient(135deg,#047857,#34d399)",
  "family": "linear-gradient(135deg,#ea580c,#fbbf24)", "ultra-minimal": "linear-gradient(135deg,#111827,#6b7280)",
};

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function WebsiteBuilder({ initial, initialTarget }: { initial: BuilderView | { missing: true; target: BuilderTarget }; initialTarget: BuilderTarget }) {
  const [mode, setMode] = useState<Mode>(initialTarget);
  const [siteTarget, setSiteTarget] = useState<BuilderTarget>(initialTarget);
  const [view, setView] = useState<BuilderView | { missing: true; target: BuilderTarget }>(initial);
  const [tab, setTab] = useState<Tab>("design");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const reload = (t: BuilderTarget) => start(async () => { const r = await getWebsiteBuilderAction(t); if (r.ok && r.result) setView(r.result); });
  const toast = (m: string) => { setMsg(m); setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 3200); };
  const switchMode = (m: Mode) => {
    setMode(m);
    if (m === "agent" || m === "office") { setSiteTarget(m); reload(m); if (tab === "ask") setTab("design"); }
  };

  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-6">
      <Header mode={mode} onMode={switchMode} view={view} />
      {msg && <div className="bg-success-soft text-success mt-3 rounded-xl py-2 text-center text-[12px] font-bold">{msg}</div>}

      {mode === "landing" ? (
        <LandingPanel view={view} />
      ) : "missing" in view ? (
        <MissingState target={siteTarget} />
      ) : (
        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <PreviewPanel view={view} target={siteTarget} pending={pending} onToast={toast} reload={() => reload(siteTarget)} start={start} />
          <div>
            <TabStrip tab={tab} onTab={setTab} askEnabled={view.settings.askAiEnabled} />
            <div className="mt-4">
              {tab === "design" && <DesignTab view={view} target={siteTarget} pending={pending} onToast={toast} reload={() => reload(siteTarget)} start={start} />}
              {tab === "sections" && <SectionsTab v={view} target={siteTarget} pending={pending} onSaved={(m) => { toast(m); reload(siteTarget); }} start={start} />}
              {tab === "contact" && <ContactTab view={view} target={siteTarget} pending={pending} onToast={toast} reload={() => reload(siteTarget)} start={start} onGoSections={() => setTab("sections")} />}
              {tab === "seo" && <SeoTab v={view} />}
              {tab === "recs" && <RecsTab v={view} />}
              {tab === "analytics" && <AnalyticsTab v={view} />}
              {tab === "templates" && <TemplatesTab v={view} target={siteTarget} pending={pending} onApplied={(m) => { toast(m); reload(siteTarget); }} start={start} />}
              {tab === "ask" && <AskTab />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ mode, onMode, view }: { mode: Mode; onMode: (m: Mode) => void; view: BuilderView | { missing: true; target: BuilderTarget } }) {
  const health = "missing" in view ? null : view.health;
  return (
    <div className="bg-brand-soft rounded-[22px] p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-brand text-xs font-bold">ZONO Website Builder</p>
          <h1 className="text-ink text-2xl font-black sm:text-3xl">🌐 מרכז השליטה באתרים</h1>
        </div>
        {health && <span className={`rounded-full px-3 py-1 text-[11px] font-bold ${bandCls[health.band]}`}>בריאות אתר {health.score}</span>}
      </div>
      <div className="mt-3">
        <div className="bg-card inline-flex rounded-xl p-1">
          {(["agent", "office", "landing"] as Mode[]).map((m) => (
            <button key={m} onClick={() => onMode(m)} className={`rounded-lg px-3.5 py-1.5 text-[12px] font-bold transition ${mode === m ? "bg-brand text-white shadow-[var(--shadow-soft)]" : "text-muted hover:text-ink"}`}>
              {m === "agent" ? "אתר אישי" : m === "office" ? "אתר משרד" : "דפי נחיתה"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MissingState({ target }: { target: BuilderTarget }) {
  return (
    <div className="bg-card border-line mt-6 rounded-[22px] border p-10 text-center">
      <div className="bg-brand-soft text-brand mx-auto grid h-16 w-16 place-items-center rounded-full text-3xl">🌐</div>
      <p className="text-ink mt-4 text-lg font-black">עדיין אין {target === "agent" ? "אתר אישי" : "אתר משרד"}</p>
      <p className="text-muted mx-auto mt-1 max-w-sm text-sm">צרו אתר במסך ה{target === "agent" ? "אתר האישי" : "אתר המשרד"} — ואז תוכלו לנהל, לעצב ולפרסם אותו כאן.</p>
      <a href={target === "agent" ? "/agent-website" : "/office-website"} className="bg-brand mt-5 inline-block rounded-xl px-5 py-2.5 text-sm font-bold text-white">צור אתר</a>
    </div>
  );
}

function PreviewPanel({ view, target, pending, onToast, reload, start }: { view: BuilderView; target: BuilderTarget; pending: boolean; onToast: (m: string) => void; reload: () => void; start: (fn: () => Promise<void>) => void }) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const s = view.settings;
  const published = view.site.published;
  const updated = fmtDate(s.updatedAt);

  return (
    <div className="bg-card border-line overflow-hidden rounded-[22px] border">
      {/* Status bar */}
      <div className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${published ? "bg-success-soft text-success" : "bg-surface text-muted"}`}>{published ? "● מפורסם" : "○ טיוטה"}</span>
          {s.previewUrl && <span className="text-muted hidden text-[11px] sm:inline">zono.co.il{s.previewUrl}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="bg-surface inline-flex rounded-lg p-0.5">
            <button onClick={() => setDevice("desktop")} className={`rounded-md px-2 py-1 text-[11px] font-bold ${device === "desktop" ? "bg-card text-ink shadow-sm" : "text-muted"}`}>🖥️</button>
            <button onClick={() => setDevice("mobile")} className={`rounded-md px-2 py-1 text-[11px] font-bold ${device === "mobile" ? "bg-card text-ink shadow-sm" : "text-muted"}`}>📱</button>
          </div>
          {s.previewUrl && <a href={s.previewUrl} target="_blank" rel="noopener noreferrer" className="bg-brand-soft text-brand rounded-lg px-3 py-1.5 text-[11px] font-bold">פתח באתר ↗</a>}
        </div>
      </div>

      {/* Live preview / draft empty state */}
      <div className="bg-surface/60 relative flex min-h-[320px] items-stretch justify-center p-3 sm:min-h-[440px]">
        {published && s.previewUrl ? (
          <div className={`overflow-hidden rounded-2xl border border-line bg-white shadow-[var(--shadow-card)] transition-all ${device === "mobile" ? "w-[320px]" : "w-full"}`}>
            <iframe src={s.previewUrl} title="תצוגה חיה של האתר" loading="lazy" className="h-[300px] w-full sm:h-[420px]" />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center">
            <div className="bg-brand-soft text-brand grid h-16 w-16 place-items-center rounded-full text-3xl">👁️</div>
            <p className="text-ink mt-4 text-[15px] font-black">התצוגה החיה תופיע כאן לאחר פרסום</p>
            <p className="text-muted mx-auto mt-1 max-w-xs text-[13px]">פרסמו את האתר (בכפוף לאישור) כדי לראות אותו חי ולשתף קישור.</p>
          </div>
        )}
      </div>

      {/* Site meta + publish */}
      <div className="border-line border-t p-4">
        <div className="text-ink text-[15px] font-black">{view.site.headline || view.site.title || "האתר שלי"}</div>
        <div className="text-muted mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
          <span>👁️ {view.site.viewCount} צפיות</span>
          {updated && <span>🕑 עודכן {updated}</span>}
          <span>🧩 {view.sections.filter((x) => x.enabled).length} סקשנים פעילים</span>
        </div>
        <div className="mt-3 flex gap-2">
          {published ? (
            <button disabled={pending} onClick={() => start(async () => { const r = await unpublishWebsiteAction(target); onToast(r.ok ? "האתר הוחזר לטיוטה" : r.error ?? "שגיאה"); reload(); })} className="bg-surface text-ink border-line flex-1 rounded-xl border py-2.5 text-[13px] font-bold disabled:opacity-50">בטל פרסום</button>
          ) : (
            <button disabled={pending} onClick={() => start(async () => { const r = await publishWebsiteAction(target); onToast(r.ok ? "נשלח לפרסום ✓" : r.error ?? "שגיאה"); reload(); })} className="bg-brand flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-50">פרסם אתר (דורש אישור)</button>
          )}
        </div>
        <div className="text-muted mt-1.5 text-center text-[10px]">אין פרסום אוטומטי — הפרסום מתבצע ידנית ובכפוף לאישור.</div>
      </div>
    </div>
  );
}

function TabStrip({ tab, onTab, askEnabled }: { tab: Tab; onTab: (t: Tab) => void; askEnabled: boolean }) {
  return (
    <div className="border-line flex gap-1 overflow-x-auto border-b pb-2">
      {TABS.map((t) => (
        <button key={t.id} onClick={() => onTab(t.id)} className={`flex shrink-0 items-center gap-1 rounded-xl px-3 py-1.5 text-[12px] font-bold transition ${tab === t.id ? "bg-brand-soft text-brand" : "text-muted hover:text-ink"}`}>
          <span className="text-sm leading-none">{t.icon}</span>{t.label}
          {t.id === "ask" && askEnabled && <span className="bg-success ms-0.5 inline-block h-1.5 w-1.5 rounded-full" />}
        </button>
      ))}
    </div>
  );
}

function DesignTab({ view, target, pending, onToast, reload, start }: { view: BuilderView; target: BuilderTarget; pending: boolean; onToast: (m: string) => void; reload: () => void; start: (fn: () => Promise<void>) => void }) {
  const current = view.settings.theme ?? "luxury-light";
  const choose = (key: string) => start(async () => { const r = await saveWebsiteThemeAction(target, key); onToast(r.ok ? "העיצוב עודכן — יוחל באתר החי ✓" : r.error ?? "שגיאה"); reload(); });
  return (
    <div>
      <p className="text-muted text-[12px]">בחרו ערכת עיצוב — היא תוחל מיד על האתר הציבורי (המראה, הצבעים והזכוכית).</p>
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {SITE_THEMES.map((t) => {
          const active = current === t.key;
          return (
            <button key={t.key} disabled={pending} onClick={() => choose(t.key)} className={`group overflow-hidden rounded-2xl border text-right transition disabled:opacity-60 ${active ? "border-brand ring-brand/30 ring-2" : "border-line hover:border-brand/40"}`}>
              <div className="h-14 w-full" style={{ background: THEME_SWATCH[t.key] ?? "var(--site-gradient)" }} />
              <div className="bg-card flex items-center justify-between px-2.5 py-2">
                <span className="text-ink text-[12px] font-bold">{t.label}</span>
                {active && <span className="text-brand text-[11px] font-black">✓</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionsTab({ v, target, pending, onSaved, start }: { v: BuilderView; target: BuilderTarget; pending: boolean; onSaved: (m: string) => void; start: (fn: () => Promise<void>) => void }) {
  const [sections, setSections] = useState<BuilderSection[]>(v.sections);
  const order = sections.map((s) => s.key);
  const move = (key: string, dir: "up" | "down") => { const newOrder = moveSection(order, key, dir); setSections(newOrder.map((k, i) => ({ ...sections.find((s) => s.key === k)!, order: i }))); };
  const toggle = (key: string) => setSections(sections.map((s) => s.key === key ? { ...s, enabled: !s.enabled } : s));
  const save = () => start(async () => { const map: Record<string, boolean> = {}; for (const s of sections) map[s.key] = s.enabled; const r = await saveWebsiteLayoutAction(target, sections.map((s) => s.key), map); onSaved(r.ok ? "הסידור נשמר ✓" : r.error ?? "שגיאה"); });
  return (
    <div className="space-y-2">
      <p className="text-muted text-[12px]">סדרו את הסקשנים עם החיצים והפעילו/כבו אותם. סקשן עם <span className="text-brand font-black">*</span> חיוני.</p>
      {sections.map((s, i) => (
        <div key={s.key} className="bg-surface flex items-center gap-2 rounded-2xl p-2.5">
          <div className="flex flex-col">
            <button disabled={i === 0} onClick={() => move(s.key, "up")} className="text-muted disabled:opacity-30">▲</button>
            <button disabled={i === sections.length - 1} onClick={() => move(s.key, "down")} className="text-muted disabled:opacity-30">▼</button>
          </div>
          <span className="text-lg">{s.icon}</span>
          <div className="min-w-0 flex-1"><div className="text-ink text-[13px] font-bold">{s.label}{s.essential && <span className="text-brand"> *</span>}</div></div>
          <button onClick={() => toggle(s.key)} className={`rounded-full px-3 py-1 text-[11px] font-bold transition ${s.enabled ? "bg-success-soft text-success" : "bg-card text-muted"}`}>{s.enabled ? "פעיל" : "כבוי"}</button>
        </div>
      ))}
      <button disabled={pending} onClick={save} className="bg-brand mt-2 w-full rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-50">שמור סידור וניראות</button>
    </div>
  );
}

function ContactTab({ view, target, pending, onToast, reload, start, onGoSections }: { view: BuilderView; target: BuilderTarget; pending: boolean; onToast: (m: string) => void; reload: () => void; start: (fn: () => Promise<void>) => void; onGoSections: () => void }) {
  const c = view.settings.contact;
  const [whatsapp, setWhatsapp] = useState(c.whatsapp ?? "");
  const [phone, setPhone] = useState(c.phone ?? "");
  const [email, setEmail] = useState(c.email ?? "");
  const save = () => start(async () => { const r = await saveWebsiteContactAction(target, { whatsapp: whatsapp.trim() || null, phone: phone.trim() || null, email: email.trim() || null }); onToast(r.ok ? "פרטי הקשר נשמרו ✓" : r.error ?? "שגיאה"); reload(); });
  const fieldCls = "border-line bg-card text-ink mt-1 h-11 w-full rounded-xl border px-3 text-right text-[14px] outline-none focus:border-brand";
  return (
    <div className="space-y-3">
      <div className="bg-brand-soft rounded-2xl p-3">
        <div className="text-brand text-[13px] font-black">💬 יצירת קשר וקריאה לפעולה</div>
        <div className="text-muted mt-0.5 text-[12px]">ערוצים אלה מפעילים את בלוק הלידים (SiteLeadCta) ואת פרטי הקשר באתר הציבורי.</div>
      </div>
      <div>
        <label className="text-ink text-[12px] font-bold">וואטסאפ</label>
        <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="972501234567" dir="ltr" className={fieldCls} />
        <p className="text-muted mt-0.5 text-[11px]">מספר בפורמט בינלאומי, למשל 972501234567</p>
      </div>
      <div>
        <label className="text-ink text-[12px] font-bold">טלפון</label>
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="03-1234567" dir="ltr" className={fieldCls} />
        <p className="text-muted mt-0.5 text-[11px]">מספר לחיוג ישיר מהאתר</p>
      </div>
      <div>
        <label className="text-ink text-[12px] font-bold">אימייל</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="info@office.co.il" dir="ltr" className={fieldCls} />
        <p className="text-muted mt-0.5 text-[11px]">לפניות שאינן דחופות</p>
      </div>
      <button disabled={pending} onClick={save} className="bg-brand w-full rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-50">שמור פרטי קשר</button>
      <div className="bg-surface flex items-center justify-between rounded-2xl p-3">
        <div><div className="text-ink text-[13px] font-bold">🔮 שאל AI לגולשים</div><div className="text-muted text-[11px]">{view.settings.askAiEnabled ? "פעיל — גולשים יכולים לשאול את ZONO באתר" : "כבוי — ניתן להפעיל בסקשנים"}</div></div>
        <button onClick={onGoSections} className="bg-card text-brand border-line rounded-lg border px-3 py-1.5 text-[11px] font-bold">נהל</button>
      </div>
    </div>
  );
}

function SeoTab({ v }: { v: BuilderView }) {
  return (
    <div className="space-y-3">
      <div className={`rounded-2xl p-3 text-center text-[13px] font-bold ${v.seo.ready ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{v.seo.ready ? "✓ ה-SEO תקין ומוכן לאינדוקס" : `⚠️ ${v.seo.issues.length} נושאים לתיקון ב-SEO`}</div>
      {/* Google-style preview */}
      <div className="bg-card border-line rounded-2xl border p-4">
        <div className="text-muted text-[11px] font-bold">תצוגה מקדימה בגוגל</div>
        <div className="mt-2">
          <div className="text-[13px] text-[#1a0dab]">{v.seo.title || "כותרת האתר תופיע כאן"}</div>
          <div className="text-[12px] text-[#006621]">zono.co.il{v.site.slug ? `/${v.site.slug}` : ""}</div>
          <div className="text-muted mt-0.5 line-clamp-2 text-[12px]">{v.seo.description || "תיאור האתר יופיע כאן — הוסיפו תיאור בן 40+ תווים לשיפור הדירוג."}</div>
        </div>
      </div>
      {v.seo.issues.map((i, k) => <div key={k} className="bg-surface rounded-xl p-2.5 text-[12px]"><span className="text-danger font-bold">{i.field}:</span> <span className="text-muted">{i.issue}</span></div>)}
    </div>
  );
}

function RecsTab({ v }: { v: BuilderView }) {
  return v.recommendations.length === 0 ? (
    <div className="bg-card border-line rounded-2xl border p-8 text-center">
      <div className="bg-success-soft text-success mx-auto grid h-14 w-14 place-items-center rounded-full text-2xl">✓</div>
      <p className="text-ink mt-3 text-[14px] font-black">האתר במצב מצוין</p>
      <p className="text-muted mt-1 text-[12px]">אין המלצות דחופות — כל הסקשנים החיוניים, פרטי הקשר וה-SEO תקינים.</p>
    </div>
  ) : (
    <div className="space-y-2">{v.recommendations.map((r, i) => (
      <div key={i} className="bg-card border-line rounded-2xl border p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-ink flex items-center gap-1.5 text-[13px] font-black"><span>{recIcon[r.kind] ?? "✨"}</span>{r.title}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${impCls[r.impact]}`}>{r.impact === "high" ? "גבוה" : r.impact === "medium" ? "בינוני" : "נמוך"}</span>
        </div>
        <div className="text-muted mt-1 text-[12px]">{r.why}</div>
        {r.evidence.length > 0 && <div className="text-muted mt-1 text-[11px]">📌 {r.evidence.join(" · ")}</div>}
      </div>
    ))}</div>
  );
}

function AnalyticsTab({ v }: { v: BuilderView }) {
  const a = v.analytics;
  const tiles: [string, number | string][] = [["מבקרים", a.visitors], ["לידים", a.leads], ["צפיות נכס", a.propertyViews], ["וואטסאפ", a.whatsappClicks], ["שיחות", a.calls], ["המרה", `${a.conversionRate}%`]];
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{tiles.map(([l, val]) => <div key={l} className="bg-card border-line rounded-2xl border px-3 py-4 text-center"><div className="text-brand text-2xl font-black">{val}</div><div className="text-muted text-[11px] font-bold">{l}</div></div>)}</div>;
}

function TemplatesTab({ v, target, pending, onApplied, start }: { v: BuilderView; target: BuilderTarget; pending: boolean; onApplied: (m: string) => void; start: (fn: () => Promise<void>) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-muted text-[12px]">בחרו תבנית — היא תסדר ותפעיל את הסקשנים המתאימים לסוג האתר.</p>
      {v.templates.map((t) => (
        <div key={t.key} className="bg-card border-line rounded-2xl border p-3">
          <div className="text-ink text-[14px] font-black">{t.name}</div>
          <div className="text-muted mt-0.5 text-[12px]">{t.description}</div>
          <div className="text-muted mt-1 text-[11px]">{t.sections.length} סקשנים</div>
          <button disabled={pending} onClick={() => start(async () => { const r = await applyWebsiteTemplateAction(target, t.key); onApplied(r.ok ? `הוחלה תבנית "${t.name}" ✓` : r.error ?? "שגיאה"); })} className="bg-brand-soft text-brand mt-2 rounded-lg px-3 py-1.5 text-[12px] font-bold">החל תבנית</button>
        </div>
      ))}
    </div>
  );
}

function AskTab() {
  const [res, setRes] = useState<{ answer: string; items: { title: string; detail: string }[] } | null>(null);
  const [pending, start] = useTransition();
  const suggestions = ["איך לשפר את האתר?", "איזה דף חסר?", "איזה אזור חסר SEO?", "איזה נכסים כדאי להבליט?"];
  const ask = (q: string) => { if (!q.trim()) return; start(async () => { const r = await askWebsiteAction(q); setRes(r.ok && r.result ? { answer: r.result.answer, items: r.result.items } : { answer: "לא ניתן לענות כרגע.", items: [] }); }); };
  return (
    <div className="space-y-3">
      <div className="bg-brand-soft rounded-2xl p-3"><div className="text-brand text-[13px] font-black">🔮 שאל את ZONO על האתר</div></div>
      <div className="flex flex-wrap gap-1.5">{suggestions.map((s) => <button key={s} onClick={() => ask(s)} className="bg-surface text-ink rounded-full px-3 py-1.5 text-[11px] font-bold">{s}</button>)}</div>
      {pending && <div className="text-muted text-[12px]">חושב…</div>}
      {res && <div className="bg-card border-line rounded-2xl border p-3"><div className="text-ink text-[13px] font-bold">{res.answer}</div><div className="mt-2 space-y-1">{res.items.map((it, i) => <div key={i} className="bg-surface rounded-lg px-2.5 py-1.5"><span className="text-ink text-[12px] font-bold">{it.title}</span> <span className="text-muted text-[11px]">— {it.detail}</span></div>)}</div></div>}
    </div>
  );
}

// ── Landing pages panel — launch/preview office-family campaign landings that
// reuse the EXISTING public renderer (/l/[slug]/[type]). No duplication; links
// only appear for a published site (real, working URLs). Property/area landings
// need an entity id and are launched from the property/area screens.
const OFFICE_LANDINGS: { type: string; label: string; desc: string; icon: string }[] = [
  { type: "seller_recruitment", label: "גיוס מוכרים", desc: "קמפיין למוכרים פוטנציאליים", icon: "🏷️" },
  { type: "buyer_recruitment", label: "גיוס קונים", desc: "קמפיין לקונים ואיתור התאמות", icon: "🔑" },
  { type: "valuation", label: "הערכת שווי", desc: "דף נחיתה להערכת שווי", icon: "💰" },
  { type: "investment", label: "השקעות", desc: "קמפיין הזדמנויות השקעה", icon: "📈" },
  { type: "market_report", label: "דוח שוק", desc: "סקירת שוק מקומית", icon: "🗺️" },
  { type: "office_campaign", label: "קמפיין משרד", desc: "דף נחיתה כללי למשרד", icon: "🏢" },
];

function LandingPanel({ view }: { view: BuilderView | { missing: true; target: BuilderTarget } }) {
  if ("missing" in view || !view.site.slug || !view.site.published) {
    return (
      <div className="bg-card border-line mt-6 rounded-[22px] border p-10 text-center">
        <div className="bg-brand-soft text-brand mx-auto grid h-16 w-16 place-items-center rounded-full text-3xl">🎯</div>
        <p className="text-ink mt-4 text-lg font-black">דפי נחיתה מוכנים לאחר פרסום</p>
        <p className="text-muted mx-auto mt-1 max-w-sm text-sm">פרסמו את האתר (אישי או משרד) כדי ליצור דפי נחיתה ממוקדי המרה לקמפיינים.</p>
      </div>
    );
  }
  const slug = view.site.slug;
  return (
    <div className="mt-4">
      <p className="text-muted text-[12px]">דפי נחיתה ממוקדי המרה — משתמשים באותה מערכת אתרים משותפת. לחצו לתצוגה חיה.</p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {OFFICE_LANDINGS.map((l) => (
          <a key={l.type} href={`/l/${slug}/${l.type}`} target="_blank" rel="noopener noreferrer" className="bg-card border-line hover:border-brand/40 group flex items-center gap-3 rounded-2xl border p-3.5 transition">
            <span className="bg-brand-soft grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg">{l.icon}</span>
            <div className="min-w-0 flex-1"><div className="text-ink text-[14px] font-black">{l.label}</div><div className="text-muted text-[12px]">{l.desc}</div></div>
            <span className="text-brand text-[12px] font-bold opacity-0 transition group-hover:opacity-100">תצוגה ↗</span>
          </a>
        ))}
      </div>
      <div className="text-muted mt-3 text-[11px]">דפי נחיתה לנכס/אזור נוצרים ממסך הנכס או האזור (דורשים בחירת נכס).</div>
    </div>
  );
}
