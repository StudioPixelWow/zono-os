"use client";
import { useState } from "react";
import { Modal, ModalActions } from "./Modal";
import { Button } from "@/components/ui/Button";
import { editAgencyAction } from "@/lib/agencies/resolution-center/resolutionCenterActions";
import type { AgencyLite } from "@/lib/agencies/resolution-center/resolutionCenterFormat";

const IN = "w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-ink";
const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block"><span className="text-muted mb-1 block text-xs font-semibold">{label}</span>{children}</label>
);

/** Edit an agency's clean identity (display/legal/brand/branch/city/contact/aliases). */
export function EditAgencyDialog({ open, agency, onClose, onDone }: {
  open: boolean; agency: AgencyLite | null; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [displayName, setDisplayName] = useState(agency?.displayName ?? agency?.name ?? "");
  const [legalName, setLegalName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [city, setCity] = useState(agency?.city ?? "");
  const [website, setWebsite] = useState(agency?.website ?? "");
  const [phone, setPhone] = useState(agency?.phone ?? "");
  const [email, setEmail] = useState(agency?.email ?? "");
  const [aliases, setAliases] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!agency) return null;

  const save = async () => {
    setBusy(true); setErr(null);
    const res = await editAgencyAction(agency.id, {
      displayName: displayName || null, legalName: legalName || null, brandName: brandName || null,
      headquartersCity: city || null, website: website || null, phone: phone || null, email: email || null,
      aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean), notes: notes || null,
    }, notes || undefined);
    setBusy(false);
    if (res.ok) onDone("המשרד עודכן בהצלחה."); else setErr(res.error);
  };

  return (
    <Modal open={open} title={`עריכת משרד · ${agency.name}`} onClose={onClose}
      footer={<ModalActions onCancel={onClose}><Button onClick={save} loading={busy}>שמור</Button></ModalActions>}>
      {err && <div className="border-danger/40 bg-danger-soft/40 text-danger mb-3 rounded-lg border px-3 py-2 text-sm">{err}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="שם תצוגה"><input className={IN} value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></Field>
        <Field label="שם משפטי"><input className={IN} value={legalName} onChange={(e) => setLegalName(e.target.value)} /></Field>
        <Field label="מותג / רשת"><input className={IN} value={brandName} onChange={(e) => setBrandName(e.target.value)} /></Field>
        <Field label="עיר"><input className={IN} value={city} onChange={(e) => setCity(e.target.value)} /></Field>
        <Field label="אתר"><input className={IN} value={website} onChange={(e) => setWebsite(e.target.value)} dir="ltr" /></Field>
        <Field label="טלפון"><input className={IN} value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" /></Field>
        <Field label="אימייל"><input className={IN} value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" /></Field>
        <Field label="כינויים (מופרדים בפסיק)"><input className={IN} value={aliases} onChange={(e) => setAliases(e.target.value)} /></Field>
      </div>
      <div className="mt-3"><Field label="הערות / סיבת עריכה"><textarea className={IN} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>
    </Modal>
  );
}
