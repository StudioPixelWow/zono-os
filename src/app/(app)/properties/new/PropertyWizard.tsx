"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Button } from "@/components/ui/Button";
import { useCurrentOrganization, useCurrentUser } from "@/components/dashboard/DashboardDataProvider";
import { LocalityPicker } from "../LocalityPicker";
import {
  ISRAELI_REGION_LABELS,
  LISTING_KIND_OPTIONS,
  PROPERTY_STATUS_OPTIONS,
  PROPERTY_TYPE_OPTIONS,
} from "@/lib/properties/labels";
import { PROPERTY_FEATURE_KEYS, type PropertyInput } from "@/lib/properties/types";
import { saveDraftAction, publishPropertyAction } from "@/lib/properties/wizardActions";
import { generatePropertyText } from "@/lib/properties/ai";
import type { AiPropertyContext } from "@/lib/properties/types";
import type { MediaRow } from "@/lib/properties/media";
import { MediaUploader } from "./MediaUploader";
import { LivePreview } from "./LivePreview";
import { LocationMap } from "./LocationMap";

const field =
  "bg-surface border-line text-ink focus:border-brand-light h-11 w-full rounded-xl border px-3 text-sm outline-none transition";
const lbl = "text-muted text-xs font-semibold";

const STEPS = [
  { id: 1, label: "פרטים בסיסיים", icon: "Tag" },
  { id: 2, label: "מיקום", icon: "MapPin" },
  { id: 3, label: "מאפיינים", icon: "Building2" },
  { id: 4, label: "מדיה", icon: "Maximize2" },
  { id: 5, label: "תיאור ו-AI", icon: "Sparkles" },
  { id: 6, label: "פרסום", icon: "Send" },
];

const TAG_OPTIONS = [
  { value: "new", label: "חדש" },
  { value: "exclusive", label: "בלעדי" },
  { value: "opportunity", label: "בהזדמנות" },
  { value: "premium", label: "פרימיום" },
];

const BOOL_FEATURES: { key: keyof PropertyInput; label: string }[] = [
  { key: "hasParking", label: "חניה" },
  { key: "hasElevator", label: "מעלית" },
  { key: "hasBalcony", label: "מרפסת" },
  { key: "hasSafeRoom", label: 'ממ"ד' },
  { key: "hasStorage", label: "מחסן" },
  { key: "isAccessible", label: "נגישות" },
];

const FEATURE_LABELS: Record<(typeof PROPERTY_FEATURE_KEYS)[number], string> = {
  renovated: "משופצת",
  air_conditioning: "מיזוג",
  bars: "סורגים",
  pandor_doors: "דלתות פנדור",
  upgraded_kitchen: "מטבח משודרג",
  master_unit: "יחידת הורים",
  open_view: "נוף פתוח",
  front_facing: "חזית",
  rear_facing: "עורפית",
  solar_heater: "דוד שמש",
};

type SaveState = "idle" | "saving" | "saved" | "error";

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3.5 py-2 text-sm font-semibold transition " +
        (active ? "bg-brand border-brand text-white" : "bg-card border-line text-ink hover:border-brand-light")
      }
    >
      {children}
    </button>
  );
}

