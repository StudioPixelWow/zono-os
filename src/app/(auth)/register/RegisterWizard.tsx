"use client";
// ============================================================================
// 💳 ZONO — Registration wizard (client). Six steps + progress bar + step
// transitions, RTL, mobile-responsive. Each step validates server-side; the
// draft is resumable (cookie). The final step creates a PENDING payment and
// redirects to Grow — activation happens later, only via the verified webhook.
// ============================================================================
import { useEffect, useState, useTransition } from "react";
import { ensureDraftAction, saveStepAction, saveOwnerAction, startPaymentAction } from "@/lib/commercial/actions";
import { planCards } from "@/lib/commercial/plans";
import { WIZARD_STEPS, type PlanTier, type RegistrationData } from "@/lib/commercial/types";
import type { FieldError } from "@/lib/commercial/validation";

const CARDS = planCards();

export function RegisterWizard() {
  const [idx, setIdx] = useState(0);
  const [data, setData] = useState<RegistrationData>({ integrations: {} });
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [pending, start] = useTransition();

  useEffect(() => {
    ensureDraftAction().then((d) => {
      if (d) { setData({ integrations: {}, ...d.data }); setIdx(Math.min(Math.max((d.currentStep ?? 1) - 1, 0), WIZARD_STEPS.length - 1)); }
    }).catch(() => undefined);
  }, []);

  const step = WIZARD_STEPS[idx];
  const err = (f: string) => errors.find((e) => e.field === f)?.message;
  const set = (patch: Partial<RegistrationData>) => setData((d) => ({ ...d, ...patch }));

  const next = () => start(async () => {
    setErrors([]);
    if (step.key === "owner") {
      const r = await saveOwnerAction(data, password, passwordConfirm);
      if (r.errors.length) { setErrors(r.errors); return; }
    } else if (step.key !== "integrations" && step.key !== "welcome") {
      const r = await saveStepAction(step.key, data);
      if (r.errors.length) { setErrors(r.errors); return; }
    }
    if (step.key === "integrations") {
      const r = await startPaymentAction();
      if (r.errors?.length) { setErrors(r.errors); return; }
      if (r.url) window.location.href = r.url;
      return;
    }
    setIdx((i) => Math.min(i + 1, WIZARD_STEPS.length - 1));
  });

  const back = () => setIdx((i) => Math.max(i - 1, 0));
  const pct = Math.round(((idx + 1) / WIZARD_STEPS.length) * 100);

  return (
    <div dir="rtl" className="mx-auto flex min-h-screen w-full max-w-[640px] flex-col gap-6 px-4 py-10">
      {/* Progress */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-[11px] font-bold">
          <span className="text-brand">שלב {idx + 1} מתוך {WIZARD_STEPS.length} · {step.label}</span>
          <span className="text-muted">{pct}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2,#eee)]">
          <div className="bg-brand h-full rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div key={step.key} className="bg-card border-line animate-[fadeIn_.3s_ease] rounded-[20px] border p-6 shadow-[var(--shadow-card)]">
        {step.key === "welcome" && (
          <div className="flex flex-col gap-3 text-center">
            <div className="text-3xl">🏢</div>
            <h1 className="text-ink text-2xl font-black">ברוכים הבאים ל-ZONO</h1>
            <p className="text-muted text-sm">מערכת ההפעלה החכמה למשרד התיווך שלך — מודיעין נכסים, התאמת קונים, מסעות לקוח וניהול משרד במקום אחד. ההרשמה לוקחת כ-3 דקות, וההפעלה מיידית עם השלמת התשלום.</p>
          </div>
        )}

        {step.key === "company" && (
          <Grid>
            <Field label="שם המשרד" v={data.officeName} on={(v) => set({ officeName: v })} e={err("officeName")} />
            <Field label="שם החברה" v={data.companyName} on={(v) => set({ companyName: v })} e={err("companyName")} />
            <Field label="ח.פ / עוסק" v={data.taxId} on={(v) => set({ taxId: v })} e={err("taxId")} />
            <Field label="עיר" v={data.city} on={(v) => set({ city: v })} e={err("city")} />
            <Field label="כתובת" v={data.address} on={(v) => set({ address: v })} />
            <Field label="טלפון" v={data.phone} on={(v) => set({ phone: v })} e={err("phone")} />
            <Field label="אתר (אופציונלי)" v={data.website} on={(v) => set({ website: v })} />
            <Field label="לוגו — קישור (אופציונלי)" v={data.logoUrl} on={(v) => set({ logoUrl: v })} />
          </Grid>
        )}

        {step.key === "owner" && (
          <Grid>
            <Field label="שם מלא" v={data.ownerFullName} on={(v) => set({ ownerFullName: v })} e={err("ownerFullName")} />
            <Field label="אימייל" type="email" v={data.ownerEmail} on={(v) => set({ ownerEmail: v })} e={err("ownerEmail")} />
            <Field label="נייד" v={data.ownerMobile} on={(v) => set({ ownerMobile: v })} e={err("ownerMobile")} />
            <Field label="סיסמה" type="password" v={password} on={setPassword} e={err("password")} />
            <Field label="אישור סיסמה" type="password" v={passwordConfirm} on={setPasswordConfirm} e={err("passwordConfirm")} />
          </Grid>
        )}

        {step.key === "office" && (
          <Grid>
            <Field label="מספר סוכנים" type="number" v={data.agentCount != null ? String(data.agentCount) : ""} on={(v) => set({ agentCount: v === "" ? undefined : Number(v) })} e={err("agentCount")} />
            <Field label="אזורי פעילות (מופרד בפסיקים)" v={(data.workingAreas ?? []).join(", ")} on={(v) => set({ workingAreas: v.split(",").map((s) => s.trim()).filter(Boolean) })} e={err("workingAreas")} />
            <div className="flex flex-col gap-1">
              <label className="text-ink text-[12px] font-bold">סוג התיווך</label>
              <select value={data.brokerageType ?? ""} onChange={(e) => set({ brokerageType: e.target.value })} className="border-line rounded-[12px] border px-3 py-2 text-sm">
                <option value="">בחר…</option>
                <option value="residential">מגורים</option>
                <option value="commercial">מסחרי</option>
                <option value="mixed">מעורב</option>
              </select>
            </div>
          </Grid>
        )}

        {step.key === "plan" && (
          <div className="flex flex-col gap-3">
            <h2 className="text-ink text-lg font-black">בחר תוכנית</h2>
            {err("planTier") ? <p className="text-danger text-[11px]">{err("planTier")}</p> : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {CARDS.map((c) => {
                const sel = data.planTier === c.tier;
                return (
                  <button key={c.tier} type="button" onClick={() => set({ planTier: c.tier as PlanTier })}
                    className={`flex flex-col gap-2 rounded-[16px] border p-4 text-right ${sel ? "border-brand bg-[var(--brand-soft,#f0eefe)]" : "border-line"}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-ink text-sm font-black">{c.label}{c.highlight ? " ⭐" : ""}</span>
                      <span className="text-brand text-sm font-black">{c.monthlyIls == null ? "בהתאמה" : `₪${c.monthlyIls}/חודש`}</span>
                    </div>
                    <span className="text-muted text-[11px]">{c.seats < 0 ? "משתמשים ללא הגבלה" : `עד ${c.seats} משתמשים`}</span>
                    <ul className="text-muted flex flex-col gap-0.5 text-[11px]">{c.features.slice(0, 4).map((f) => <li key={f.key}>· {f.label}</li>)}</ul>
                  </button>
                );
              })}
            </div>
            {data.planTier ? <p className="text-muted text-[11px]">נבחר: <b className="text-ink">{CARDS.find((c) => c.tier === data.planTier)?.label}</b></p> : null}
          </div>
        )}

        {step.key === "integrations" && (
          <div className="flex flex-col gap-3">
            <h2 className="text-ink text-lg font-black">אינטגרציות מומלצות</h2>
            <p className="text-muted text-[12px]">ניתן לחבר עכשיו או בהמשך — לא חובה.</p>
            {(["google", "facebook", "whatsapp", "email"] as const).map((k) => (
              <label key={k} className="border-line flex items-center justify-between rounded-[12px] border px-3 py-2">
                <span className="text-ink text-[13px] font-bold">{{ google: "Google", facebook: "Facebook", whatsapp: "WhatsApp", email: "Email" }[k]}</span>
                <input type="checkbox" checked={!!data.integrations?.[k]} onChange={(e) => set({ integrations: { ...data.integrations, [k]: e.target.checked } })} />
              </label>
            ))}
          </div>
        )}
      </div>

      {errors.find((e) => e.field === "_") ? <p className="text-danger text-center text-[12px]">{errors.find((e) => e.field === "_")?.message}</p> : null}

      <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={back} disabled={idx === 0 || pending} className="text-muted rounded-full px-4 py-2 text-sm font-bold disabled:opacity-40">חזרה</button>
        <button type="button" onClick={next} disabled={pending} className="bg-brand rounded-full px-6 py-2.5 text-sm font-black text-white disabled:opacity-60">
          {pending ? "…" : step.key === "integrations" ? "המשך לתשלום ←" : step.key === "welcome" ? "בואו נתחיל ←" : "הבא ←"}
        </button>
      </div>
      <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}
function Field({ label, v, on, e, type = "text" }: { label: string; v?: string; on: (v: string) => void; e?: string; type?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-ink text-[12px] font-bold">{label}</label>
      <input type={type} value={v ?? ""} onChange={(ev) => on(ev.target.value)} className={`rounded-[12px] border px-3 py-2 text-sm ${e ? "border-danger" : "border-line"}`} />
      {e ? <span className="text-danger text-[10px]">{e}</span> : null}
    </div>
  );
}
