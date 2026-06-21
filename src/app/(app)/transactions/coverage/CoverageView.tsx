"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button, Spinner } from "@/components/ui/Button";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { addCoverageNeighborhoodAction, autoDiscoverNeighborhoodsAction, ensureCoverageTargetsAction, retryFailedSyncsAction, syncCoverageTargetAction } from "@/lib/transactions/actions";
import type { CoverageBoard } from "@/lib/transactions/service";

const STATUS_LABEL: Record<string, string> = { pending: "ממתין", ready: "מוכן", syncing: "מסנכרן", completed: "הושלם", failed: "נכשל", disabled: "מושבת", pending_neighborhoods: "ממתין לשכונות" };
const STATUS_TONE: Record<string, string> = { completed: "text-success", failed: "text-danger", syncing: "text-warning", pending: "text-muted", pending_neighborhoods: "text-warning", disabled: "text-muted" };
const fmt = (s: string | null) => (s ? new Date(s).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

export function CoverageView({ board }: { board: CoverageBoard }) {
  const { targets, logs, needsConfig, agentCity, apifyConfigured } = board;
  const runner = useActionRunner();
  const { pending, busyId } = runner;
  const [newHood, setNewHood] = useState("");

  const discover = () => runner.run(autoDiscoverNeighborhoodsAction, {
    id: "discover", pendingMessage: "מגלה שכונות מ-OpenStreetMap ומעסקאות שכבר נמשכו…",
    success: (r) => r.needsConfig ? "לא הוגדר אזור עבודה — הגדר עיר בפרופיל תחילה."
      : r.discovered === 0 ? "לא נמצאו שכונות חדשות לעיר זו כרגע. נסה להוסיף שכונה ידנית למטה."
      : `נמצאו ${r.discovered} שכונות · נוצרו ${r.created} אזורי כיסוי חדשים${r.sources.length ? ` (מקורות: ${r.sources.join(", ")})` : ""}.`,
  });
  const ensure = () => runner.run(ensureCoverageTargetsAction, {
    id: "ensure", pendingMessage: "יוצר אזורי כיסוי לפי אזור העבודה…",
    success: (r) => r.needsConfig ? "לא הוגדר אזור עבודה." : `נוצרו ${r.created} אזורי כיסוי${r.largeCityWarning ? " · עיר גדולה — מומלץ כיסוי לפי שכונות" : ""}.`,
  });
  const retry = () => runner.run(retryFailedSyncsAction, {
    id: "retry", pendingMessage: "מנסה שוב סנכרונים שנכשלו…",
    success: (r) => r.retried === 0 ? "אין סנכרונים שנכשלו לנסות מחדש." : `נוסו מחדש ${r.retried} · יובאו ${r.imported} עסקאות.`,
  });
  const syncTarget = (id: string, label: string) => runner.run(() => syncCoverageTargetAction(id), {
    id, pendingMessage: `מסנכרן עסקאות · ${label}…`,
    success: (r) => r.error ? `שגיאה: ${r.error}` : `${label}: יובאו ${r.imported} · כפילויות ${r.duplicates} · סה״כ ${r.total}${r.mock ? " (נתוני הדגמה)" : ""}.`,
  });
  const addHood = () => {
    const n = newHood.trim(); if (!n) return; setNewHood("");
    runner.run(() => addCoverageNeighborhoodAction(n), {
      pendingMessage: `מוסיף את השכונה "${n}" לכיסוי…`,
      success: (r) => r.created ? `נוספה שכונה: ${r.name} (${r.city}). לחץ ״סנכרן״ בשורה כדי למשוך עסקאות.` : `השכונה "${n}" כבר קיימת בכיסוי.`,
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Transactions · Coverage</p>
          <h1 className="text-ink mt-1 text-2xl font-black">כיסוי דאטה{agentCity ? ` · ${agentCity}` : ""}</h1>
          <p className="text-muted mt-1 text-sm">כל שורה היא אזור משיכה אחד (עיר/שכונה). בערים גדולות מומלץ כיסוי לפי שכונות — סנכרון עיר אחד אינו מבטיח כיסוי מלא.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/transactions" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />עסקאות</Link>
          <Button size="sm" variant="secondary" onClick={retry} loading={busyId === "retry"} disabled={pending} leadingIcon={<Icon name="Clock" size={15} />}>נסה כשלונות שוב</Button>
          <Button size="sm" variant="secondary" onClick={ensure} loading={busyId === "ensure"} disabled={pending} leadingIcon={<Icon name="Plus" size={15} />}>צור אזורי כיסוי</Button>
          <Button onClick={discover} loading={busyId === "discover"} disabled={pending} leadingIcon={<Icon name="Sparkles" size={16} />}>{busyId === "discover" ? "מגלה…" : "גלה שכונות אוטומטית"}</Button>
        </div>
      </div>
      {!apifyConfigured && <p className="bg-warning-soft text-warning rounded-xl px-3 py-2 text-sm font-semibold">⚠ APIFY_TOKEN לא מוגדר — סנכרון יחזיר נתוני הדגמה בסביבת פיתוח בלבד.</p>}
      <ActionFeedback runner={runner} />

      {!needsConfig && (
        <div className="bg-card border-line flex flex-wrap items-end gap-3 rounded-[20px] border p-4">
          <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-sm">
            <span className="text-muted text-[11px] font-bold">הוסף שכונה לכיסוי (כל שכונה = משיכה נפרדת ברדיוס 700מ׳)</span>
            <input value={newHood} onChange={(e) => setNewHood(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addHood(); }} placeholder="לדוגמה: גבעת הרקפות, צבעוני, נווה גנים…" className="border-line rounded-xl border px-3 py-2" />
          </label>
          <Button onClick={addHood} loading={busyId === "__global__"} disabled={pending || !newHood.trim()} leadingIcon={<Icon name="Plus" size={15} />}>הוסף שכונה</Button>
        </div>
      )}

      {needsConfig ? (
        <div className="bg-card border-line rounded-[20px] border p-6 text-center">
          <p className="text-ink font-extrabold">לא הוגדר אזור עבודה</p>
          <p className="text-muted mt-1 text-sm">הגדר עיר/שכונות בפרופיל ואז ״צור אזורי כיסוי״.</p>
        </div>
      ) : (
        <div className="bg-card border-line overflow-hidden rounded-[20px] border">
          <table className="w-full text-right text-sm">
            <thead className="bg-surface text-muted text-[11px] font-bold">
              <tr>{["עיר", "שכונה", "סטטוס", "עסקאות שנמצאו", "סנכרון אחרון", "שגיאה", ""].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
            </thead>
            <tbody>
              {targets.length === 0 ? (
                <tr><td colSpan={7} className="text-muted px-3 py-6 text-center">אין אזורי כיסוי — לחץ ״צור אזורי כיסוי״.</td></tr>
              ) : targets.map((t) => (
                <tr key={t.id} className="border-line border-t">
                  <td className="text-ink px-3 py-2 font-semibold">{t.city_name}</td>
                  <td className="text-muted px-3 py-2">{t.neighborhood_name ?? "— (כלל-עירוני)"}</td>
                  <td className={cn("px-3 py-2 font-bold", STATUS_TONE[t.coverage_status] ?? "text-muted")}>{STATUS_LABEL[t.coverage_status] ?? t.coverage_status}</td>
                  <td className="text-ink px-3 py-2 font-bold">{t.transactions_found}</td>
                  <td className="text-muted px-3 py-2 whitespace-nowrap">{fmt(t.last_sync_at)}</td>
                  <td className="text-danger px-3 py-2 text-[11px]">{t.last_error ?? "—"}</td>
                  <td className="px-3 py-2"><button className="text-brand-strong inline-flex items-center gap-1 text-[11px] font-bold disabled:opacity-50" disabled={pending} onClick={() => syncTarget(t.id, t.neighborhood_name ?? t.city_name)}>{busyId === t.id && <Spinner size={11} />}{busyId === t.id ? "מסנכרן…" : "סנכרן"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div>
        <p className="text-ink mb-2 text-sm font-extrabold">יומני סנכרון אחרונים</p>
        <div className="bg-card border-line rounded-[20px] border p-4">
          {logs.length === 0 ? <p className="text-muted text-sm">אין יומנים עדיין.</p> : (
            <ul className="flex flex-col gap-1.5 text-sm">{logs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-ink min-w-0 flex-1 truncate font-semibold">{l.city_name}{l.neighborhood_name ? ` · ${l.neighborhood_name}` : ""} <span className={cn("text-[10px]", STATUS_TONE[l.status] ?? "text-muted")}>· {STATUS_LABEL[l.status] ?? l.status}</span></span>
                <span className="text-muted text-[11px]">יובאו {l.records_imported} · כפילויות {l.duplicates_skipped} · {fmt(l.created_at)}</span>
                {l.error_message && <span className="text-danger text-[10px]">{l.error_message}</span>}
              </li>
            ))}</ul>
          )}
        </div>
      </div>
    </div>
  );
}
