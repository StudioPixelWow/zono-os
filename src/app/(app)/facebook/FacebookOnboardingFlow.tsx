"use client";
// ============================================================================
// 📘 ZONO — Facebook Onboarding Flow (client). State-driven across the REAL
// Meta OAuth lifecycle:
//   STATE 1 not-configured / not-live → internal setup card (never hits Meta's
//            "App Not Active"); OR not-connected → premium Connect gate.
//   STATE 2 connected, no sync → "Connected as {user}" + start first sync.
//   STATE 3 syncing            → live progress.
//   STATE 4 synced             → import wizard: REAL Pages / Business Managers /
//            Ad Accounts counts + honest per-asset permission states; group
//            import from the library; refresh; manual group fallback.
// STATE 5 (dashboard) is rendered by the page ONLY after import.
// Nothing here publishes. Manual/assisted publishing stays available throughout.
// ============================================================================
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";
import { Spinner } from "@/components/ui/Button";
import { fbConnectAction, fbScanAction, fbImportAction, fbResetAction, fbRefreshAction } from "@/lib/facebook-onboarding/actions";
import type { FbOnboardingState, FbDiscovery, FbDiscoveredGroup, FbAssetStatus } from "@/lib/facebook-onboarding/service";

type View = "disconnected" | "connected" | "scanning" | "scanned";
const FB = "linear-gradient(135deg,#3b5998,#5b7bd5)";

const IMPORTS: { icon: string; title: string; body: string }[] = [
  { icon: "Building2", title: "עמודי Facebook", body: "העמודים שבניהולך — לפרסום ומעקב." },
  { icon: "Users", title: "קבוצות", body: "הקבוצות שלך — תבחר אילו לייבא." },
  { icon: "Layers", title: "Business Managers", body: "חשבונות הניהול העסקי המקושרים." },
  { icon: "BarChart3", title: "חשבונות מודעות", body: "Ad Accounts לתקצוב ומדידה." },
];
const SCAN_CATS: { key: string; icon: string; label: string }[] = [
  { key: "groups", icon: "Users", label: "קבוצות" },
  { key: "pages", icon: "Building2", label: "עמודים" },
  { key: "businessManagers", icon: "Layers", label: "Business Managers" },
  { key: "adAccounts", icon: "BarChart3", label: "חשבונות מודעות" },
];

/** Honest short note for a non-OK asset status. */
const STATUS_NOTE: Record<FbAssetStatus, string> = {
  ok: "",
  permission: "לא זמין בהרשאות",
  expired: "החיבור פג",
  unavailable: "לא זמין",
};

