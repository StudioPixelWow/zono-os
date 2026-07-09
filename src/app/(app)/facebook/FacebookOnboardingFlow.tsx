"use client";
// ============================================================================
// 📘 ZONO — Facebook Onboarding Flow (client). State-driven product onboarding:
//   STATE 1 disconnected → Meta OAuth hero + Connect
//   STATE 2 connected     → "Connected" + Start first scan
//   STATE 3 scanning      → live progress (Groups / Pages / BM / Ad Accounts)
//   STATE 4 scanned       → import wizard (choose groups)
// STATE 5 (dashboard) is rendered by the page ONLY after import. Real groups;
// Pages/BM/Ad Accounts require the official Meta API (shown honestly, not faked).
// ============================================================================
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Spinner } from "@/components/ui/Button";
import { fbConnectAction, fbScanAction, fbImportAction, fbResetAction } from "@/lib/facebook-onboarding/actions";
import type { FbOnboardingState, FbDiscovery, FbDiscoveredGroup } from "@/lib/facebook-onboarding/service";

type View = "disconnected" | "connected" | "scanning" | "scanned";
const FB = "linear-gradient(135deg,#3b5998,#5b7bd5)";

const IMPORTS: { icon: string; title: string; body: string }[] = [
  { icon: "Building2", title: "עמודי Facebook", body: "העמודים שבניהולך — לפרסום ומעקב." },
  { icon: "Users", title: "קבוצות", body: "הקבוצות שלך — תבחר אילו לייבא." },
  { icon: "Layers", title: "Business Managers", body: "חשבונות הניהול העסקי המקושרים." },
  { icon: "BarChart3", title: "חשבונות מודעות", body: "Ad Accounts לתקצוב ומדידה." },
];
const SCAN_CATS: { key: keyof FbDiscovery; icon: string; label: string }[] = [
  { key: "groups", icon: "Users", label: "קבוצות" },
  { key: "pages", icon: "Building2", label: "עמודים" },
  { key: "businessManagers", icon: "Layers", label: "Business Managers" },
  { key: "adAccounts", icon: "BarChart3", label: "חשבונות מודעות" },
];

