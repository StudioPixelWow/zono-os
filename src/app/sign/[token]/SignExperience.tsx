"use client";
// ============================================================================
// ZONO — Public signing experience (client). Document review → draw signature →
// consent → sign. Mobile-first, RTL, Hebrew. No ZONO shell / CRM / internal links.
// The signature is a drawn canvas image; on submit it POSTs to /api/sign/[token],
// which does all validation + the atomic completion server-side.
// ============================================================================
import { useRef, useState, useEffect } from "react";
import type { ResolvedSigningRequest } from "@/lib/e-signature/service";

const ERR_HE: Record<string, string> = {
  expired: "הקישור פג תוקף.", revoked: "הבקשה בוטלה.", document_changed: "המסמך עודכן — פנה/י לסוכן/ת לקישור חדש.",
  consent_required: "יש לאשר את ההסכמה לפני החתימה.", invalid_signature: "החתימה לא נקלטה — נסה/י שוב.",
  invalid_token: "הקישור אינו תקין.", email_failed: "שגיאה זמנית.",
};

export function SignExperience({ token, data }: { token: string; data: ResolvedSigningRequest }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ at: string | null } | null>(null);

  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const ratio = window.devicePixelRatio || 1;
    c.width = c.clientWidth * ratio; c.height = c.clientHeight * ratio;
    ctx.scale(ratio, ratio); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#111827";
  }, []);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e: React.PointerEvent) => { drawing.current = true; const ctx = canvasRef.current!.getContext("2d")!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); (e.target as Element).setPointerCapture?.(e.pointerId); };
  const move = (e: React.PointerEvent) => { if (!drawing.current) return; const ctx = canvasRef.current!.getContext("2d")!; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); setHasDrawn(true); };
  const up = () => { drawing.current = false; };
  const clear = () => { const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setHasDrawn(false); };

  const submit = async () => {
    if (!hasDrawn) { setError("יש לצייר חתימה."); return; }
    if (!consent) { setError(ERR_HE.consent_required); return; }
    setBusy(true); setError(null);
    try {
      const signatureDataUrl = canvasRef.current!.toDataURL("image/png");
      const res = await fetch(`/api/sign/${encodeURIComponent(token)}`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ signatureDataUrl, consent: true }),
      });
      const j = await res.json();
      if (j.ok) setDone({ at: j.signedAt ?? null });
      else setError(ERR_HE[j.error] ?? "השליחה נכשלה, נסה/י שוב.");
    } catch { setError("שגיאת רשת — נסה/י שוב."); }
    finally { setBusy(false); }
  };

  if (done) {
    return (
      <div dir="rtl" style={S.page}>
        <div style={{ ...S.card, textAlign: "center" }}>
          <div style={{ fontSize: 44 }}>✅</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: "6px 0" }}>תודה, המסמך נחתם בהצלחה</h1>
          <p style={{ color: "#4b5563", fontSize: 14 }}>{data.documentTitle}</p>
          {done.at && <p style={{ color: "#6b7280", fontSize: 13 }}>נחתם: {(() => { try { return new Date(done.at).toLocaleString("he-IL"); } catch { return done.at; } })()}</p>}
          <p style={{ color: "#6b7280", fontSize: 13, marginTop: 10 }}>{data.officeName}{data.agentName ? ` · ${data.agentName}` : ""}</p>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" style={S.page}>
      <div style={S.card}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          {data.agentAvatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.agentAvatarUrl} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
          )}
          <div>
            <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "#111827" }}>{data.officeName}</p>
            {data.agentName && <p style={{ margin: 0, fontSize: 12.5, color: "#6b7280" }}>{data.agentName}</p>}
          </div>
        </div>
        <h1 style={{ fontSize: 18, fontWeight: 800, margin: "4px 0" }}>{data.documentTitle}</h1>
        {data.propertyLabel && <p style={{ color: "#6b7280", fontSize: 13, margin: "0 0 4px" }}>{data.propertyLabel}</p>}
        <p style={{ color: "#4b5563", fontSize: 13, margin: "0 0 12px" }}>שלום {data.recipientName}, אנא קרא/י את המסמך וחתום/מי בתחתית.</p>

        <div style={S.docBox}><div dangerouslySetInnerHTML={{ __html: data.renderedBody }} /></div>

        <p style={{ fontWeight: 700, fontSize: 14, margin: "18px 0 6px" }}>חתימה</p>
        <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          style={{ width: "100%", height: 160, border: "1px dashed #c4b5fd", borderRadius: 12, background: "#faf9ff", touchAction: "none", display: "block" }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <button onClick={clear} style={{ background: "none", border: "none", color: "#6d28d9", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>נקה חתימה</button>
          <span style={{ fontSize: 12, color: "#9ca3af" }}>ציירו את החתימה במסגרת</span>
        </div>

        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "16px 0", fontSize: 12.5, color: "#374151", lineHeight: 1.5 }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 2 }} />
          אני מאשר/ת כי קראתי את המסמך וכי חתימתי האלקטרונית מהווה אישור למסמך זה.
        </label>

        {error && <p style={{ color: "#b91c1c", fontSize: 13, fontWeight: 700 }}>{error}</p>}

        <button onClick={submit} disabled={busy} style={{ width: "100%", background: busy ? "#a78bfa" : "#6d28d9", color: "#fff", border: "none", borderRadius: 12, padding: "13px", fontSize: 15, fontWeight: 800, cursor: busy ? "default" : "pointer" }}>
          {busy ? "חותם…" : "אני מאשר/ת וחותם/מת"}
        </button>
        <p style={{ textAlign: "center", fontSize: 10.5, color: "#9ca3af", marginTop: 10 }}>חתימה אלקטרונית פנימית — אינה חתימה דיגיטלית מאושרת/מוסמכת.</p>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f6f5fb", fontFamily: "Arial, sans-serif", padding: "20px 14px" },
  card: { maxWidth: 560, margin: "0 auto", background: "#fff", border: "1px solid #ece9f6", borderRadius: 18, padding: "22px 20px" },
  docBox: { maxHeight: 340, overflow: "auto", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 16px", background: "#fff", fontSize: 13.5, lineHeight: 1.6, color: "#1f2937" },
};
