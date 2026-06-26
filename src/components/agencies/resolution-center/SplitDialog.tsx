"use client";
import { useEffect, useState } from "react";
import { Modal, ModalActions } from "./Modal";
import { Button } from "@/components/ui/Button";
import { splitAgencyAction, getAgencyChildrenAction } from "@/lib/agencies/resolution-center/resolutionCenterActions";
import type { AgencyLite } from "@/lib/agencies/resolution-center/resolutionCenterFormat";
import type { AgencyChildren } from "@/lib/agencies/resolution-center/resolutionCenterRepository";

const IN = "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink";
const empty: AgencyChildren = { agents: [], relationships: [], signals: [], aliases: [] };

function CheckList({ title, items, sel, toggle }: { title: string; items: { id: string; label: string }[]; sel: Set<string>; toggle: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="border-line/70 rounded-lg border p-2">
      <div className="text-ink mb-1 text-xs font-bold">{title}</div>
      <div className="max-h-28 space-y-0.5 overflow-auto">
        {items.map((i) => (
          <label key={i.id} className="flex items-center gap-2 text-[11px]">
            <input type="checkbox" checked={sel.has(i.id)} onChange={() => toggle(i.id)} />
            <span className="text-ink truncate">{i.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

/** Split selected children out of an agency into a new agency. */
export function SplitDialog({ open, source, onClose, onDone }: {
  open: boolean; source: AgencyLite | null; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [children, setChildren] = useState<AgencyChildren>(empty);
  const [newName, setNewName] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !source) return;
    getAgencyChildrenAction(source.id).then((r) => { if (r.ok) setChildren(r.data); });
  }, [open, source]);

  if (!source) return null;
  const toggle = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const ids = (items: { id: string }[]) => items.filter((i) => sel.has(i.id)).map((i) => i.id);

  const doSplit = async () => {
    if (!newName.trim()) { setErr("נדרש שם למשרד החדש."); return; }
    setBusy(true); setErr(null);
    const res = await splitAgencyAction(source.id, newName.trim(), {
      agentIds: ids(children.agents), relationshipIds: ids(children.relationships),
      signalIds: ids(children.signals), aliasIds: ids(children.aliases),
    }, reason || undefined);
    setBusy(false);
    if (res.ok) onDone(`נוצר משרד חדש: ${newName.trim()}.`); else setErr(res.error);
  };

  return (
    <Modal open={open} title={`פיצול · ${source.name}`} onClose={onClose}
      footer={<ModalActions onCancel={onClose}><Button onClick={doSplit} loading={busy}>צור משרד חדש</Button></ModalActions>}>
      {err && <div className="border-danger/40 bg-danger-soft/40 text-danger mb-3 rounded-lg border px-3 py-2 text-sm">{err}</div>}
      <input className={IN} placeholder="שם המשרד החדש" value={newName} onChange={(e) => setNewName(e.target.value)} />
      <p className="text-muted my-2 text-xs">בחר אילו פריטים להעביר למשרד החדש. המקור נשמר.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CheckList title="מתווכים" items={children.agents} sel={sel} toggle={toggle} />
        <CheckList title="קשרים / נכסים" items={children.relationships} sel={sel} toggle={toggle} />
        <CheckList title="אותות" items={children.signals} sel={sel} toggle={toggle} />
        <CheckList title="כינויים" items={children.aliases} sel={sel} toggle={toggle} />
      </div>
      <textarea className={`${IN} mt-3`} rows={2} placeholder="סיבת הפיצול (לאודיט)" value={reason} onChange={(e) => setReason(e.target.value)} />
    </Modal>
  );
}
