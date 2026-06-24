"use client";
// ============================================================================
// ZONO — חיבורי הפצה (Distribution Connection Center, Phase 10.3).
// Connection MANAGEMENT only. There is NO live Meta API yet: Facebook can be put
// into MANUAL mode (publishing via the Publish Assistant), and the official
// connection is marked "בקרוב" pending Meta approval. Nothing here publishes,
// scrapes, or fakes a "connected" state. Every control calls a real server action.
// ============================================================================
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { cn } from "@/lib/utils";
import type { ConnectionProvider, ConnectionStatus, ProviderConnectionView } from "@/lib/distribution/provider-connections";
import type { FacebookPathView, FacebookPathStatus } from "@/lib/distribution/facebook-connection-paths";
import type { MetaPageDestinationView } from "@/lib/distribution/meta-pages";
import {
  getDistributionConnectionsAction,
  initializeManualFacebookConnectionAction,
  validateProviderConnectionAction,
  disconnectProviderAction,
  refreshExtensionStatusAction,
  syncMetaPagesAction,
} from "@/lib/distribution/provider-connections-actions";

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  not_connected: "לא מחובר", manual_mode: "מצב ידני", pending_approval: "ממתין לאישור Meta",
  connected: "מחובר", expired: "פג תוקף", error: "שגיאה", disconnected: "מנותק",
};
const STATUS_TONE: Record<ConnectionStatus, string> = {
  not_connected: "bg-surface text-muted border-line",
  manual_mode: "bg-amber-50 text-amber-700 border-amber-200",
  pending_approval: "bg-blue-50 text-blue-700 border-blue-200",
  connected: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expired: "bg-red-50 text-red-700 border-red-200",
  error: "bg-red-50 text-red-700 border-red-200",
  disconnected: "bg-surface text-muted border-line",
};

const GROUP_ICON: Record<string, string> = { facebook: "Globe", instagram: "Sparkles", whatsapp: "MessageCircle" };

