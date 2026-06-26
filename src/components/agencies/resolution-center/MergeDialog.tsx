"use client";
import { useEffect, useState } from "react";
import { Modal, ModalActions } from "./Modal";
import { Button } from "@/components/ui/Button";
import { mergeAgencyAction, searchAgenciesAction } from "@/lib/agencies/resolution-center/resolutionCenterActions";
import type { AgencyLite } from "@/lib/agencies/resolution-center/resolutionCenterFormat";

const IN = "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink";

/** Merge the current (duplicate) agency into a chosen primary agency. Never deletes. */
export function MergeDialog({ open, duplicate, onClose, onDone }: {
  open: boolean; duplicate: AgencyLite | null; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; city: string | null }[]>([]);
  const [target, setTarget] = useState<{ id: string; name: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    searchAgenciesAction(query).then((r) => { if (active && r.ok) setResults(r.data.filter((a) => a.id !== duplicate?.id)); });
    return () => { active = false; };
  }, [query, open, duplicate?.id]);

  if (!duplicate) return null;
  const doMerge = async () => {
    if (!target) { setErr("בחר משרד יעד למיזוג."); return; }
    setBusy(true); setErr(null);
    const res = await mergeAgencyAction(target.id, duplicate.id, reason || undefined);
    setBusy(false);
    if (res.ok) onDone(`מוזג בהצלחה לתוך ${target.name}.`); else setErr(res.error);
  };

  return (
    <Modal open={open} title={`מיזוג · ${duplicate.name}`} onClose={onClose}
      footer={<ModalActions onCancel={onClose}><Button onClick={doMerge} loading={busy}>מזג</Button></ModalActions>}>
      {err && <div className="border-danger/40 bg-danger-soft/40 text-danger mb-3 rounded-lg border px-3 py-2 text-sm">{err}</div>}
      <p className="text-muted mb-2 text-xs">כל המתווכים, הנכסים, הקשרים, האותות והכינויים יועברו למשרד היעד. המשרד הנוכחי יסומן כ&quot;מוזג&quot; ולא יימחק.</p>
      <input className={IN} placeholder="חפש משרד יעד…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="mt-2 max-h-52 space-y-1 overflow-auto">
        {results.length === 0 ? <div className="text-muted text-xs">אין תוצאות.</div> : results.map((a) => (
          <button key={a.id} onClick={() => setTarget({ id: a.id, name: a.name })}
            className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-right text-sm ${target?.id === a.id ? "border-brand bg-brand-soft/30" : "border-line/70 hover:bg-line/40"}`}>
            <span className="text-ink font-semibold">{a.name}</span>
            <span className="text-muted text-xs">{a.city ?? ""}</span>
          </button>
        ))}
      </div>
      <textarea className={`${IN} mt-3`} rows={2} placeholder="סיבת המיזוג (לאודיט)" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}
