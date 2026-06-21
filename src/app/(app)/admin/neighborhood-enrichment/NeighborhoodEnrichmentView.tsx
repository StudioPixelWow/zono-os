"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button, Spinner } from "@/components/ui/Button";
import {
  exportNeighborhoodsAction, processNextBatchAction, queueCitiesAction, resetEnrichmentAction,
} from "@/lib/neighborhood-enrichment/actions";
import type { CoverageRow, EnrichmentStatus } from "@/lib/neighborhood-enrichment/service";

const STATUS_TONE: Record<string, string> = { done: "text-success", empty: "text-muted", failed: "text-danger", pending: "text-warning" };
const STATUS_LABEL: Record<string, string> = { done: "הושלם", empty: "ריק", failed: "נכשל", pending: "ממתין" };

/** Decode a localities CSV (UTF-8 or Windows-1255) and extract code + name. */
async function parseLocalities(file: File): Promise<{ city_code: string; city_name: string; row_index: number }[]> {
  const buf = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buf);
  if (text.includes("�")) text = new TextDecoder("windows-1255").decode(buf);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const out: { city_code: string; city_name: string; row_index: number }[] = [];
  for (let i = 1; i < lines.length; i++) { // skip header
    const cols = lines[i].split(",");
    const code = (cols[0] ?? "").replace(/["']/g, "").trim();
    const name = (cols[1] ?? "").replace(/["']/g, "").trim();
    if (code && name) out.push({ city_code: code, city_name: name, row_index: i });
  }
  return out;
}

export function NeighborhoodEnrichmentView({ status, coverage }: { status: EnrichmentStatus; coverage: CoverageRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  // Live progress during the loop; null = show the fresh server status (so the
  // button re-enables correctly after upload/refresh, not a stale snapshot).
  const [live, setLive] = useState<{ done: number; empty: number; failed: number; remaining: number } | null>(null);
  const view = live ?? { done: status.done, empty: status.empty, failed: status.failed, remaining: status.remaining };
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const addLog = (s: string) => setLog((l) => [`${new Date().toLocaleTimeString("he-IL")} · ${s}`, ...l].slice(0, 200));

  const onUpload = async (file: File) => {
    setError(null); setNote(null); setBusy("upload");
    try {
      const rows = await parseLocalities(file);
      if (!rows.length) { setError("לא נמצאו ערים בקובץ."); return; }
      const r = await queueCitiesAction(rows);
      setNote(`הועלו ${r.queued} ערים לתור. לחץ ״התחל עיבוד״.`);
      router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "שגיאה בקריאת הקובץ"); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ""; }
  };

  const runLoop = async () => {
    if (!status.configured) { setError("OPENAI_API_KEY לא מוגדר."); return; }
    setError(null); setNote(null); setRunning(true); stopRef.current = false;
    let acc = { done: status.done, empty: status.empty, failed: status.failed, remaining: status.remaining };
    try {
      // Resumable loop: each batch persists to the DB, so a reload continues.
      while (!stopRef.current) {
        const r = await processNextBatchAction(3);
        acc = { done: acc.done + r.done, empty: acc.empty + r.empty, failed: acc.failed + r.failed, remaining: r.remaining };
        setLive({ ...acc });
        for (const c of r.cities) addLog(c.error ? `${c.city}: ✗ ${c.error}` : `${c.city}: ${c.count} שכונות · ${STATUS_LABEL[c.status] ?? c.status}`);
        // If every city in the batch failed with the same API error, surface it
        // loudly — that's almost always an OpenAI key/quota/model problem, not data.
        if (r.lastError && r.done === 0 && r.empty === 0 && r.failed > 0) {
          setError(`שגיאת OpenAI חוזרת: ${r.lastError} — בדוק מפתח/מכסה/הרשאת מודל בחשבון ה-API.`);
        }
        if (r.remaining <= 0 || r.processed === 0) { addLog("✓ העיבוד הושלם"); break; }
        await new Promise((res) => setTimeout(res, 400));
      }
    } catch (e) { setError(e instanceof Error ? e.message : "שגיאה בעיבוד"); }
    finally { setRunning(false); setLive(null); router.refresh(); }
  };

  const exportCsv = async (kind: "neighborhoods" | "coverage") => {
    setBusy(kind);
    try {
      let csv = "";
      if (kind === "coverage") {
        csv = "city_code,city_name,neighborhoods_count,confidence_summary,status\n" +
          coverage.map((c) => [c.city_code, c.city_name, c.neighborhoods_count, c.confidence_summary ?? "", c.status].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      } else {
        const rows = await exportNeighborhoodsAction();
        csv = "city_code,city_name,neighborhood_name,normalized_name,confidence_score,confidence_level,status\n" +
          rows.map((r) => [r.city_code, r.city_name, r.neighborhood_name, r.normalized_name ?? "", r.confidence_score ?? "", r.confidence_level ?? "", r.status ?? ""].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      }
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = kind === "coverage" ? "neighborhood_coverage_report.csv" : "neighborhoods_export.csv";
      a.click(); URL.revokeObjectURL(a.href);
    } catch (e) { setError(e instanceof Error ? e.message : "שגיאת ייצוא"); }
    finally { setBusy(null); }
  };

  const pct = status.total ? Math.round(((view.done + view.empty + view.failed) / status.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-brand-soft flex flex-wrap items-center justify-between gap-3 rounded-[22px] p-5">
        <div>
          <p className="text-brand text-xs font-bold">Admin · Neighborhood Enrichment</p>
          <h1 className="text-ink mt-1 text-2xl font-black">העשרת שכונות (AI)</h1>
          <p className="text-muted mt-1 text-sm">העלה קובץ ערים, והמערכת תחקור עיר-אחר-עיר את השכונות האמיתיות (AI), תשמור ל-DB ותמשיך מאיפה שנעצרה. ללא אזורים מלאכותיים.</p>
        </div>
        <Link href="/" className="text-brand-strong inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold"><Icon name="ArrowLeft" size={15} />דשבורד</Link>
      </div>

      {!status.configured && <p className="bg-warning-soft text-warning rounded-xl px-3 py-2 text-sm font-semibold">⚠ OPENAI_API_KEY לא מוגדר — העיבוד לא יפעל עד שיוגדר.</p>}
      {note && <p className="bg-success-soft text-success rounded-xl px-3 py-2 text-sm font-semibold">{note}</p>}
      {error && <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>}

      {/* Upload + controls */}
      <div className="bg-card border-line flex flex-wrap items-center gap-3 rounded-[20px] border p-4">
        <input ref={fileRef} type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} className="hidden" id="loc-file" />
        <Button onClick={() => fileRef.current?.click()} loading={busy === "upload"} disabled={running} leadingIcon={<Icon name="Plus" size={15} />}>העלה קובץ ערים</Button>
        {status.total > 0 && (running
          ? <Button variant="danger" onClick={() => { stopRef.current = true; }} leadingIcon={<Icon name="Minus" size={15} />}>עצור</Button>
          : <Button onClick={runLoop} disabled={!status.configured || view.remaining <= 0} leadingIcon={<Icon name="Sparkles" size={16} />}>{view.remaining > 0 ? "התחל / המשך עיבוד" : "הכל עובד ✓"}</Button>)}
        <Button size="sm" variant="secondary" onClick={() => exportCsv("neighborhoods")} loading={busy === "neighborhoods"} disabled={running}>ייצוא שכונות CSV</Button>
        <Button size="sm" variant="secondary" onClick={() => exportCsv("coverage")} loading={busy === "coverage"} disabled={running}>ייצוא דוח כיסוי</Button>
        {running && <span className="text-brand-strong inline-flex items-center gap-1.5 text-sm font-bold"><Spinner size={15} />מעבד…</span>}
      </div>

      {/* Progress */}
      {status.total > 0 && (
        <div className="bg-card border-line rounded-[20px] border p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-ink font-extrabold">התקדמות</span>
            <span className="text-muted">{view.done + view.empty + view.failed} / {status.total} ערים · {pct}%</span>
          </div>
          <div className="bg-surface h-2.5 w-full overflow-hidden rounded-full"><div className="bg-brand h-full rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Stat label="סה״כ ערים" value={status.total} tone="text-brand-strong" />
            <Stat label="הושלמו" value={view.done} tone="text-success" />
            <Stat label="ריקות" value={view.empty} tone="text-muted" />
            <Stat label="נכשלו" value={view.failed} tone="text-danger" />
            <Stat label="שכונות שנשמרו" value={status.neighborhoods} tone="text-brand-strong" />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Live log */}
        <div className="bg-card border-line rounded-[20px] border p-4">
          <p className="text-ink mb-2 text-sm font-extrabold">יומן עיבוד</p>
          {log.length === 0 ? <p className="text-muted text-sm">אין פעילות עדיין.</p> : (
            <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto text-[12px]">{log.map((l, i) => <li key={i} className="text-muted">{l}</li>)}</ul>
          )}
        </div>

        {/* Coverage report */}
        <div className="bg-card border-line overflow-hidden rounded-[20px] border">
          <p className="text-ink border-line border-b p-4 text-sm font-extrabold">דוח כיסוי</p>
          {coverage.length === 0 ? <p className="text-muted p-4 text-sm">אין נתונים עדיין.</p> : (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-surface text-muted sticky top-0 text-[11px] font-bold"><tr>{["עיר", "שכונות", "ביטחון", "סטטוס"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr></thead>
                <tbody>
                  {coverage.map((c) => (
                    <tr key={c.city_code} className="border-line border-t">
                      <td className="text-ink px-3 py-1.5 font-semibold">{c.city_name}</td>
                      <td className="text-ink px-3 py-1.5 font-bold">{c.neighborhoods_count}</td>
                      <td className="text-muted px-3 py-1.5 text-[10px]">{c.confidence_summary ?? "—"}</td>
                      <td className={cn("px-3 py-1.5 text-[11px] font-bold", STATUS_TONE[c.status] ?? "text-muted")}>{STATUS_LABEL[c.status] ?? c.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {status.total > 0 && (
        <button onClick={() => { if (confirm("לאפס את כל תור ההעשרה? (השכונות שנשמרו יישארו)")) { setBusy("reset"); resetEnrichmentAction().then(() => router.refresh()).finally(() => setBusy(null)); } }} disabled={running || busy === "reset"} className="text-danger self-start text-[12px] font-bold disabled:opacity-50">אפס תור</button>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="bg-surface rounded-xl p-2.5 text-center">
      <p className={cn("text-lg font-black", tone)}>{value.toLocaleString("he-IL")}</p>
      <p className="text-muted text-[10px] font-bold">{label}</p>
    </div>
  );
}
