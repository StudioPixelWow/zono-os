"use client";

import { useEffect, useState, useTransition } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  createAndLinkSellerAction,
  getPropertySellerStateAction,
  linkSellerToPropertyAction,
  searchSellersAction,
  setPropertySellerRoleAction,
  unlinkSellerFromPropertyAction,
  type PropertySellerState,
  type SellerSearchResult,
} from "@/lib/sellers/actions";

const field =
  "bg-surface border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none";
const lbl = "text-muted text-[11px] font-bold";

const RELATIONSHIPS = [
  { value: "owner", label: "בעלים" },
  { value: "co_owner", label: "בעלים שותף" },
  { value: "heir", label: "יורש" },
  { value: "power_of_attorney", label: "מיופה כוח" },
  { value: "representative", label: "נציג" },
];

const emptyForm = {
  fullName: "",
  phone: "",
  whatsapp: "",
  email: "",
  city: "",
  relationshipType: "owner",
  motivationNotes: "",
  urgencyLevel: "",
  desiredPrice: "",
  ownershipPercentage: "",
  allowsMarketing: true,
  communicationNotes: "",
  isPrimary: true,
  isDecisionMaker: true,
  canSign: true,
};

export function WizardSellerStep({
  propertyId,
  onReadinessChange,
}: {
  propertyId: string;
  onReadinessChange?: (ready: boolean) => void;
}) {
  const [state, setState] = useState<PropertySellerState | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SellerSearchResult[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const refresh = async () => {
    const s = await getPropertySellerStateAction(propertyId);
    setState(s);
    onReadinessChange?.(s.readiness.ready);
  };

  useEffect(() => {
    // Loads async server state on mount; setState happens after an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const sellers = state?.sellers ?? [];
  const readiness = state?.readiness;

  const runSearch = () =>
    start(async () => setResults(await searchSellersAction(query.trim())));

  const linkExisting = (sellerId: string) =>
    start(async () => {
      const first = sellers.length === 0;
      const res = await linkSellerToPropertyAction({
        propertyId,
        sellerId,
        relationshipType: "owner",
        isPrimary: first,
        isDecisionMaker: first,
        canSign: first,
      });
      if (res.error) setError(res.error);
      else {
        setResults([]);
        setQuery("");
        await refresh();
      }
    });

  const toggleRole = (linkId: string, patch: Record<string, boolean>) =>
    start(async () => {
      await setPropertySellerRoleAction(linkId, propertyId, patch);
      await refresh();
    });

  const makePrimary = (linkId: string) =>
    start(async () => {
      await setPropertySellerRoleAction(linkId, propertyId, { is_primary: true });
      await refresh();
    });

  const remove = (linkId: string) =>
    start(async () => {
      await unlinkSellerFromPropertyAction(linkId, propertyId);
      await refresh();
    });

  const createInline = () => {
    setError(null);
    if (!form.fullName.trim()) {
      setError("נא להזין שם מלא למוכר.");
      return;
    }
    start(async () => {
      const res = await createAndLinkSellerAction(propertyId, {
        fullName: form.fullName.trim(),
        phone: form.phone || null,
        secondaryPhone: form.whatsapp || null,
        email: form.email || null,
        city: form.city || null,
        relationshipType: form.relationshipType,
        motivationNotes: form.motivationNotes || null,
        urgencyLevel: form.urgencyLevel || null,
        desiredPrice: form.desiredPrice ? Number(form.desiredPrice) : null,
        ownershipPercentage: form.ownershipPercentage ? Number(form.ownershipPercentage) : null,
        allowsMarketing: form.allowsMarketing,
        preferredContactMethod: form.whatsapp ? "whatsapp" : null,
        communicationNotes: form.communicationNotes || null,
        isPrimary: form.isPrimary,
        isDecisionMaker: form.isDecisionMaker,
        canSign: form.canSign,
      });
      if (res.error) {
        setError(res.error);
      } else {
        if (res.state) {
          setState(res.state);
          onReadinessChange?.(res.state.readiness.ready);
        } else {
          await refresh();
        }
        setForm({ ...emptyForm, isPrimary: false, isDecisionMaker: false, canSign: false });
        setShowForm(false);
      }
    });
  };

  return (
    <div className="bg-card border-line flex flex-col gap-4 rounded-[20px] border p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-ink text-base font-extrabold">בעלים / מוכרים</h2>
        {readiness && <ReadinessBadge ready={readiness.ready} />}
      </div>

      {readiness && <ReadinessBanner r={readiness} />}

      {error && (
        <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-xs font-semibold">{error}</p>
      )}

      {/* Linked sellers */}
      {sellers.length > 0 && (
        <div className="flex flex-col gap-2">
          {sellers.map((s) => (
            <div key={s.linkId} className="bg-surface flex flex-wrap items-center gap-2 rounded-xl p-3">
              <span className="text-ink text-sm font-bold">{s.name}</span>
              <div className="flex flex-1 flex-wrap items-center gap-1.5">
                {s.isPrimary ? (
                  <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-[10px] font-bold">ראשי</span>
                ) : (
                  <button type="button" onClick={() => makePrimary(s.linkId)} className="text-muted hover:text-brand text-[11px] font-bold">הפוך לראשי</button>
                )}
                <RoleChip active={s.isDecisionMaker} label="מקבל החלטות" onClick={() => toggleRole(s.linkId, { is_decision_maker: !s.isDecisionMaker })} />
                <RoleChip active={s.canSign} label="מורשה חתימה" onClick={() => toggleRole(s.linkId, { can_sign: !s.canSign })} />
              </div>
              <button type="button" onClick={() => remove(s.linkId)} className="text-muted hover:text-danger" aria-label="הסר">
                <Icon name="Trash2" size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Search existing */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            className={field}
            placeholder="חיפוש מוכר קיים לפי שם / טלפון…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), runSearch())}
          />
          <Button variant="secondary" onClick={runSearch} disabled={pending || query.trim().length < 2}>חפש</Button>
        </div>
        {results.length > 0 && (
          <ul className="border-line flex flex-col divide-y rounded-xl border">
            {results.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-3 py-2">
                <span className="text-ink text-sm">{r.fullName}{r.phone ? ` · ${r.phone}` : ""}</span>
                <button type="button" onClick={() => linkExisting(r.id)} className="text-brand-strong text-sm font-bold hover:underline">קשר</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Inline create */}
      {!showForm ? (
        <Button variant="ghost" onClick={() => { setForm({ ...emptyForm, isPrimary: sellers.length === 0, isDecisionMaker: sellers.length === 0, canSign: sellers.length === 0 }); setShowForm(true); }} leadingIcon={<Icon name="UserPlus" size={15} />}>
          הוסף מוכר חדש
        </Button>
      ) : (
        <div className="border-line flex flex-col gap-3 rounded-xl border p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="שם מלא *" value={form.fullName} onChange={(v) => setForm((f) => ({ ...f, fullName: v }))} />
            <Field label="טלפון" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
            <Field label="WhatsApp" value={form.whatsapp} onChange={(v) => setForm((f) => ({ ...f, whatsapp: v }))} />
            <Field label="אימייל" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
            <Field label="עיר" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
            <label className="flex flex-col gap-1">
              <span className={lbl}>קשר לנכס</span>
              <select className={field} value={form.relationshipType} onChange={(e) => setForm((f) => ({ ...f, relationshipType: e.target.value }))}>
                {RELATIONSHIPS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </label>
            <Field label="מוטיבציה" value={form.motivationNotes} onChange={(v) => setForm((f) => ({ ...f, motivationNotes: v }))} />
            <Field label="דחיפות" value={form.urgencyLevel} onChange={(v) => setForm((f) => ({ ...f, urgencyLevel: v }))} />
            <Field label="ציפיית מחיר (₪)" value={form.desiredPrice} onChange={(v) => setForm((f) => ({ ...f, desiredPrice: v }))} type="number" />
            <Field label="% בעלות" value={form.ownershipPercentage} onChange={(v) => setForm((f) => ({ ...f, ownershipPercentage: v }))} type="number" />
          </div>
          <Field label="הערות" value={form.communicationNotes} onChange={(v) => setForm((f) => ({ ...f, communicationNotes: v }))} />
          <div className="flex flex-wrap gap-3">
            <Check label="ראשי" checked={form.isPrimary} onChange={(v) => setForm((f) => ({ ...f, isPrimary: v }))} />
            <Check label="מקבל החלטות" checked={form.isDecisionMaker} onChange={(v) => setForm((f) => ({ ...f, isDecisionMaker: v }))} />
            <Check label="מורשה חתימה" checked={form.canSign} onChange={(v) => setForm((f) => ({ ...f, canSign: v }))} />
            <Check label="אישור שיווק" checked={form.allowsMarketing} onChange={(v) => setForm((f) => ({ ...f, allowsMarketing: v }))} />
          </div>
          <div className="flex gap-2">
            <Button onClick={createInline} disabled={pending}>{pending ? "שומר…" : "צור וקשר מוכר"}</Button>
            <Button variant="ghost" onClick={() => setShowForm(false)}>ביטול</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className={lbl}>{label}</span>
      <input type={type} className={field} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function RoleChip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold transition", active ? "bg-brand-soft text-brand-strong" : "bg-card border-line text-muted border")}
    >
      {label}
    </button>
  );
}

function ReadinessBadge({ ready }: { ready: boolean }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", ready ? "bg-success-soft text-success" : "bg-warning-soft text-warning")}>
      {ready ? "מוכן לפרסום" : "חסרים פרטים"}
    </span>
  );
}

function ReadinessBanner({ r }: { r: PropertySellerState["readiness"] }) {
  const items: [string, boolean][] = [
    ["מוכר מקושר", r.hasActiveSeller],
    ["מקבל החלטות", r.hasDecisionMaker],
    ["מורשה חתימה", r.hasSigner],
    ["אמצעי קשר", r.hasContactMethod],
  ];
  return (
    <div className="bg-surface flex flex-wrap gap-2 rounded-xl p-3">
      {items.map(([label, ok]) => (
        <span key={label} className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-bold", ok ? "bg-success-soft text-success" : "bg-card text-muted border-line border")}>
          <Icon name={ok ? "Check" : "Minus"} size={12} />{label}
        </span>
      ))}
    </div>
  );
}