export function FacebookOnboardingFlow({
  state, discovery, apiConnected = false, connectedUser = null, oauthReady = false, oauthReason = "not_configured",
}: {
  state: FbOnboardingState;
  discovery: FbDiscovery | null;
  apiConnected?: boolean;
  connectedUser?: string | null;
  oauthReady?: boolean;
  oauthReason?: "ready" | "not_live" | "not_configured";
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(state === "scanned" ? "scanned" : state === "connected" ? "connected" : "disconnected");
  const [disc, setDisc] = useState<FbDiscovery | null>(discovery);
  const [pending, start] = useTransition();
  const [scanStep, setScanStep] = useState(0);
  const [flowErr, setFlowErr] = useState<string | null>(null);
  const scanTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (scanTimer.current) clearInterval(scanTimer.current); }, []);

  // Simulated/demo connect (used only when official Meta OAuth env is not set).
  const connect = () => { setFlowErr(null); start(async () => { try { const r = await fbConnectAction(); if (r.ok) setView("connected"); else setFlowErr("החיבור נכשל. נסה שוב."); } catch { setFlowErr("החיבור נכשל. נסה שוב."); } }); };
  const reset = () => start(async () => { try { await fbResetAction(); } catch { /* ignore */ } setView("disconnected"); setDisc(null); router.refresh(); });

  const scan = () => {
    setView("scanning"); setScanStep(0); setFlowErr(null);
    if (scanTimer.current) clearInterval(scanTimer.current);
    scanTimer.current = setInterval(() => setScanStep((s) => Math.min(s + 1, SCAN_CATS.length)), 550);
    start(async () => {
      try {
        const r = await fbScanAction();
        if (scanTimer.current) clearInterval(scanTimer.current);
        setScanStep(SCAN_CATS.length);
        setTimeout(() => { setDisc(r.discovery); setView("scanned"); }, 350);
      } catch {
        if (scanTimer.current) clearInterval(scanTimer.current);
        setFlowErr("הסנכרון נכשל. נסה שוב.");
        setView("connected");
      }
    });
  };

  // Refresh the real connection (re-sync Pages / BM / Ad Accounts / permissions).
  const refresh = () => start(async () => { try { const r = await fbRefreshAction(); setDisc(r.discovery); } catch { /* keep prior */ } });

  // ── STATE 1 — disconnected ────────────────────────────────────────────────
  if (view === "disconnected") {
    return (
      <Shell>
        <section className="bg-card border-line relative overflow-hidden rounded-[28px] border p-6 shadow-[var(--shadow-card)] sm:p-9">
          <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(59,89,152,0.18),transparent_70%)] blur-2xl" />
          <div className="relative flex flex-col items-center gap-5 text-center">
            <span className="grid h-16 w-16 place-items-center rounded-3xl text-white shadow-[0_10px_30px_rgba(59,89,152,0.45)]" style={{ background: FB }}><Icon name="Megaphone" size={30} /></span>
            <div>
              <h1 className="text-ink text-3xl font-black sm:text-4xl">חבר את חשבון Facebook שלך</h1>
              <p className="text-muted mx-auto mt-2 max-w-xl text-sm leading-relaxed sm:text-base">כל סוכן מחבר את החשבון האישי שלו כדי ש-ZONO יזהה את הקבוצות, הדפים והרשאות הפרסום שלו. לאחר החיבור תבחר בדיוק מה לייבא — עד אז לא מוצג דשבורד.</p>
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
                    {oauthReason === "not_live" ? "אפליקציית Meta עדיין לא פעילה או ממתינה לאישור" : "חיבור Facebook עדיין לא הוגדר בסביבת השרת"}
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

  // ── STATE 2 — connected, no sync ──────────────────────────────────────────
  if (view === "connected") {
    return (
      <Shell>
        <section className="bg-card border-line relative overflow-hidden rounded-[28px] border p-8 text-center shadow-[var(--shadow-card)]">
          <span className="bg-success-soft text-success mx-auto grid h-16 w-16 place-items-center rounded-3xl"><Icon name="Check" size={32} /></span>
          <h1 className="text-ink mt-4 text-2xl font-black sm:text-3xl">חובר בהצלחה 🎉</h1>
          <p className="text-muted mx-auto mt-2 max-w-md text-sm leading-relaxed">
            {apiConnected && connectedUser
              ? <>מחובר כ-<span className="text-ink font-black">{connectedUser}</span>. זהו החיבור האישי שלך — סוכנים אחרים צריכים להתחבר בנפרד. כעת נריץ סנכרון ראשון כדי לזהות את העמודים, הקבוצות וחשבונות הניהול שלך.</>
              : <>חשבון ה-Facebook האישי שלך מחובר. כעת נריץ סריקה ראשונה כדי לזהות את הקבוצות, העמודים וחשבונות הניהול שלך.</>}
          </p>
          {flowErr && <p className="text-danger mt-2 text-[12px] font-bold">{flowErr}</p>}
          <button onClick={scan} disabled={pending} className="btn-zono-primary zono-focus-ring mx-auto mt-5 inline-flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-base font-black text-white shadow-[var(--shadow-lift)] disabled:opacity-60">
            <Icon name="Sparkles" size={18} /> {apiConnected ? "התחל סנכרון ראשון" : "התחל סריקה ראשונה"}
          </button>
          <div className="mt-4 flex items-center justify-center gap-4">
            <button onClick={reset} disabled={pending} className="text-muted text-[12px] font-bold underline-offset-2 hover:underline">{apiConnected ? "התחל מחדש" : "התנתק"}</button>
            {apiConnected && <Link href="/settings/distribution-connections" className="text-muted text-[12px] font-bold underline-offset-2 hover:underline">ניהול חיבור</Link>}
          </div>
        </section>
      </Shell>
    );
  }

  // ── STATE 3 — syncing ─────────────────────────────────────────────────────
  if (view === "scanning") {
    return (
      <Shell>
        <section className="bg-card border-line rounded-[28px] border p-6 shadow-[var(--shadow-card)] sm:p-8">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-2xl text-white" style={{ background: FB }}><Spinner size={22} /></span>
            <div><h1 className="text-ink text-xl font-black sm:text-2xl">{apiConnected ? "מסנכרן את חשבון ה-Facebook…" : "סורק את חשבון ה-Facebook…"}</h1><p className="text-muted text-[13px]">מזהה נכסים זמינים — לא מתבצע פרסום.</p></div>
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

  // ── STATE 4 — synced → import wizard ──────────────────────────────────────
  return <ImportWizard discovery={disc} onReset={reset} onRefresh={refresh} refreshing={pending} onImported={() => router.refresh()} />;
}

function ImportWizard({ discovery, onReset, onRefresh, refreshing, onImported }: { discovery: FbDiscovery | null; onReset: () => void; onRefresh: () => void; refreshing: boolean; onImported: () => void }) {
  const groups = discovery?.groups ?? [];
  const real = discovery?.mode === "real";
  const [selected, setSelected] = useState<Set<string>>(() => new Set(groups.map((g) => g.id)));
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const doImport = () => { setErr(null); start(async () => { const r = await fbImportAction([...selected]); if (r.ok) onImported(); else setErr("בחר לפחות קבוצה אחת לייבוא."); }); };

  // Honest partial-permission warnings (real mode only).
  const warnings: { icon: string; text: string }[] = [];
  if (real) {
    if (discovery?.health === "expired") warnings.push({ icon: "AlertTriangle", text: "תוקף החיבור פג. יש להתחבר מחדש ל-Meta כדי לרענן את הנתונים." });
    if (discovery?.adAccountsStatus && discovery.adAccountsStatus !== "ok") warnings.push({ icon: "BarChart3", text: "חשבונות מודעות לא זמינים בהרשאות הנוכחיות." });
    if (discovery?.businessesStatus && discovery.businessesStatus !== "ok") warnings.push({ icon: "Layers", text: "Business Manager לא זמין בהרשאות הנוכחיות." });
    // Meta does not expose group discovery under current permissions — always manual.
    warnings.push({ icon: "Users", text: "Meta לא מאפשרת לזהות קבוצות אוטומטית בהרשאות הנוכחיות. אפשר להוסיף קבוצות ידנית." });
  }

  return (
    <Shell>
      <section className="bg-card border-line rounded-[28px] border p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="bg-success-soft text-success grid h-11 w-11 place-items-center rounded-2xl"><Icon name="Check" size={22} /></span>
            <div>
              <h1 className="text-ink text-xl font-black sm:text-2xl">{real ? "הסנכרון הסתיים" : "הסריקה הסתיימה"}</h1>
              <p className="text-muted text-[13px]">
                {real && discovery?.connectedUser && <>מחובר כ-<span className="text-ink font-bold">{discovery.connectedUser}</span> (החיבור האישי שלך) · </>}
                נמצאו {groups.length} קבוצות בספרייה. בחר אילו לייבא ל-ZONO Distribution.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {real && (
              <button onClick={onRefresh} disabled={refreshing} className="text-brand inline-flex items-center gap-1.5 text-[12px] font-bold underline-offset-2 hover:underline disabled:opacity-50">
                {refreshing ? <Spinner size={13} /> : <Icon name="RefreshCw" size={13} />} רענן חיבור Facebook
              </button>
            )}
            <button onClick={onReset} disabled={pending} className="text-muted text-[12px] font-bold underline-offset-2 hover:underline">התחל מחדש</button>
          </div>
        </div>

        {/* Real asset summary — counts when available, honest status otherwise. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <AssetTile icon="Building2" label="עמודים" count={discovery?.pages ?? null} status={real ? discovery?.pagesStatus : undefined} real={real} />
          <Tile icon="Users" label="קבוצות" value={String(groups.length)} tone="text-brand-strong" />
          <AssetTile icon="Layers" label="Business" count={discovery?.businessManagers ?? null} status={real ? discovery?.businessesStatus : undefined} real={real} />
          <AssetTile icon="BarChart3" label="מודעות" count={discovery?.adAccounts ?? null} status={real ? discovery?.adAccountsStatus : undefined} real={real} />
        </div>

        {/* Partial-permission / health warnings */}
        {warnings.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {warnings.map((w, i) => (
              <div key={i} className="bg-warning-soft/50 border-warning/30 flex items-start gap-2.5 rounded-2xl border p-3">
                <span className="text-warning mt-0.5 shrink-0"><Icon name={w.icon} size={15} /></span>
                <p className="text-ink text-[12px] font-semibold leading-relaxed">{w.text}</p>
              </div>
            ))}
            {discovery?.health === "expired" && (
              <a href="/api/oauth/meta/start" className="btn-zono-primary zono-focus-ring inline-flex items-center justify-center gap-2 self-start rounded-xl px-4 py-2 text-[12px] font-black text-white">
                <Icon name="RefreshCw" size={14} /> התחבר מחדש ל-Meta
              </a>
            )}
          </div>
        )}

        {groups.length === 0 ? (
          <div className="border-line mt-5 rounded-2xl border p-8 text-center">
            <span className="bg-surface text-muted mx-auto grid h-14 w-14 place-items-center rounded-2xl"><Icon name="Users" size={26} /></span>
            <p className="text-ink mt-3 text-sm font-black">לא נמצאו קבוצות בספרייה</p>
            <p className="text-muted mx-auto mt-1 max-w-sm text-[13px]">הוסף קבוצות ידנית (הדבקת קישורים, עיר, שכונה, תיקייה) ואז חזור לכאן כדי לייבא אותן.</p>
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
            <Link href="/distribution/groups" className="text-muted mt-3 inline-flex items-center gap-1.5 text-[12px] font-bold underline-offset-2 hover:underline"><Icon name="Plus" size={13} /> הוסף עוד קבוצות ידנית</Link>
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

/** Asset tile that shows a real count when available, else an honest status. */
function AssetTile({ icon, label, count, status, real }: { icon: string; label: string; count: number | null; status?: FbAssetStatus; real: boolean }) {
  if (!real) return <Tile icon={icon} label={label} value="—" note="Meta רשמי" />;
  if (status === "ok" && count !== null) return <Tile icon={icon} label={label} value={String(count)} tone={count > 0 ? "text-ink" : "text-muted"} />;
  const note = status ? STATUS_NOTE[status] : "לא זמין";
  return <Tile icon={icon} label={label} value="—" note={note} />;
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
