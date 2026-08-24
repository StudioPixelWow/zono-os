"use client";
// ============================================================================
// ZONO — Team & Access (/team). The manager surface for the office ROSTER +
// ZONO SEAT ACCESS + billing impact. office_member = person; a paid seat = an
// active ZONO user. Roster-only members cost nothing; access is granted via the
// canonical invitation flow (never a password). Billing changes are STAGED and
// take effect next cycle. Analytics is preserved under "תובנות צוות".
// ============================================================================
import { useMemo, useState, useTransition, type ReactNode } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { AgentAvatar } from "@/components/office/AgentAvatar";
import { TeamView } from "./TeamView";
import type { TeamBoard } from "@/lib/team/service";
import type { TeamSeats, TeamSeatMember } from "@/lib/team-admin/team-seats";
import { ACCESS_LABEL_HE, seatBillingPreview, ilsMonthly, type AccessState } from "@/lib/team-admin/seats";
import { createOfficeMemberAction } from "@/lib/office/roster-actions";
import { createInvitationAction, setUserStatusAction } from "@/lib/team-admin/actions";
import type { BillingAccessDecision } from "@/lib/commercial/billing-access";

const ROLE_HE: Record<string, string> = { owner: "מנהל/ת המשרד", manager: "מנהל/ת", agent: "מתווך/ת" };
const ACCESS_TONE: Record<AccessState, string> = {
  ACTIVE: "bg-success-soft text-success", INVITED: "bg-brand-soft text-brand-strong",
  SUSPENDED: "bg-warning-soft text-warning", NO_ACCESS: "bg-card text-muted border-line border",
};
type Filter = "all" | "ACTIVE" | "NO_ACCESS" | "INVITED" | "SUSPENDED";
const FILTERS: { k: Filter; label: string }[] = [
  { k: "all", label: "הכל" }, { k: "ACTIVE", label: "פעילים" }, { k: "NO_ACCESS", label: "ללא גישה" },
  { k: "INVITED", label: "מוזמנים" }, { k: "SUSPENDED", label: "מושהים" },
];