export function PropertyWizard({
  draftId,
  initial,
  initialMedia,
}: {
  draftId: string;
  initial: PropertyInput;
  initialMedia: MediaRow[];
}) {
  const org = useCurrentOrganization();
  const user = useCurrentUser();

  const [step, setStep] = useState(1);
  const [form, setForm] = useState<PropertyInput>(initial);
  const [media, setMedia] = useState<MediaRow[]>(initialMedia);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [aiOutput, setAiOutput] = useState<string>("");
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const firstRender = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const set = <K extends keyof PropertyInput>(key: K, value: PropertyInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const num = (v: string) => (v === "" ? null : Number(v));

  // Debounced autosave.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await saveDraftAction(draftId, form);
      setSaveState(res?.error ? "error" : "saved");
    }, 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [form, draftId]);

  const primaryImageUrl =
    media.find((m) => m.is_primary && m.type === "image")?.url ??
    media.find((m) => m.type === "image")?.url ??
    null;
  const imageCount = media.filter((m) => m.type === "image").length;

  // Quality score.
  const checks = [
    { label: "הוזן מחיר", ok: !!form.price && form.price > 0 },
    { label: "הוזנה עיר", ok: !!form.city },
    { label: "לפחות 6 תמונות", ok: imageCount >= 6 },
    { label: "תיאור מעל 250 תווים", ok: (form.marketingDescription ?? form.description ?? "").length >= 250 },
    { label: "נבחרו מאפיינים", ok: form.features.length > 0 || BOOL_FEATURES.some((f) => form[f.key]) },
    { label: "תמונה ראשית", ok: !!primaryImageUrl },
  ];
  const score = Math.round((checks.filter((c) => c.ok).length / checks.length) * 100);

  const aiCtx = (mode: AiPropertyContext["mode"]): AiPropertyContext => ({
    title: form.title,
    type: form.type,
    city: form.city,
    neighborhood: form.neighborhood,
    rooms: form.rooms,
    sizeSqm: form.sizeSqm,
    floor: form.floor,
    price: form.price,
    features: [
      ...BOOL_FEATURES.filter((f) => form[f.key]).map((f) => f.label),
      ...form.features.map((k) => FEATURE_LABELS[k as keyof typeof FEATURE_LABELS] ?? k),
    ],
    mode,
    current: form.marketingDescription ?? form.description ?? "",
  });

  const runAi = async (mode: AiPropertyContext["mode"]) => {
    setAiBusy(mode);
    try {
      const res = await generatePropertyText(aiCtx(mode));
      if (res.text) {
        if (mode === "description" || mode === "improve") {
          set("marketingDescription", res.text);
        } else {
          setAiOutput(res.text);
        }
      }
    } finally {
      setAiBusy(null);
    }
  };

  const publish = async () => {
    setPublishError(null);
    setPublishing(true);
    const res = await publishPropertyAction(draftId, { ...form, primaryImageUrl });
    if (res?.error) {
      setPublishError(res.error);
      setPublishing(false);
    }
    // success → server redirect
  };

  const toggleFeature = (key: string) =>
    setForm((f) => ({
      ...f,
      features: f.features.includes(key)
        ? f.features.filter((k) => k !== key)
        : [...f.features, key],
    }));

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/properties" className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold">
            <Icon name="ChevronRight" size={16} />
            חזרה לנכסים
          </Link>
          <h1 className="text-ink mt-1 text-2xl font-black">העלאת נכס חדש</h1>
        </div>
        <div className="flex items-center gap-3">
          <AutoSaveIndicator state={saveState} />
          <div className="text-end">
            <p className="text-brand text-lg font-black">{score}%</p>
            <p className="text-muted text-[11px] font-semibold">השלמת מודעה</p>
          </div>
        </div>
      </div>

      {/* Stepper */}
      <div className="bg-card border-line flex items-center justify-between gap-1 overflow-x-auto rounded-[20px] border p-3">
        {STEPS.map((s) => {
          const active = s.id === step;
          const done = s.id < step;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className="flex min-w-[88px] flex-1 flex-col items-center gap-1.5"
            >
              <span
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-full border-2 text-sm font-bold transition",
                  active
                    ? "bg-brand border-brand text-white"
                    : done
                      ? "bg-success-soft border-success text-success"
                      : "bg-card border-line text-muted",
                )}
              >
                {done ? <Icon name="UserCheck" size={16} /> : <Icon name={s.icon} size={16} />}
              </span>
              <span className={cn("text-[11px] font-bold", active ? "text-brand-strong" : "text-muted")}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body: main + preview */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-5">
          {step === 1 && (
            <div className="bg-card border-line flex flex-col gap-4 rounded-[20px] border p-5">
              <h2 className="text-ink text-base font-extrabold">פרטים בסיסיים</h2>
              <label className="block">
                <span className={lbl}>כותרת נכס *</span>
                <input className={`${field} mt-1`} value={form.title} onChange={(e) => set("title", e.target.value)} />
              </label>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className={lbl}>סוג נכס</span>
                  <select className={`${field} mt-1`} value={form.type} onChange={(e) => set("type", e.target.value as PropertyInput["type"])}>
                    {PROPERTY_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className={lbl}>סוג עסקה</span>
                  <select className={`${field} mt-1`} value={form.listingKind} onChange={(e) => set("listingKind", e.target.value as PropertyInput["listingKind"])}>
                    {LISTING_KIND_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className={lbl}>סטטוס</span>
                  <select className={`${field} mt-1`} value={form.status} onChange={(e) => set("status", e.target.value as PropertyInput["status"])}>
                    {PROPERTY_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <label className="block">
                  <span className={lbl}>מחיר (₪) *</span>
                  <input type="number" className={`${field} mt-1`} value={form.price || ""} onChange={(e) => set("price", Number(e.target.value))} />
                </label>
                <label className="block">
                  <span className={lbl}>מחיר לפני הנחה (₪)</span>
                  <input type="number" className={`${field} mt-1`} value={form.priceBeforeDiscount ?? ""} onChange={(e) => set("priceBeforeDiscount", num(e.target.value))} />
                </label>
                <label className="block">
                  <span className={lbl}>תאריך אכלוס</span>
                  <input type="date" className={`${field} mt-1`} value={form.availabilityDate ?? ""} onChange={(e) => set("availabilityDate", e.target.value || null)} />
                </label>
              </div>
              <div>
                <p className={`${lbl} mb-2`}>תווית נכס</p>
                <div className="flex flex-wrap gap-2">
                  {TAG_OPTIONS.map((t) => (
                    <Chip key={t.value} active={form.listingTag === t.value} onClick={() => set("listingTag", form.listingTag === t.value ? null : t.value)}>
                      {t.label}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="bg-card border-line flex flex-col gap-4 rounded-[20px] border p-5">
              <h2 className="text-ink text-base font-extrabold">מיקום</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={lbl}>עיר</span>
                  <div className="mt-1"><LocalityPicker value={form.city ?? null} onChange={(v) => set("city", v)} /></div>
                </label>
                <label className="block">
                  <span className={lbl}>שכונה</span>
                  <input className={`${field} mt-1`} value={form.neighborhood ?? ""} onChange={(e) => set("neighborhood", e.target.value)} />
                </label>
                <label className="block">
                  <span className={lbl}>רחוב</span>
                  <input className={`${field} mt-1`} value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
                </label>
                <label className="block">
                  <span className={lbl}>מספר בית</span>
                  <input className={`${field} mt-1`} value={form.buildingNumber ?? ""} onChange={(e) => set("buildingNumber", e.target.value)} />
                </label>
                <label className="block">
                  <span className={lbl}>אזור</span>
                  <select className={`${field} mt-1`} value={form.region ?? ""} onChange={(e) => set("region", e.target.value || null)}>
                    <option value="">—</option>
                    {Object.entries(ISRAELI_REGION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={form.showExactAddress} onChange={(e) => set("showExactAddress", e.target.checked)} />
                  הצג כתובת מדויקת במודעה
                </label>
                <label className="flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" checked={form.showNeighborhoodOnly} onChange={(e) => set("showNeighborhoodOnly", e.target.checked)} />
                  הצג אזור/שכונה בלבד
                </label>
              </div>
              <LocationMap latitude={form.latitude ?? null} longitude={form.longitude ?? null} onChange={(lat, lng) => setForm((f) => ({ ...f, latitude: lat, longitude: lng }))} />
            </div>
          )}

          {step === 3 && (
            <div className="bg-card border-line flex flex-col gap-4 rounded-[20px] border p-5">
              <h2 className="text-ink text-base font-extrabold">מאפייני הנכס</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {([
                  ["rooms", "חדרים", "0.5"],
                  ["sizeSqm", "מ״ר בנוי", "1"],
                  ["outdoorSqm", "מ״ר חוץ", "1"],
                  ["floor", "קומה", "1"],
                  ["totalFloors", "סה״כ קומות", "1"],
                  ["parkingCount", "חניות", "1"],
                  ["storageCount", "מחסנים", "1"],
                  ["balconyCount", "מרפסות", "1"],
                ] as const).map(([key, label, step2]) => (
                  <label key={key} className="block">
                    <span className={lbl}>{label}</span>
                    <input
                      type="number"
                      step={step2}
                      className={`${field} mt-1`}
                      value={(form[key] as number | null) ?? ""}
                      onChange={(e) => set(key, num(e.target.value) as never)}
                    />
                  </label>
                ))}
              </div>
              <div>
                <p className={`${lbl} mb-2`}>מאפיינים</p>
                <div className="flex flex-wrap gap-2">
                  {BOOL_FEATURES.map((f) => (
                    <Chip key={f.key} active={Boolean(form[f.key])} onClick={() => set(f.key, !form[f.key] as never)}>
                      {f.label}
                    </Chip>
                  ))}
                  {PROPERTY_FEATURE_KEYS.map((k) => (
                    <Chip key={k} active={form.features.includes(k)} onClick={() => toggleFeature(k)}>
                      {FEATURE_LABELS[k]}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="bg-card border-line flex flex-col gap-4 rounded-[20px] border p-5">
              <h2 className="text-ink text-base font-extrabold">תמונות ומדיה</h2>
              {org ? (
                <MediaUploader orgId={org.id} propertyId={draftId} initial={media} onChange={setMedia} />
              ) : (
                <p className="text-muted text-sm">לא ניתן לזהות ארגון.</p>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="bg-card border-line flex flex-col gap-4 rounded-[20px] border p-5">
              <h2 className="text-ink text-base font-extrabold">תיאור ושיווק</h2>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={aiBusy !== null} onClick={() => runAi("description")} leadingIcon={<Icon name="Sparkles" size={15} />}>
                  {aiBusy === "description" ? "יוצר…" : "צור תיאור עם AI"}
                </Button>
                <Button size="sm" variant="ghost" disabled={aiBusy !== null} onClick={() => runAi("improve")}>שפר ניסוח</Button>
                <Button size="sm" variant="ghost" disabled={aiBusy !== null} onClick={() => runAi("facebook")}>פוסט פייסבוק</Button>
                <Button size="sm" variant="ghost" disabled={aiBusy !== null} onClick={() => runAi("google")}>מודעת Google</Button>
                <Button size="sm" variant="ghost" disabled={aiBusy !== null} onClick={() => runAi("meta_titles")}>כותרות מטא</Button>
              </div>
              <label className="block">
                <span className={lbl}>תיאור שיווקי</span>
                <textarea className={`${field} mt-1 h-28 py-2`} value={form.marketingDescription ?? ""} onChange={(e) => set("marketingDescription", e.target.value)} />
              </label>
              {aiOutput && (
                <div className="bg-surface rounded-xl p-3">
                  <p className={`${lbl} mb-1`}>תוצר AI (העתק/י לשימוש)</p>
                  <p className="text-ink whitespace-pre-wrap text-sm">{aiOutput}</p>
                </div>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className={lbl}>קהל יעד</span>
                  <input className={`${field} mt-1`} value={form.targetAudience ?? ""} onChange={(e) => set("targetAudience", e.target.value)} />
                </label>
                <label className="block">
                  <span className={lbl}>הערות פנימיות</span>
                  <input className={`${field} mt-1`} value={form.internalNotes ?? ""} onChange={(e) => set("internalNotes", e.target.value)} />
                </label>
              </div>
              <QualityPanel checks={checks} score={score} />
            </div>
          )}

          {step === 6 && (
            <div className="bg-card border-line flex flex-col gap-4 rounded-[20px] border p-5">
              <h2 className="text-ink text-base font-extrabold">סיכום ופרסום</h2>
              <QualityPanel checks={checks} score={score} />
              {checks.some((c) => !c.ok) && (
                <p className="bg-warning-soft text-warning rounded-xl px-3 py-2 text-xs font-semibold">
                  שים/י לב: חלק מהמלצות האיכות עדיין חסרות. אפשר לפרסם, אך מומלץ להשלים.
                </p>
              )}
              {publishError && (
                <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{publishError}</p>
              )}
              <p className="text-muted text-sm">בלחיצה על &quot;פרסום נכס&quot; המודעה תפורסם ותהפוך לזמינה.</p>
            </div>
          )}
        </div>

        {/* Live preview side panel */}
        <aside className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
          <LivePreview form={form} primaryImageUrl={primaryImageUrl} agentName={user?.fullName || "סוכן"} />
        </aside>
      </div>

      {/* Sticky action bar */}
      <div className="bg-card/95 border-line sticky bottom-0 z-20 -mx-4 flex items-center justify-between gap-3 border-t px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-[20px] sm:border">
        <span className="text-muted text-xs font-semibold">
          {saveState === "saved" ? "נשמר אוטומטית ✓" : saveState === "saving" ? "שומר…" : ""}
        </span>
        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>הקודם</Button>
          )}
          {step < 6 ? (
            <Button onClick={() => setStep((s) => s + 1)}>הבא</Button>
          ) : (
            <Button onClick={publish} disabled={publishing}>
              {publishing ? "מפרסם…" : "פרסום נכס"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function AutoSaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { text: string; cls: string }> = {
    idle: { text: "טיוטה", cls: "text-muted" },
    saving: { text: "שומר…", cls: "text-muted" },
    saved: { text: "נשמר ✓", cls: "text-success" },
    error: { text: "שמירה נכשלה", cls: "text-danger" },
  };
  const s = map[state];
  return <span className={cn("text-xs font-semibold", s.cls)}>{s.text}</span>;
}

function QualityPanel({ checks, score }: { checks: { label: string; ok: boolean }[]; score: number }) {
  return (
    <div className="bg-surface rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-ink text-sm font-extrabold">ציון איכות מודעה</p>
        <span className="text-brand text-lg font-black">{score}%</span>
      </div>
      <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center gap-2 text-xs font-semibold">
            <span className={cn("grid h-4 w-4 place-items-center rounded-full text-white", c.ok ? "bg-success" : "bg-line")}>
              {c.ok && <Icon name="UserCheck" size={10} />}
            </span>
            <span className={c.ok ? "text-ink" : "text-muted"}>{c.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
