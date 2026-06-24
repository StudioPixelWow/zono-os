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
import {
  getDistributionConnectionsAction,
  initializeManualFacebookConnectionAction,
  validateProviderConnectionAction,
  disconnectProviderAction,
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

function fmt(iso: string | null): string {
  if (!iso) return "טרם נבדק";
  try { return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return "—"; }
}

export function DistributionConnectionsView({ initial, compliance }: { initial: ProviderConnectionView[]; compliance: string[] }) {
  const [conns, setConns] = useState<ProviderConnectionView[]>(initial);
  const runner = useActionRunner();

  const refresh = async () => { try { setConns(await getDistributionConnectionsAction()); } catch { /* keep current */ } };

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