export function TeamSeatsView({ seats, board, billing }: { seats: TeamSeats; board: TeamBoard; billing?: BillingAccessDecision | null }) {
  const [tab, setTab] = useState<"team" | "insights">("team");
  const [filter, setFilter] = useState<Filter>("all");
  const [adding, setAdding] = useState(false);
  const [access, setAccess] = useState<{ member: TeamSeatMember; kind: "grant" | "suspend" | "reactivate" } | null>(null);

  const s = seats.summary;
  const rows = useMemo(() => filter === "all" ? seats.members : seats.members.filter((m) => m.access === filter), [seats.members, filter]);

  return (
    <div dir="rtl" className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-ink text-2xl font-black">צוות וגישה</h1>
          <p className="text-muted mt-1 text-[14px]">נהלו את אנשי המשרד, הגישה ל-ZONO והחיוב החודשי.</p>
        </div>
        <button type="button" onClick={() => setAdding(true)} className="bg-brand inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white transition hover:opacity-90"><Icon name="UserPlus" size={16} />הוספת איש צוות</button>
      </header>

      <BillingBanner billing={billing} />
      {billing?.restricted && (
        <p className="text-warning bg-warning-soft rounded-xl px-3 py-2 text-[12.5px] font-bold">בזמן שהמנוי ממתין להסדרה — צפייה בנתונים נשמרת, אך הוספת/הפעלת אנשי צוות בתשלום זמינה שוב רק לאחר הסדרת התשלום.</p>
      )}

      {/* Tabs */}
      <div className="border-line flex gap-1 border-b">
        {[["team", "צוות וגישה"], ["insights", "תובנות צוות"]].map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k as "team" | "insights")}
            className={`-mb-px border-b-2 px-3.5 py-2 text-[14px] font-bold transition ${tab === k ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}>{label}</button>
        ))}
      </div>

      {tab === "insights" ? <TeamView board={board} /> : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="אנשים במשרד" value={s.people} />
            <Stat label="משתמשים פעילים" value={s.activeSeats} tone="text-success" />
            <Stat label="ללא גישה" value={s.noAccess} />
            <Stat label="הזמנות פתוחות" value={s.invited} />
            <Stat label="חיוב חודשי" text={ilsMonthly(s.monthlyIls)} />
          </div>

          {/* Seat expansion nudge (tasteful, not salesy) */}
          {s.noAccess > 0 && (
            <div className="border-line bg-brand-soft/40 flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3">
              <span className="text-ink text-[13px] font-bold">{s.activeSeats} מתוך {s.people} מאנשי הצוות מחוברים ל-ZONO</span>
              <span className="text-muted text-[12px]">הפעלת גישה לאיש צוות נוסף: +{ilsMonthly(seats.billing.unitPriceIls)} לחודש · יחול במחזור הבא</span>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button key={f.k} type="button" onClick={() => setFilter(f.k)}
                className={`rounded-full px-3 py-1.5 text-[12.5px] font-bold transition ${filter === f.k ? "bg-brand text-white" : "border-line text-muted hover:text-ink border"}`}>{f.label}</button>
            ))}
          </div>

          {/* Roster */}
          <div className="flex flex-col gap-2">
            {rows.length === 0 ? <p className="text-muted py-8 text-center text-[14px]">אין אנשי צוות בקטגוריה זו.</p> :
              rows.map((m) => <MemberRow key={m.id} m={m} onAccess={(kind) => setAccess({ member: m, kind })} />)}
          </div>
        </>
      )}

      {adding && <AddMemberModal unitPriceIls={seats.billing.unitPriceIls} currentSeats={seats.billing.seats} roles={seats.roles} onClose={() => setAdding(false)} />}
      {access && <AccessModal state={access} unitPriceIls={seats.billing.unitPriceIls} currentSeats={seats.billing.seats} onClose={() => setAccess(null)} />}
    </div>
  );
}

function BillingBanner({ billing }: { billing?: BillingAccessDecision | null }) {
  if (!billing) return null;
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" }) : null);

  if (billing.restricted) {
    return (
      <div className="border-danger/40 bg-danger-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
        <div className="min-w-0">
          <p className="text-danger flex items-center gap-1.5 text-[15px] font-black"><Icon name="AlertTriangle" size={16} />המנוי ממתין להסדרת תשלום</p>
          <p className="text-ink mt-0.5 text-[13px] font-semibold">הנתונים שלכם נשמרים במלואם. הסדירו את התשלום כדי להסיר את ההגבלה ולהמשיך לעבוד.</p>
        </div>
        <a href="/account" className="bg-danger inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-[14px] font-black text-white transition hover:opacity-90"><Icon name="Banknote" size={16} />הסדרת תשלום</a>
      </div>
    );
  }
  if (billing.inGrace) {
    const until = fmt(billing.graceUntil);
    return (
      <div className="border-warning/40 bg-warning-soft flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
        <div className="min-w-0">
          <p className="text-warning flex items-center gap-1.5 text-[15px] font-black"><Icon name="AlertTriangle" size={16} />לא הצלחנו לחייב את אמצעי התשלום</p>
          <p className="text-ink mt-0.5 text-[13px] font-semibold">{until ? `ניתן להמשיך להשתמש ב-ZONO עד ${until}. ` : "ניתן להמשיך להשתמש ב-ZONO בתקופת החסד. "}הסדירו את התשלום כדי למנוע הגבלה.</p>
        </div>
        <a href="/account" className="bg-warning inline-flex shrink-0 items-center gap-1.5 rounded-xl px-4 py-2.5 text-[14px] font-black text-white transition hover:opacity-90"><Icon name="Banknote" size={16} />הסדרת תשלום</a>
      </div>
    );
  }
  return null;
}

function Stat({ label, value, text, tone = "text-ink" }: { label: string; value?: number; text?: string; tone?: string }) {
  return (
    <div className="bg-card border-line rounded-2xl border p-4">
      <div className={`text-2xl font-black tabular-nums ${tone}`}>{text ?? value}</div>
      <div className="text-muted mt-1 text-[12px] font-semibold">{label}</div>
    </div>
  );
}

function MemberRow({ m, onAccess }: { m: TeamSeatMember; onAccess: (kind: "grant" | "suspend" | "reactivate") => void }) {
  return (
    <div className="bg-card border-line flex flex-wrap items-center gap-3 rounded-2xl border p-3.5 sm:flex-nowrap">
      <AgentAvatar url={m.avatarUrl} name={m.name} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2"><span className="text-ink truncate text-[15px] font-black">{m.name}</span>
          {m.showOnWebsite && <span className="text-muted text-[11px]">· מוצג באתר</span>}</div>
        <div className="text-muted truncate text-[12px]">{m.specialty || ROLE_HE[m.role] || "מתווך/ת"}{(m.activeProperties || m.openLeads) ? ` · ${m.activeProperties} נכסים · ${m.openLeads} לידים` : ""}</div>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${ACCESS_TONE[m.access]}`}>{ACCESS_LABEL_HE[m.access]}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        {m.access === "NO_ACCESS" && <RowBtn onClick={() => onAccess("grant")} primary>הפעלת גישה</RowBtn>}
        {m.access === "ACTIVE" && m.role !== "owner" && <RowBtn onClick={() => onAccess("suspend")}>השהיית גישה</RowBtn>}
        {m.access === "SUSPENDED" && <RowBtn onClick={() => onAccess("reactivate")} primary>הפעל מחדש</RowBtn>}
      </div>
    </div>
  );
}
function RowBtn({ children, onClick, primary }: { children: ReactNode; onClick: () => void; primary?: boolean }) {
  return <button type="button" onClick={onClick} className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition ${primary ? "bg-brand text-white hover:opacity-90" : "border-line text-ink hover:bg-surface border"}`}>{children}</button>;
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div dir="rtl" className="fixed inset-0 z-[70] grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="bg-surface border-line relative w-full max-w-md rounded-3xl border p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between"><h2 className="text-ink text-[17px] font-black">{title}</h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="text-muted hover:text-ink grid h-8 w-8 place-items-center rounded-lg"><Icon name="X" size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}

function BillingPreview({ currentSeats, nextSeats, unitPriceIls }: { currentSeats: number; nextSeats: number; unitPriceIls: number }) {
  const p = seatBillingPreview(currentSeats, nextSeats, unitPriceIls);
  return (
    <div className="border-line bg-card mt-1 rounded-2xl border p-4 text-[13px]">
      <Line label="משתמשים פעילים" value={`${p.currentSeats} → ${p.nextSeats}`} />
      <Line label="חיוב חודשי" value={`${ilsMonthly(p.currentMonthlyIls)} → ${ilsMonthly(p.nextMonthlyIls)}`} />
      <Line label={p.monthlyDeltaIls >= 0 ? "תוספת חודשית" : "הפחתה חודשית"} value={`${p.monthlyDeltaIls >= 0 ? "+" : ""}${ilsMonthly(p.monthlyDeltaIls)}`} strong />
      <p className="text-muted mt-2 text-[12px]">השינוי יחול במחזור החיוב הבא (ללא חיוב מיידי).</p>
    </div>
  );
}
const Line = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <div className="flex items-center justify-between py-0.5"><span className="text-muted">{label}</span><span className={strong ? "text-ink font-black" : "text-ink font-bold"}>{value}</span></div>
);

const inputCls = "border-line bg-surface text-ink focus:border-brand w-full rounded-xl border px-3 py-2.5 text-[14px] outline-none";

function AddMemberModal({ unitPriceIls, currentSeats, roles, onClose }: { unitPriceIls: number; currentSeats: number; roles: { key: string; name: string }[]; onClose: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [f, setF] = useState({ fullName: "", role: "agent", specialty: "", phone: "", email: "" });
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const rosterOnly = () => start(async () => {
    setErr(null);
    const r = await createOfficeMemberAction({ fullName: f.fullName, role: f.role, specialty: f.specialty, phone: f.phone, email: f.email });
    if (r.ok) { onClose(); location.reload(); } else setErr(r.error ?? "שגיאה");
  });
  const withAccess = () => start(async () => {
    setErr(null);
    if (!f.email.trim()) { setErr("נדרש אימייל למתן גישה"); return; }
    const c = await createOfficeMemberAction({ fullName: f.fullName, role: f.role, specialty: f.specialty, phone: f.phone, email: f.email });
    if (!c.ok) { setErr(c.error ?? "שגיאה"); return; }
    const inv = await createInvitationAction({ email: f.email, fullName: f.fullName, roleKey: f.role });
    if (inv.ok) { onClose(); location.reload(); } else setErr(inv.error ?? "ההזמנה נכשלה");
  });

  return (
    <Overlay title="הוספת איש צוות" onClose={onClose}>
      {step === 1 ? (
        <div className="flex flex-col gap-2.5">
          <input className={inputCls} placeholder="שם מלא" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
          <select className={inputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            {roles.length ? roles.map((r) => <option key={r.key} value={r.key}>{r.name}</option>) : <option value="agent">מתווך/ת</option>}
          </select>
          <input className={inputCls} placeholder="התמחות (לא חובה)" value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })} />
          <input className={inputCls} placeholder="טלפון (לא חובה)" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          <input className={inputCls} placeholder="אימייל (נדרש למתן גישה)" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          <button type="button" disabled={!f.fullName.trim()} onClick={() => setStep(2)} className="bg-brand mt-1 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50">המשך</button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <button type="button" disabled={pending} onClick={rosterOnly} className="border-line hover:bg-card rounded-2xl border p-4 text-right transition">
            <div className="text-ink text-[14px] font-black">הוספה למשרד בלבד</div>
            <div className="text-muted text-[12px]">איש הצוות יתווסף לרוסטר, יוכל לקבל נכסים ולידים — ללא גישה ל-ZONO וללא חיוב.</div>
          </button>
          <div className="border-line rounded-2xl border p-4">
            <div className="text-ink text-[14px] font-black">הוספה + גישה ל-ZONO</div>
            <div className="text-muted text-[12px]">תישלח הזמנה להצטרפות. הגישה (והחיוב) יופעלו רק כשאיש הצוות יאשר את ההזמנה.</div>
            <BillingPreview currentSeats={currentSeats} nextSeats={currentSeats + 1} unitPriceIls={unitPriceIls} />
            <button type="button" disabled={pending} onClick={withAccess} className="bg-brand mt-3 w-full rounded-xl px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50">{pending ? "שולח…" : "אישור ושליחת הזמנה"}</button>
          </div>
          <button type="button" onClick={() => setStep(1)} className="text-muted text-[12px] font-bold">← חזרה לפרטים</button>
        </div>
      )}
      {err && <p className="text-danger mt-3 text-[13px] font-bold">{err}</p>}
    </Overlay>
  );
}

function AccessModal({ state, unitPriceIls, currentSeats, onClose }: { state: { member: TeamSeatMember; kind: "grant" | "suspend" | "reactivate" }; unitPriceIls: number; currentSeats: number; onClose: () => void }) {
  const { member, kind } = state;
  const next = kind === "suspend" ? currentSeats - 1 : currentSeats + 1;
  const [email, setEmail] = useState(member.email ?? "");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const title = kind === "grant" ? `הפעלת גישה ל${member.name}` : kind === "suspend" ? `השהיית גישה ל${member.name}` : `הפעלת גישה מחדש ל${member.name}`;

  const run = () => start(async () => {
    setErr(null);
    if (kind === "grant") {
      if (!email.trim()) { setErr("נדרש אימייל"); return; }
      const r = await createInvitationAction({ email, fullName: member.name, roleKey: member.role === "owner" ? "manager" : member.role });
      if (r.ok) { onClose(); location.reload(); } else setErr(r.error ?? "שגיאה");
    } else {
      if (!member.userId) { setErr("לאיש הצוות אין חשבון מקושר"); return; }
      const r = await setUserStatusAction(member.userId, kind === "reactivate");
      if (r.ok) { onClose(); location.reload(); } else setErr(r.error ?? "שגיאה");
    }
  });

  return (
    <Overlay title={title} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {kind === "grant" && (
          <>
            <p className="text-muted text-[13px]">תישלח הזמנה להצטרפות ל-ZONO. הגישה והחיוב יופעלו רק לאחר שאיש הצוות יאשר.</p>
            {!member.email && <input className={inputCls} placeholder="אימייל לשליחת ההזמנה" value={email} onChange={(e) => setEmail(e.target.value)} />}
          </>
        )}
        {kind === "suspend" && <p className="text-muted text-[13px]">איש הצוות יישאר במשרד וכל הנכסים/הלידים/ההיסטוריה יישמרו — רק הגישה ל-ZONO תושהה.</p>}
        <BillingPreview currentSeats={currentSeats} nextSeats={Math.max(0, next)} unitPriceIls={unitPriceIls} />
        <button type="button" disabled={pending} onClick={run} className="bg-brand rounded-xl px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50">
          {pending ? "מעדכן…" : kind === "grant" ? "אישור ושליחת הזמנה" : kind === "suspend" ? "אישור והשהיית גישה" : "אישור והפעלה מחדש"}
        </button>
        {err && <p className="text-danger text-[13px] font-bold">{err}</p>}
      </div>
    </Overlay>
  );
}
