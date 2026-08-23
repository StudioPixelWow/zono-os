"use client";
// ============================================================================
// ZONO — Internal Remote E-Signature: broker panel (client). "שלח לחתימה מרחוק".
// Explicitly distinct from manual signing. Sends a secure signing link by email,
// tracks each request's lifecycle, allows revoke, and opens the signed artifact.
// ============================================================================
import { useEffect, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import {
  sendForRemoteSignatureAction,
  revokeSignatureRequestAction,
  listSignatureRequestsAction,
  getSignedArtifactUrlAction,
  type SignatureRequestRow,
} from "@/lib/e-signature/actions";

const STATUS_HE: Record<string, string> = {
  draft: "טיוטה", ready: "מוכן לחתימה", sent: "נשלח", opened: "נצפה",
  signed: "נחתם", completed: "הושלם", expired: "פג תוקף", revoked: "בוטל",
};
const isDone = (s: string) => s === "completed" || s === "signed";

export function RemoteSignaturePanel({ documentId }: { documentId: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [rows, setRows] = useState<SignatureRequestRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => listSignatureRequestsAction(documentId).then((r) => { if (r.ok) setRows(r.data); });
  useEffect(() => { load(); }, [documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    if (!email.includes("@")) { setMsg("כתובת מייל לא תקינה."); return; }
    setBusy(true); setMsg(null);
    const r = await sendForRemoteSignatureAction({ documentId, recipientName: name, recipientEmail: email, recipientPhone: phone || null });
    if (r.ok) { setMsg("נשלח קישור חתימה למייל."); setName(""); setEmail(""); setPhone(""); await load(); }
    else setMsg(r.error);
    setBusy(false);
  };
  const revoke = async (id: string) => { setBusy(true); const r = await revokeSignatureRequestAction(id); if (!r.ok) setMsg(r.error); await load(); setBusy(false); };
  const openSigned = async (id: string) => { const r = await getSignedArtifactUrlAction(id); if (r.ok) window.open(r.data.url, "_blank", "noopener"); else setMsg(r.error); };

  return (
    <div className="border-line rounded-2xl border p-3.5">
      <div className="mb-2 flex items-center gap-2">
        <span className="bg-brand-soft text-brand grid h-7 w-7 place-items-center rounded-lg"><Icon name="Send" size={14} /></span>
        <h3 className="text-ink text-[13px] font-black">שלח לחתימה מרחוק</h3>
      </div>
      <p className="text-muted mb-2 text-[11px] leading-relaxed">חתימה אלקטרונית פנימית — הלקוח מקבל קישור מאובטח במייל, קורא וחותם. נבדל מ״רישום חתימה ידנית״.</p>

      <div className="flex flex-col gap-1.5">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הנמען" className="border-line text-ink rounded-lg border px-2.5 py-1.5 text-[12.5px] outline-none" />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="אימייל" type="email" className="border-line text-ink rounded-lg border px-2.5 py-1.5 text-[12.5px] outline-none" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="טלפון (רשות)" type="tel" className="border-line text-ink rounded-lg border px-2.5 py-1.5 text-[12.5px] outline-none" />
        <button onClick={send} disabled={busy || !email.includes("@")} className="bg-brand inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[12.5px] font-bold text-white transition hover:opacity-90 disabled:opacity-60">
          <Icon name="Send" size={13} />שלח קישור חתימה
        </button>
      </div>

      {msg && <p className="text-brand-strong mt-2 text-[11.5px] font-bold">{msg}</p>}

      {rows.length > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.id} className="border-line rounded-lg border p-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-ink truncate text-[12px] font-bold">{r.recipientName}</p>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${isDone(r.status) ? "bg-success-soft text-success" : r.status === "revoked" || r.status === "expired" ? "bg-surface text-muted" : "bg-brand-soft text-brand"}`}>{STATUS_HE[r.status] ?? r.status}</span>
              </div>
              <p className="text-muted truncate text-[10.5px]">{r.recipientEmail}</p>
              <div className="mt-1 flex items-center gap-3">
                {isDone(r.status)
                  ? <button onClick={() => openSigned(r.id)} className="text-brand-strong inline-flex items-center gap-0.5 text-[11px] font-bold"><Icon name="FileCheck2" size={12} />פתח מסמך חתום</button>
                  : (r.status !== "revoked" && r.status !== "expired") && <button onClick={() => revoke(r.id)} disabled={busy} className="text-muted hover:text-ink text-[11px] font-bold">בטל בקשה</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