// ── Phase 17: connection-PATH status labels/tones (two distinct state machines) ──
const PATH_STATUS_LABEL: Record<FacebookPathStatus, string> = {
  // Meta OAuth
  not_connected: "לא מחובר", connected: "מחובר", expired: "פג תוקף", error: "שגיאה",
  // Chrome extension
  not_installed: "לא מותקן", installed: "מותקן", facebook_session_detected: "זוהה חיבור Facebook", ready: "מוכן",
};
const PATH_STATUS_TONE: Record<FacebookPathStatus, string> = {
  not_connected: "bg-surface text-muted border-line",
  connected: "bg-emerald-50 text-emerald-700 border-emerald-200",
  expired: "bg-amber-50 text-amber-700 border-amber-200",
  error: "bg-red-50 text-red-700 border-red-200",
  not_installed: "bg-surface text-muted border-line",
  installed: "bg-blue-50 text-blue-700 border-blue-200",
  facebook_session_detected: "bg-blue-50 text-blue-700 border-blue-200",
  ready: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

function fmt(iso: string | null): string {
  if (!iso) return "טרם נבדק";
  try { return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

export function DistributionConnectionsView({ initial, compliance, paths, metaConfigured = false, metaPages = [] }: { initial: ProviderConnectionView[]; compliance: string[]; paths: { meta: FacebookPathView; extension: FacebookPathView } | null; metaConfigured?: boolean; metaPages?: MetaPageDestinationView[] }) {
  const [conns, setConns] = useState<ProviderConnectionView[]>(initial);
  const [pages, setPages] = useState<MetaPageDestinationView[]>(metaPages);
  const [pagesSynced, setPagesSynced] = useState(false);
  const runner = useActionRunner();

  const refresh = async () => { try { setConns(await getDistributionConnectionsAction()); } catch { /* keep current */ } };

  // Page discovery (GET /me/accounts) — DISCOVERY ONLY, never publishes.
  const onSyncPages = () => runner.run(async () => {
    const r = await syncMetaPagesAction();
    setPagesSynced(true);
    if (r.ok) { setPages(r.pages); return { ok: true, message: r.message }; }
    return { ok: false, message: r.message };
  }, { id: "sync-pages", pendingMessage: "מסנכרן עמודים…", success: (r) => r.message ?? null });

  // The Meta CTA is a real navigation to /api/oauth/meta/start (server redirector).
  // The extension CTA only reads real state — neither fakes a connected/ready status.
  const onCheckExtension = () => runner.run(async () => {
    const r = await refreshExtensionStatusAction();
    return { ok: true, message: r.data?.status === "not_installed" ? "התוסף עדיין לא מותקן/מחובר." : "סטטוס התוסף עודכן." };
  }, { id: "check-extension", pendingMessage: "בודק תוסף…", success: (r) => r.message ?? null });

  const onInitFacebook = () => runner.run(async () => {
    const r = await initializeManualFacebookConnectionAction(); await refresh(); return r;
  }, { id: "init-facebook", pendingMessage: "מפעיל מצב ידני…", success: (r) => r.message ?? null });

  const onValidate = (provider: ConnectionProvider) => runner.run(async () => {
    const r = await validateProviderConnectionAction(provider); await refresh(); return r;
  }, { id: `validate-${provider}`, pendingMessage: "בודק חיבור…", success: (r) => r.message ?? null });

  const onDisconnect = (provider: ConnectionProvider) => runner.run(async () => {
    const r = await disconnectProviderAction(provider); await refresh(); return r;
  }, { id: `disconnect-${provider}`, pendingMessage: "מנתק…", success: (r) => r.message ?? null });

  return (
    <main dir="rtl" className="mx-auto w-full max-w-5xl px-4 py-8">
      {/* Header */}
      <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-3">
          <span className="zono-gradient-glow grid h-11 w-11 place-items-center rounded-2xl text-white"><Icon name="Send" size={22} /></span>
          <div>
            <h1 className="text-ink text-2xl font-black">חיבורי הפצה</h1>
            <p className="text-muted text-sm">חבר את ערוצי ההפצה של המשרד. הפרסום מתבצע כעת ידנית עד לאישור Meta API.</p>
          </div>
        </div>
      </motion.header>

      {(runner.note || runner.error) && (
        <div className={cn("mb-4 rounded-xl border px-4 py-2 text-sm font-semibold",
          runner.error ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
          {runner.error ?? runner.note}
        </div>
      )}

      {/* Two PARALLEL connection types — distinct paths, never the same connection */}
      {paths && (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <PathCard
            path={paths.meta}
            icon="Globe"
            cta={!metaConfigured ? "נדרשת הגדרת Meta" : paths.meta.status === "connected" ? "התחבר מחדש" : paths.meta.status === "expired" || paths.meta.status === "error" ? "התחבר מחדש" : "חבר Meta"}
            href={metaConfigured ? "/api/oauth/meta/start" : undefined}
            disabled={!metaConfigured}
            detail={paths.meta.status === "connected" ? (typeof paths.meta.metadata.account_name === "string" ? `מחובר: ${paths.meta.metadata.account_name}` : "מחובר") : undefined}
            note={metaConfigured ? "חיבור שרת-לשרת רשמי דרך Meta. הטוקנים נשמרים מוצפנים בצד ZONO — בכפוף לאישור Meta." : "כדי להפעיל חיבור Meta יש להגדיר META_APP_ID, META_APP_SECRET, META_OAUTH_REDIRECT_URI, META_GRAPH_VERSION."}
            runner={runner}
          />
          <PathCard
            path={paths.extension}
            icon="Download"
            cta="התקן תוסף Chrome"
            ctaBusyId="check-extension"
            onCta={onCheckExtension}
            note="התוסף פועל בדפדפן שלך. ZONO לעולם לא מקבל סיסמה או עוגיות פייסבוק — רק שולח לתוסף פוסטים מוכנים, והפרסום מתבצע באישורך."
            runner={runner}
          />
        </div>
      )}

      {/* Phase 19: Facebook Pages available under the connected Meta account.
          Discovery only — these are publishing DESTINATIONS, nothing publishes here. */}
      {paths && paths.meta.status === "connected" && (
        <div className="border-line bg-card mb-6 rounded-2xl border p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Icon name="Globe" size={18} className="text-brand" />
              <p className="text-ink font-black">עמודי Facebook זמינים</p>
            </div>
            <Button size="sm" variant="ghost" onClick={onSyncPages} loading={runner.busyId === "sync-pages"}>
              <Icon name="Download" size={14} className="ms-1" /> סנכרן עמודים
            </Button>
          </div>

          {pages.length > 0 ? (
            <div className="mt-4 grid gap-2">
              {pages.map((p) => (
                <div key={p.externalId} className="border-line bg-surface flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-ink truncate text-sm font-bold">{p.name}</p>
                    <p className="text-muted text-xs">{p.category ?? "—"} · עודכן {fmt(p.lastSyncedAt)}</p>
                  </div>
                  <span className="bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold">
                    {p.status === "available" ? "זמין" : p.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted mt-4 text-sm">
              {pagesSynced ? "לא נמצאו עמודי Facebook לניהול בחשבון המחובר" : "לחץ “סנכרן עמודים” כדי למשוך את עמודי ה-Facebook שבניהולך."}
            </p>
          )}
        </div>
      )}

      {/* Manual-mode explainer */}
      <div className="border-line bg-card mb-6 rounded-2xl border p-4">
        <div className="flex items-start gap-3">
          <Icon name="Sparkles" size={20} className="text-brand mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="text-ink font-bold">איך זה עובד כרגע</p>
            <p className="text-muted mt-1 leading-relaxed">
              החיבור הרשמי ל-Facebook דורש אישור Meta והרשאות מתאימות, ונמצא בתהליך. עד אז ZONO פועל ב<strong>מצב פרסום ידני</strong>:
              המערכת מכינה עבורך טקסט, תמונה ויעד מוכנים — ואתה מפרסם בעצמך דרך <Link href="/distribution" className="text-brand underline">מסייע הפרסום הידני</Link>.
            </p>
          </div>
        </div>
      </div>

      {/* Provider cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {conns.map((c) => (
          <ProviderCard key={c.provider} c={c} runner={runner}
            onInitFacebook={onInitFacebook} onValidate={onValidate} onDisconnect={onDisconnect} />
        ))}
      </div>

      {/* Compliance copy */}
      <div className="border-line bg-card mt-6 rounded-2xl border p-4">
        <p className="text-ink mb-2 flex items-center gap-2 text-sm font-bold"><Icon name="Shield" size={16} className="text-brand" /> כללי ציות ופרסום אחראי</p>
        <ul className="text-muted space-y-1 text-sm">
          {compliance.map((line, i) => (
            <li key={i} className="flex gap-2"><span className="text-brand">•</span><span>{line}</span></li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function ProviderCard({
  c, runner, onInitFacebook, onValidate, onDisconnect,
}: {
  c: ProviderConnectionView; runner: ReturnType<typeof useActionRunner>;
  onInitFacebook: () => void; onValidate: (p: ConnectionProvider) => void; onDisconnect: (p: ConnectionProvider) => void;
}) {
  const [open, setOpen] = useState(false);
  const isFacebookMain = c.provider === "facebook";
  const inManual = c.status === "manual_mode";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="border-line bg-card flex flex-col rounded-2xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="bg-surface text-ink grid h-10 w-10 place-items-center rounded-xl"><Icon name={GROUP_ICON[c.group] ?? "Globe"} size={20} /></span>
          <div>
            <p className="text-ink font-bold">{c.hebrewLabel}</p>
            <p className="text-muted text-xs">{c.label}</p>
          </div>
        </div>
        <span className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", STATUS_TONE[c.status])}>{STATUS_LABEL[c.status]}</span>
      </div>

      {/* Status detail */}
      <p className="text-muted mt-3 text-sm leading-relaxed">
        {inManual
          ? "מצב פרסום ידני פעיל — הכן פוסטים ופרסם דרך מסייע הפרסום."
          : isFacebookMain
            ? "החיבור הרשמי דורש אישור Meta. ניתן להפעיל כעת מצב פרסום ידני."
            : "חיבור רשמי דרך Meta API — בקרוב, בכפוף לאישור והרשאות."}
      </p>

      {/* Primary CTAs */}
      <div className="mt-3 flex flex-wrap gap-2">
        {isFacebookMain && !inManual && (
          <Button size="sm" onClick={onInitFacebook} loading={runner.busyId === "init-facebook"}>הפעל מצב פרסום ידני</Button>
        )}
        {/* "Connect" is intentionally disabled until Meta approval — never fakes a connection. */}
        <Button size="sm" variant="secondary" disabled title="דורש אישור Meta API">
          <Icon name="Lock" size={14} className="ms-1" /> חבר Facebook · בקרוב
        </Button>
        {isFacebookMain && (
          <Link href="/distribution"><Button size="sm" variant="ghost"><Icon name="Send" size={14} className="ms-1" /> מסייע פרסום ידני</Button></Link>
        )}
      </div>

      {/* Secondary actions */}
      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={() => onValidate(c.provider)} loading={runner.busyId === `validate-${c.provider}`}>בדוק סטטוס</Button>
        {inManual && (
          <Button size="sm" variant="ghost" onClick={() => onDisconnect(c.provider)} loading={runner.busyId === `disconnect-${c.provider}`}>נתק</Button>
        )}
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-brand text-xs font-bold underline">
          {open ? "הסתר פרטים" : "הרשאות ויעדים עתידיים"}
        </button>
      </div>

      {/* Expandable: future permissions + destinations + provider stub status */}
      {open && (
        <div className="border-line mt-3 space-y-3 border-t pt-3 text-sm">
          <div>
            <p className="text-ink font-bold">הרשאות שיידרשו (לאחר אישור Meta)</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {c.futureScopes.map((s) => <span key={s} className="bg-surface text-muted rounded-md px-2 py-0.5 text-xs font-semibold">{s}</span>)}
            </div>
          </div>
          <div>
            <p className="text-ink font-bold">יעדים שיהיו זמינים בהמשך</p>
            <ul className="text-muted mt-1 space-y-0.5">
              {c.destinationsLater.map((d) => <li key={d} className="flex gap-2"><span className="text-brand">•</span><span>{d}</span></li>)}
            </ul>
          </div>
          <div className="text-muted text-xs">
            <p>בדיקה אחרונה: {fmt(c.lastValidatedAt)}</p>
            <p>סטטוס ספק: {c.providerStubStatus} — {c.providerStubMessage}</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

/**
 * One of the two PARALLEL connection-type cards (Meta OAuth | Chrome extension).
 * Shows the path's distinct status + the destinations it serves. CTAs never
 * fabricate a connected/ready state — Meta returns an honest "in progress",
 * the extension only flips state from a real heartbeat.
 */
function PathCard({
  path, icon, cta, ctaBusyId, onCta, href, disabled, detail, note, runner,
}: {
  path: FacebookPathView; icon: string; cta: string; ctaBusyId?: string;
  onCta?: () => void; href?: string; disabled?: boolean; detail?: string;
  note: string; runner: ReturnType<typeof useActionRunner>;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="border-line bg-card flex flex-col rounded-2xl border p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="zono-gradient-glow grid h-10 w-10 place-items-center rounded-xl text-white"><Icon name={icon} size={20} /></span>
          <div>
            <p className="text-ink font-black">{path.title}</p>
            <p className="text-muted mt-0.5 text-xs leading-relaxed">{path.description}</p>
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold", PATH_STATUS_TONE[path.status])}>{PATH_STATUS_LABEL[path.status]}</span>
      </div>

      {/* Destinations this path serves — makes the two paths' scopes explicit. */}
      <div className="mt-3">
        <p className="text-ink text-xs font-bold">יעדים דרך מסלול זה</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {path.destinations.map((d) => (
            <span key={d} className="bg-surface text-muted rounded-md px-2 py-0.5 text-xs font-semibold">{d}</span>
          ))}
        </div>
      </div>

      {detail ? (
        <p className="text-ink mt-3 text-xs font-bold">{detail}</p>
      ) : null}

      <p className="text-muted mt-3 text-xs leading-relaxed">{note}</p>

      <div className="mt-3">
        {href ? (
          // Real navigation (e.g. /api/oauth/meta/start) — a styled link, not a fake action.
          <a
            href={href}
            className="zono-gradient-glow inline-flex items-center rounded-xl px-3.5 py-2 text-sm font-bold text-white"
          >
            <Icon name={icon} size={14} className="ms-1" /> {cta}
          </a>
        ) : disabled ? (
          <Button size="sm" disabled>
            <Icon name={icon} size={14} className="ms-1" /> {cta}
          </Button>
        ) : (
          <Button size="sm" onClick={onCta} loading={ctaBusyId ? runner.busyId === ctaBusyId : false}>
            <Icon name={icon} size={14} className="ms-1" /> {cta}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