export function FacebookOnboardingFlow({ state, discovery, oauthReady = false, oauthReason = "not_configured" }: { state: FbOnboardingState; discovery: FbDiscovery | null; oauthReady?: boolean; oauthReason?: "ready" | "not_live" | "not_configured" }) {
  const router = useRouter();
  const [view, setView] = useState<View>(state === "scanned" ? "scanned" : state === "connected" ? "connected" : "disconnected");
  const [disc, setDisc] = useState<FbDiscovery | null>(discovery);
  const [pending, start] = useTransition();
  const [scanStep, setScanStep] = useState(0);
  const [flowErr, setFlowErr] = useState<string | null>(null);
  const scanTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (scanTimer.current) clearInterval(scanTimer.current); }, []);

  // Simulated/demo connect (used only when official Meta OAuth env is not set).
  // Wrapped so a transient failure shows an inline message — never a crash page.
  const connect = () => { setFlowErr(null); start(async () => { try { const r = await fbConnectAction(); if (r.ok) setView("connected"); else setFlowErr("החיבור נכשל. נסה שוב."); } catch { setFlowErr("החיבור נכשל. נסה שוב."); } }); };
  const reset = () => start(async () => { try { await fbResetAction(); } catch { /* ignore */ } setView("disconnected"); setDisc(null); });

  const scan = () => {
    setView("scanning"); setScanStep(0);
    if (scanTimer.current) clearInterval(scanTimer.current);
    scanTimer.current = setInterval(() => setScanStep((s) => Math.min(s + 1, SCAN_CATS.length)), 550);
    start(async () => {
      const r = await fbScanAction();
      if (scanTimer.current) clearInterval(scanTimer.current);
      setScanStep(SCAN_CATS.length);
      setTimeout(() => { setDisc(r.discovery); setView("scanned"); }, 350);
    });
  };

  // ── STATE 1 — disconnected ────────────────────────────────────────────────
  if (view === "disconnected") {
    return (
      <Shell>
        <section className="bg-card border-line relative overflow-hidden rounded-[28px] border p-6 shadow-[var(--shadow-card)] sm:p-9">
          <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(59,89,152,0.18),transparent_70%)] blur-2xl" />
          <div className="relative flex flex-col items-center gap-5 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-3xl text-white shadow-[0_10px_30px_rgba(59,89,152,0.45)]" style={{ background: FB }}><Icon name="Megaphone" size={30} /></span>
            <div>
              <h1 className="text-ink text-3xl font-black sm:text-4xl">חבר את Facebook כדי להתחיל</h1>
              <p className="text-muted mx-auto mt-2 max-w-xl text-sm leading-relaxed sm:text-base">ZONO Distribution מתחיל בחיבור ל-Facebook. לאחר החיבור נזהה אוטומטית את הנכסים שלך — ותבחר בדיוק מה לייבא. עד אז לא מוצג דשבורד.</p>
            </div>
            {oauthReady ? (
              // Env configured AND app confirmed LIVE → start the REAL Meta OAuth.
              <a href="/api/oauth/meta/start" className="btn-zono-primary zono-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-base font-black text-white shadow-[var(--shadow-lift)]">
                <Icon name="Send" size={18} /> התחבר עם Facebook
              </a>
            ) : (
              // NOT ready → internal ZONO setup state (never redirect to Meta's
              // "App Not Active"). Distinguish "not live" from "not configured".
              <div className="flex w-full max-w-md flex-col items-center gap-3">
                <div className="bg-warning-soft/60 border-warning/30 w-full rounded-2xl border p-3.5 text-center">
                  <p className="text-ink text-[13px] font-black">
                    {oauthReason === "not_live" ? "האפליקציה עדיין לא פעילה ב-Meta" : "חיבור Facebook עדיין לא פעיל בסביבת השרת"}
                  </p>
                  <p className="text-muted mt-0.5 text-[12px] leading-relaxed">
                    {oauthReason === "not_live"
                      ? "האפליקציה מוגדרת אך נמצאת במצב פיתוח/בדיקת Meta. ניתן לעבוד במצב ידני בינתיים; החיבור הרשמי ייפתח כשה-App יאושר ויוגדר META_OAUTH_ENABLED=true."
                      : "יש להגדיר בשרת את META_APP_ID, META_APP_SECRET, META_OAUTH_REDIRECT_URI (ו-META_OAUTH_ENABLED=true כשה-App פעיל). עד אז ניתן לעבוד במצב ידני / הדגמה."}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button onClick={connect} disabled={pending} className="btn-zono-primary zono-focus-ring inline-flex items-center justify-center gap-2 rounded-2xl px-6 py-3 text-sm font-black text-white shadow-[var(--shadow-lift)] disabled:opacity-60">
                    {pending ? <Spinner size={16} /> : <Icon name="Send" size={16} />} המשך במצב הדגמה
                  </button>
                  <a href="/distribution/groups" className="bg-card border-line text-ink hover:border-brand-light inline-flex items-center gap-1.5 rounded-2xl border px-5 py-3 text-sm font-bold transition"><Icon name="Users" size={15} /> פרסום ידני / קבוצות</a>
                </div>
              </div>
            )}
            {flowErr && <p className="text-danger text-[12px] font-bold">{flowErr}</p>}
            <p className="text-muted text-[12px]">התחברות מאובטחת. לא שומרים סיסמה, לא מבצעים scraping. חיבור Meta רשמי בכפוף לאישור.</p>
          </div>
        </section>

        <section className="bg-card border-line rounded-[22px] border p-5 sm:p-6">
          <h2 className="text-ink mb-4 text-lg font-black">מה ZONO תייבא לאחר החיבור</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {IMPORTS.map((it) => (
              <div key={it.title} className="border-line flex items-start gap-3 rounded-2xl border p-4">
                <span className="bg-brand-soft text-brand grid h-11 w-11 shrink-0 place-items-center rounded-xl"><Icon name={it.icon} size={20} /></span>
                <div className="min-w-0"><p className="text-ink text-sm font-black">{it.title}</p><p className="text-muted mt-0.5 text-[13px] leading-relaxed">{it.body}</p></div>
              </div>
            ))}
          </div>
        </section>
      </Shell>
    );
  }

  // ── STATE 2 — connected, no scan ──────────────────────────────────────────
  if (view === "connected") {
    return (
      <Shell>
        <section className="bg-card border-line relative overflow-hidden rounded-[28px] border p-8 text-center shadow-[var(--shadow-card)]">
          <span className="bg-success-soft text-success mx-auto grid h-16 w-16 place-items-center rounded-3xl"><Icon name="Check" size={32} /></span>
          <h1 className="text-ink mt-4 text-2xl font-black sm:text-3xl">חובר בהצלחה 🎉</h1>
          <p className="text-muted mx-auto mt-2 max-w-md text-sm leading-relaxed">חשבון ה-Facebook מחובר. כעת נריץ סריקה ראשונה כדי לזהות את הקבוצות, העמודים וחשבונות הניהול שלך.</p>
          <button onClick={scan} disabled={pending} className="btn-zono-primary zono-focus-ring mx-auto mt-5 inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-base font-black text-white shadow-[var(--shadow-lift)] disabled:opacity-60">
            <Icon name="Sparkles" size={18} /> התחל סריקה ראשונה
          </button>
          <div className="mt-4"><button onClick={reset} disabled={pending} className="text-muted text-[12px] font-bold underline-offset-2 hover:underline">התנתק</button></div>
        </section>
      </Shell>
    );
  }

  // ── STATE 3 — scanning ────────────────────────────────────────────────────
  if (view === "scanning") {
    return (
      <Shell>
        <section className="bg-card border-line rounded-[28px] border p-6 shadow-[var(--shadow-card)] sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl text-white" style={{ background: FB }}><Spinner size={22} /></span>
            <div><h1 className="text-ink text-xl font-black sm:text-2xl">סורק את חשבון ה-Facebook…</h1><p className="text-muted text-[13px]">מזהה נכסים זמינים — לא מתבצע פרסום.</p></div>
          </div>
          <div className="mt-5 flex flex-col gap-2.5">
            {SCAN_CATS.map((c, i) => {
              const done = i < scanStep, active = i === scanStep;
              return (
                <div key={c.key} className="border-line flex items-center gap-3 rounded-2xl border p-3.5">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${done ? "bg-success-soft text-success" : "bg-surface text-muted"}`}><Icon name={c.icon} size={17} /></span>
                  <span className="text-ink flex-1 text-sm font-bold">{c.label}</span>
                  {done ? <Icon name="Check" size={17} className="text-success" /> : active ? <Spinner size={15} /> : <span className="text-muted text-[11px]">ממתין</span>}
                </div>
              );
            })}
          </div>
        </section>
      </Shell>
    );
  }

  // ── STATE 4 — scanned → import wizard ─────────────────────────────────────
  return <ImportWizard discovery={disc} onReset={reset} onImported={() => router.refresh()} />;
}

function ImportWizard({ discovery, onReset, onImported }: { discovery: FbDiscovery | null; onReset: () => void; onImported: () => void }) {
  const groups = discovery?.groups ?? [];
  const [selected, setSelected] = useState<Set<string>>(() => new Set(groups.map((g) => g.id)));
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const doImport = () => { setErr(null); start(async () => { const r = await fbImportAction([...selected]); if (r.ok) onImported(); else setErr("בחר לפחות קבוצה אחת לייבוא."); }); };

  return (
    <Shell>
      <section className="bg-card border-line rounded-[28px] border p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="bg-success-soft text-success grid h-11 w-11 place-items-center rounded-2xl"><Icon name="Check" size={22} /></span>
            <div><h1 className="text-ink text-xl font-black sm:text-2xl">הסריקה הסתיימה</h1><p className="text-muted text-[13px]">נמצאו {groups.length} קבוצות. בחר אילו לייבא ל-ZONO Distribution.</p></div>
          </div>
          <button onClick={onReset} disabled={pending} className="text-muted text-[12px] font-bold underline-offset-2 hover:underline">התחל מחדש</button>
        </div>

        {/* Honest asset summary */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile icon="Users" label="קבוצות" value={String(groups.length)} tone="text-brand-strong" />
          <Tile icon="Building2" label="עמודים" value="—" note="Meta רשמי" />
          <Tile icon="Layers" label="Business" value="—" note="Meta רשמי" />
          <Tile icon="BarChart3" label="מודעות" value="—" note="Meta רשמי" />
        </div>

        {groups.length === 0 ? (
          <div className="border-line mt-5 rounded-2xl border p-8 text-center">
            <span className="bg-surface text-muted mx-auto grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Users" size={26} /></span>
            <p className="text-ink mt-3 text-sm font-black">לא נמצאו קבוצות בחשבון</p>
            <p className="text-muted mx-auto mt-1 max-w-sm text-[13px]">הוסף קבוצות לספרייה כדי לייבא אותן, ואז חזור לכאן.</p>
            <Link href="/distribution/groups" className="btn-zono-primary zono-focus-ring mt-4 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black text-white">הוסף קבוצות ידנית</Link>
          </div>
        ) : (
          <>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-muted text-[12px] font-bold">{selected.size} נבחרו מתוך {groups.length}</p>
              <div className="flex gap-2 text-[12px] font-bold">
                <button onClick={() => setSelected(new Set(groups.map((g) => g.id)))} className="text-brand">בחר הכל</button>
                <button onClick={() => setSelected(new Set())} className="text-muted">נקה</button>
              </div>
            </div>
            <ul className="mt-2 flex max-h-[42vh] flex-col gap-1.5 overflow-y-auto">
              {groups.map((g) => <GroupRow key={g.id} g={g} checked={selected.has(g.id)} onToggle={() => toggle(g.id)} />)}
            </ul>
            {err && <p className="text-danger mt-2 text-[12px] font-bold">{err}</p>}
            <button onClick={doImport} disabled={pending || selected.size === 0} className="btn-zono-primary zono-focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-3.5 text-base font-black text-white shadow-[var(--shadow-lift)] disabled:opacity-50">
              {pending ? <Spinner size={18} /> : <Icon name="Send" size={18} />} ייבא {selected.size} קבוצות ופתח דשבורד
            </button>
          </>
        )}
      </section>
    </Shell>
  );
}

function GroupRow({ g, checked, onToggle }: { g: FbDiscoveredGroup; checked: boolean; onToggle: () => void }) {
  return (
    <li>
      <button type="button" onClick={onToggle} className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-right transition ${checked ? "border-brand bg-brand-soft/40" : "border-line hover:border-brand/40"}`}>
        <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border ${checked ? "bg-brand border-brand text-white" : "border-line text-transparent"}`}><Icon name="Check" size={14} /></span>
        <span className="min-w-0 flex-1"><span className="text-ink block truncate text-sm font-bold">{g.name}</span><span className="text-muted block truncate text-[11px]">{g.members.toLocaleString("he-IL")} חברים{g.city ? ` · ${g.city}` : ""}{g.audience ? ` · ${g.audience}` : ""}</span></span>
      </button>
    </li>
  );
}

function Tile({ icon, label, value, tone = "text-ink", note }: { icon: string; label: string; value: string; tone?: string; note?: string }) {
  return (
    <div className="bg-surface rounded-2xl p-3 text-center">
      <span className="text-muted inline-flex"><Icon name={icon} size={15} /></span>
      <p className={`text-xl font-black ${tone}`}>{value}</p>
      <p className="text-muted text-[10px] font-bold">{label}{note ? ` · ${note}` : ""}</p>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div dir="rtl" className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8">{children}</div>;
}
