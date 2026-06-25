"use client";
// ============================================================================
// ZONO Property Radar™ — settings + status + manual sync (RTL, premium).
// Sections: הפעלה וספקים · חיסכון בקרדיטים · התראות ופופאפים · וואטסאפ ·
//           סטטוס סנכרון · בדיקה ידנית.
// ============================================================================
import { useState } from "react";
import Link from "next/link";
import {
  Radar, Save, PlayCircle, MapPin, Coins, Bell, MessageSquare, Activity, Sparkles, CheckCircle2, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useActionRunner } from "@/components/ui/useActionRunner";
import {
  updatePropertyRadarSettingsAction,
  runManualPropertyRadarSyncAction,
  runManualMarketSyncAction,
} from "@/lib/property-radar/settings/actions";
import type {
  ManualMarketResultDTO,
  ManualSyncResultDTO,
  PropertyRadarPageData,
  PropertyRadarSettingsForm,
} from "@/lib/property-radar/settings/types";
import type { PropertyProviderName } from "@/lib/property-radar/types";

function fmt(n: number): string {
  return n.toLocaleString("he-IL");
}
function dt(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "—";
  return new Date(ms).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" });
}

export function PropertyRadarSettingsView({ initial }: { initial: PropertyRadarPageData }) {
  const [form, setForm] = useState<PropertyRadarSettingsForm>(initial.settings);
  const [provider, setProvider] = useState<PropertyProviderName>(
    initial.health.find((h) => h.configured && h.enabled)?.provider ??
      initial.health[0]?.provider ??
      "yad2",
  );
  const selectedHealth = initial.health.find((h) => h.provider === provider);
  const [syncResult, setSyncResult] = useState<ManualSyncResultDTO | null>(null);
  const [marketResult, setMarketResult] = useState<ManualMarketResultDTO | null>(null);
  const runner = useActionRunner();
  const status = initial.status;

  const set = <K extends keyof PropertyRadarSettingsForm>(k: K, v: PropertyRadarSettingsForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  function save() {
    runner.run(() => updatePropertyRadarSettingsAction(form), {
      pendingMessage: "שומר הגדרות…",
      success: (r) => (r.ok ? "ההגדרות נשמרו" : r.error),
    });
  }

  function manualSync() {
    setSyncResult(null);
    runner.run(() => runManualPropertyRadarSyncAction({ providerName: provider }), {
      pendingMessage: "מריץ סריקה…",
      success: (r) => {
        if (!r.ok) return r.error;
        setSyncResult(r.data);
        if (r.data.skippedReason) return r.data.skippedReason;
        return `נסרקו ${fmt(r.data.scanned)} · יובאו ${fmt(r.data.newCount)} · התראות ${fmt(r.data.alerts)}`;
      },
    });
  }

  function marketSync() {
    setMarketResult(null);
    runner.run(() => runManualMarketSyncAction({ providerName: provider }), {
      pendingMessage: "מריץ סריקת שוק משותף…",
      success: (r) => {
        if (!r.ok) return r.error;
        setMarketResult(r.data);
        if (r.data.skippedReason) return r.data.skippedReason;
        return `אזורים ${fmt(r.data.areasProcessed)} · נסרקו ${fmt(r.data.scanned)} · מהמטמון ${fmt(r.data.cacheFresh)} · התראות ${fmt(r.data.alerts)}`;
      },
    });
  }

  const noAreas = status.activeAreasCount === 0;

  return (
    <div dir="rtl" className="flex flex-col gap-5">
      {/* Hero */}
      <div className="zono-gradient relative overflow-hidden rounded-[24px] p-6 text-white shadow-[var(--shadow-lift)]">
        <div className="absolute -left-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15"><Radar size={22} /></span>
          <div>
            <p className="text-xs font-bold text-white/80">ZONO · Property Radar</p>
            <h1 className="text-2xl font-black">סנכרון נכסים אוטומטי</h1>
          </div>
          <span className={`mr-auto rounded-full px-3 py-1 text-xs font-black ${form.sync_enabled ? "bg-white text-brand-strong" : "bg-white/20"}`}>
            {form.sync_enabled ? "פעיל" : "כבוי"}
          </span>
        </div>
        <p className="relative mt-2 max-w-2xl text-sm font-medium text-white/85">
          ZONO סורק אוטומטית את אזורי ההתמחות שלך, מזהה נכסים פרטיים חדשים ושולח לך התראה לפני המתחרים — בלי לבזבז קרדיטים.
        </p>
        <div className="relative mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-black">
            {initial.schedulerMode === "market" ? "מצב שוק משותף" : "מצב סוכן בודד"}
          </span>
          <span className="text-xs font-medium text-white/80">
            מצב שוק משותף סורק כל אזור פעם אחת בלבד ומחלק הזדמנויות רלוונטיות לכל הסוכנים שפועלים בו.
          </span>
        </div>
      </div>

      {/* Result / error banner */}
      {(runner.note || runner.error || runner.runningNote) && (
        <div className={`rounded-2xl px-4 py-3 text-sm font-semibold ${runner.error ? "bg-red-50 text-red-700" : "zono-glass text-ink"}`}>
          {runner.error ?? runner.note ?? runner.runningNote}
        </div>
      )}

      {/* Empty state: no areas */}
      {noAreas && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-800">
          <p className="flex items-center gap-2 text-sm font-black"><AlertTriangle size={18} /> עדיין לא הוגדרו אזורי התמחות</p>
          <p className="text-sm font-medium">כדי להפעיל את Property Radar יש להגדיר אזור התמחות אחד לפחות.</p>
          <Link href="/settings/operating-areas" className="inline-flex w-fit items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:brightness-110">
            <MapPin size={16} /> הגדר אזורי התמחות
          </Link>
        </div>
      )}

      {/* 1 · הפעלה וספקים */}
      <Section icon={<Radar size={18} />} title="הפעלה וספקים">
        <Toggle label="הפעל סנכרון אוטומטי" desc="מנוע הרדאר ירוץ אוטומטית כל שעה" checked={form.sync_enabled} onChange={(v) => set("sync_enabled", v)} />
        <Toggle label="מצב חכם מומלץ" desc="קצב סריקה משתנה לפי חום האזור — חוסך קרדיטים" checked={form.smart_sync_enabled} onChange={(v) => set("smart_sync_enabled", v)} />
        <div className="grid grid-cols-2 gap-2">
          <ProviderToggle label="יד2" available={initial.health.find((h) => h.provider === "yad2")} checked={form.provider_yad2_enabled} onChange={(v) => set("provider_yad2_enabled", v)} />
          <ProviderToggle label="מדלן" available={initial.health.find((h) => h.provider === "madlan")} checked={form.provider_madlan_enabled} onChange={(v) => set("provider_madlan_enabled", v)} />
        </div>

        {/* Provider health badges */}
        <div className="flex flex-col gap-1.5 rounded-xl bg-black/[0.03] p-3">
          {initial.health.map((h) => (
            <div key={h.provider} className="flex items-center gap-2 text-xs">
              <HealthBadge status={h.status} />
              <span className="font-bold text-ink">{h.label}</span>
              <span className="text-ink/55">{h.message}</span>
              {h.lastSuccessfulRunAt && <span className="mr-auto text-ink/45">סנכרון אחרון {dt(h.lastSuccessfulRunAt)}</span>}
            </div>
          ))}
          <p className="mt-1 border-t border-black/5 pt-1.5 text-[11px] text-ink/50">
            מצב ספק: <b>{initial.env.providerMode}</b> · טוקן Apify: {initial.env.apifyTokenExists ? "מוגדר" : "חסר"} · Actor יד2: {initial.env.yad2ActorConfigured ? "מוגדר" : "חסר"} · Actor מדלן: {initial.env.madlanActorConfigured ? "מוגדר" : "חסר"}
          </p>
        </div>
      </Section>

      {/* 2 · חיסכון בקרדיטים */}
      <Section icon={<Coins size={18} />} title="חיסכון בקרדיטים">
        <NumberRow label="מגבלת קרדיטים יומית" desc="0–100,000" value={form.max_daily_credits} min={0} max={100000} onChange={(v) => set("max_daily_credits", v)} />
        <NumberRow label="מקסימום עמודים לסריקה" desc="1–20" value={form.max_pages_per_scan} min={1} max={20} onChange={(v) => set("max_pages_per_scan", v)} />
        <NumberRow label="עצירה אחרי X מודעות מוכרות" desc="חוסך קריאות מיותרות" value={form.unchanged_streak_stop_threshold} min={1} max={100} onChange={(v) => set("unchanged_streak_stop_threshold", v)} />
      </Section>

      {/* 3 · התראות ופופאפים */}
      <Section icon={<Bell size={18} />} title="התראות ופופאפים">
        <Toggle label="התראות על נכסים פרטיים" desc="קבל התראה על כל נכס פרטי חדש באזור שלך" checked={form.private_property_alerts_enabled} onChange={(v) => set("private_property_alerts_enabled", v)} />
        <Toggle label="הצג פופאפים בזמן אמת" desc="פופאפ גלובלי בכל מסך כשמתגלה הזדמנות" checked={form.popup_alerts_enabled} onChange={(v) => set("popup_alerts_enabled", v)} />
        <Toggle label="הקפץ רק נכסים פרטיים" desc="התעלם ממודעות מתיווך בפופאפ" checked={form.only_private_popups} onChange={(v) => set("only_private_popups", v)} />
        <Toggle label="מצב שקט" desc="עדכן את המונה בלבד — בלי פופאפים" checked={form.quiet_mode_enabled} onChange={(v) => set("quiet_mode_enabled", v)} />
        <NumberRow label="ציון מינימלי להתראה" desc="0–100" value={form.min_popup_opportunity_score} min={0} max={100} onChange={(v) => set("min_popup_opportunity_score", v)} />
        <NumberRow label="מקסימום פופאפים ב־10 דקות" desc="מעבר לכך — סיכום מרוכז" value={form.max_popups_per_10_minutes} min={0} max={50} onChange={(v) => set("max_popups_per_10_minutes", v)} />
      </Section>

      {/* 4 · וואטסאפ */}
      <Section icon={<MessageSquare size={18} />} title="וואטסאפ">
        <label className="block text-sm font-bold text-ink">תבנית הודעת וואטסאפ</label>
        <p className="mb-1 text-xs text-ink/55">הודעה מוכנה שתישלח למפרסם בלחיצה אחת. השאר ריק לשימוש בתבנית ברירת המחדל של ZONO.</p>
        <textarea
          value={form.whatsapp_template}
          onChange={(e) => set("whatsapp_template", e.target.value)}
          rows={4}
          placeholder="היי, ראיתי שפרסמת נכס באזור… יש לי קונים רלוונטיים, אשמח לדבר."
          className="w-full rounded-xl border border-black/10 bg-white p-3 text-sm text-ink focus:border-brand focus:outline-none"
        />
      </Section>

      {/* Save bar */}
      <div className="sticky bottom-3 z-10 flex justify-end">
        <Button onClick={save} loading={runner.pending} leadingIcon={<Save size={16} />} variant="primary">
          שמור הגדרות
        </Button>
      </div>

      {/* 5 · סטטוס סנכרון */}
      <Section icon={<Activity size={18} />} title="סטטוס סנכרון">
        {!form.sync_enabled && (
          <p className="rounded-xl bg-black/5 px-3 py-2 text-sm font-bold text-ink/60">הסנכרון האוטומטי כבוי.</p>
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="סנכרון מוצלח אחרון" value={dt(status.lastSuccessfulSyncAt)} />
          <Stat label="סנכרון הבא (משוער)" value={dt(status.nextEstimatedSyncAt)} />
          <Stat label="אזורי התמחות פעילים" value={fmt(status.activeAreasCount)} />
          <Stat label="ספקים פעילים" value={status.providersEnabled.join(" · ") || "—"} />
          <Stat label="קרדיטים שנוצלו היום" value={fmt(status.creditsUsedToday)} />
          <Stat label="קרדיטים שנותרו היום" value={fmt(status.creditsRemainingToday)} />
          <Stat label="נכסים חדשים היום" value={fmt(status.newListingsToday)} />
          <Stat label="התראות שנוצרו היום" value={fmt(status.alertsCreatedToday)} />
          <Stat label="קרדיטים שנחסכו היום" value={`~${fmt(status.creditsSavedToday)}`} highlight />
        </div>
        <p className="rounded-xl bg-brand-soft/50 px-3 py-2 text-sm font-semibold text-brand-strong">
          נסרקו היום {fmt(status.scannedToday)} מודעות, יובאו {fmt(status.newListingsToday)} בלבד, נחסכו כ־{fmt(status.creditsSavedToday)} קריאות.
        </p>

        {/* Last 5 runs */}
        <div className="mt-1">
          <p className="mb-2 text-xs font-black text-ink/60">5 הסריקות האחרונות</p>
          {status.recentRuns.length === 0 ? (
            <p className="text-sm text-ink/50">עוד לא בוצעו סריקות.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {status.recentRuns.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-black/[0.03] px-3 py-2 text-xs">
                  <span className={`rounded-md px-2 py-0.5 font-bold ${r.status === "success" ? "bg-emerald-100 text-emerald-700" : r.status === "failed" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{r.status}</span>
                  <span className="font-bold text-ink">{r.provider}</span>
                  <span className="text-ink/60">{r.city ?? "—"}</span>
                  <span className="text-ink/50">{r.runType}</span>
                  <span className="mr-auto text-ink/55">{dt(r.startedAt)}</span>
                  <span className="font-semibold text-brand-strong">חדש {fmt(r.newCount)} · נסרק {fmt(r.scanned)} · נחסך {fmt(r.creditsSaved)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </Section>

      {/* 5.5 · שכבת שוק משותפת */}
      <Section icon={<Activity size={18} />} title="שכבת שוק משותפת">
        <p className="text-sm text-ink/60">
          ZONO סורק כל אזור פעם אחת ומשתף את המידע הרלוונטי בין סוכנים. כך נחסכות סריקות כפולות וקרדיטים.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="אזורים במטמון" value={fmt(initial.market.areasCount)} />
          <Stat label="טרי" value={fmt(initial.market.freshCount)} />
          <Stat label="לא עדכני / סורק" value={`${fmt(initial.market.staleCount)} / ${fmt(initial.market.scanningCount)}`} />
          <Stat label="שגיאה" value={fmt(initial.market.errorCount)} />
          <Stat label="סריקה משותפת אחרונה" value={dt(initial.market.lastMarketScanAt)} />
          <Stat label="סריקות כפולות שנחסכו" value={`~${fmt(initial.market.duplicateScansAvoided)}`} highlight />
        </div>
      </Section>

      {/* 6 · בדיקה ידנית */}
      <Section icon={<PlayCircle size={18} />} title="בדיקה ידנית">
        <p className="text-sm text-ink/60">הרץ סריקה מיידית לארגון שלך בלבד. הסריקה מכבדת את מגבלת הקרדיטים וההגדרות.</p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as PropertyProviderName)}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-bold text-ink focus:border-brand focus:outline-none"
          >
            {initial.health.map((h) => (
              <option key={h.provider} value={h.provider}>
                {h.label}{h.provider !== "mock" && !h.configured ? " (לא מוגדר)" : ""}
              </option>
            ))}
          </select>
          <Button
            onClick={manualSync}
            loading={runner.pending}
            disabled={!form.sync_enabled || noAreas || (provider !== "mock" && !(selectedHealth?.configured && selectedHealth?.enabled))}
            leadingIcon={<Sparkles size={16} />}
            variant="secondary"
          >
            הפעל סריקה עכשיו
          </Button>
          <Button
            onClick={marketSync}
            loading={runner.pending}
            disabled={!form.sync_enabled || noAreas || (provider !== "mock" && !(selectedHealth?.configured && selectedHealth?.enabled))}
            leadingIcon={<Activity size={16} />}
            variant="ghost"
          >
            סריקה דרך מטמון שוק משותף
          </Button>
        </div>

        {marketResult && (
          <div className={`rounded-2xl border p-4 ${marketResult.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            {marketResult.skippedReason ? (
              <p className="text-sm font-bold text-amber-800">{marketResult.skippedReason}</p>
            ) : (
              <>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-black text-emerald-800"><CheckCircle2 size={16} /> סריקת שוק משותף הושלמה</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                  <MiniStat label="אזורים" value={marketResult.areasProcessed} />
                  <MiniStat label="נסרקו" value={marketResult.scanned} />
                  <MiniStat label="מהמטמון" value={marketResult.cacheFresh} />
                  <MiniStat label="לינקים" value={marketResult.linksCreated} />
                  <MiniStat label="התראות" value={marketResult.alerts} />
                </div>
                {marketResult.cacheFresh > 0 && (
                  <p className="mt-2 text-xs font-semibold text-brand-strong">
                    {fmt(marketResult.cacheFresh)} אזורים הוגשו מהמטמון המשותף (ללא קריאה לספק) — נחסכו קרדיטים.
                  </p>
                )}
              </>
            )}
          </div>
        )}
        {provider !== "mock" && selectedHealth && !selectedHealth.configured && (
          <p className="text-xs font-bold text-amber-700">{selectedHealth.label} אינו מוגדר — לא ניתן להריץ סריקה.</p>
        )}

        {syncResult && (
          <div className={`rounded-2xl border p-4 ${syncResult.ok ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            {syncResult.skippedReason ? (
              <p className="text-sm font-bold text-amber-800">{syncResult.skippedReason}</p>
            ) : (
              <>
                <p className="mb-2 flex items-center gap-1.5 text-sm font-black text-emerald-800"><CheckCircle2 size={16} /> הסריקה הושלמה</p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  <MiniStat label="נסרקו" value={syncResult.scanned} />
                  <MiniStat label="חדשים" value={syncResult.newCount} />
                  <MiniStat label="עודכנו" value={syncResult.updatedCount} />
                  <MiniStat label="ללא שינוי" value={syncResult.unchangedCount} />
                  <MiniStat label="נעלמו" value={syncResult.missingCount} />
                  <MiniStat label="נמחקו" value={syncResult.deletedCount} />
                  <MiniStat label="התראות" value={syncResult.alerts} />
                  <MiniStat label="קרדיטים" value={syncResult.creditsUsed} />
                </div>
              </>
            )}
            {syncResult.errors.length > 0 && (
              <p className="mt-2 text-xs text-red-700">{syncResult.errors.slice(0, 3).join(" · ")}</p>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}

// ── Building blocks ──────────────────────────────────────────────────────────
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="zono-glass flex flex-col gap-3 rounded-2xl p-5">
      <h2 className="flex items-center gap-2 text-base font-black text-ink">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-soft text-brand-strong">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 rounded-xl px-1 py-1.5 text-right hover:bg-black/[0.02]">
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "bg-brand-strong" : "bg-black/15"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "right-0.5" : "right-[22px]"}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{label}</span>
        {desc && <span className="block text-xs text-ink/55">{desc}</span>}
      </span>
    </button>
  );
}

function ProviderToggle({ label, available, checked, onChange }: { label: string; available?: { implemented: boolean; configured: boolean }; checked: boolean; onChange: (v: boolean) => void }) {
  const soon = available && !available.implemented;
  return (
    <button type="button" disabled={soon} onClick={() => onChange(!checked)}
      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition ${checked && !soon ? "border-brand bg-brand-soft/50 text-brand-strong" : "border-black/10 text-ink/70"}`}>
      <span>{label}</span>
      {soon ? (
        <span className="rounded-md bg-black/10 px-2 py-0.5 text-[11px]">בקרוב</span>
      ) : available && !available.configured ? (
        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[11px] text-amber-700">לא מוגדר</span>
      ) : (
        <span className={`h-2.5 w-2.5 rounded-full ${checked ? "bg-emerald-500" : "bg-black/20"}`} />
      )}
    </button>
  );
}

function NumberRow({ label, desc, value, min, max, onChange }: { label: string; desc?: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{label}</span>
        {desc && <span className="block text-xs text-ink/55">{desc}</span>}
      </span>
      <input
        type="number" inputMode="numeric" value={value} min={min} max={max}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : min);
        }}
        className="w-24 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-bold text-ink focus:border-brand focus:outline-none"
      />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-brand-soft/60" : "bg-black/[0.03]"}`}>
      <p className="text-[11px] font-semibold text-ink/55">{label}</p>
      <p className={`mt-0.5 text-sm font-black ${highlight ? "text-brand-strong" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white/70 p-2 text-center">
      <p className="text-base font-black text-ink">{value.toLocaleString("he-IL")}</p>
      <p className="text-[11px] text-ink/55">{label}</p>
    </div>
  );
}

function HealthBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    online: { label: "מחובר", cls: "bg-emerald-100 text-emerald-700" },
    not_configured: { label: "לא מוגדר", cls: "bg-amber-100 text-amber-700" },
    disabled: { label: "כבוי", cls: "bg-black/10 text-ink/60" },
    error: { label: "שגיאה", cls: "bg-red-100 text-red-700" },
    unknown: { label: "—", cls: "bg-black/10 text-ink/60" },
  };
  const v = map[status] ?? map.unknown;
  return <span className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${v.cls}`}>{v.label}</span>;
}
