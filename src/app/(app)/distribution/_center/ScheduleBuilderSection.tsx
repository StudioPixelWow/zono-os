"use client";

// ============================================================================
// ZONO — Schedule Builder (Phase 5). Builds a posting queue from a campaign ×
// groups × variations with smart-timing rules. Calls the real scheduler actions
// only (preview/create); no mock data, no DB access here.
// ============================================================================
import { useEffect, useMemo, useState, useTransition } from "react";
import type { CenterGroup, CenterCampaign } from "@/lib/distribution/center-data";
import {
  createPostingQueueAction,
  previewPostingQueueAction,
  getCampaignVariationsAction,
  type BuilderVariation,
} from "@/lib/distribution/distribution-actions";
import type { ScheduleConfig } from "@/lib/distribution/scheduler-planner";
import { cn } from "@/lib/utils";
import { Glass, SectionHeading, EmptyState, Icon } from "./shared";
import type { RunActionAsync } from "./DistributionCenterView";

const CAMPAIGN_STATUS_LABEL: Record<string, string> = {
  draft: "טיוטה", scheduled: "מתוזמן", active: "פעיל", paused: "מושהה", completed: "הושלם", archived: "בארכיון",
};

/** A datetime-local default a day ahead at 10:00, formatted for the input. */
function defaultStart(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return iso; }
}

const field = "border-line bg-card/70 text-ink focus:border-brand focus:ring-brand/30 w-full rounded-xl border px-3 py-2 text-sm font-semibold outline-none focus:ring-2";
const labelCls = "text-ink mb-1.5 block text-xs font-bold";

export function ScheduleBuilderSection({
  campaigns,
  groups,
  runActionAsync,
}: {
  campaigns: CenterCampaign[];
  groups: CenterGroup[];
  runActionAsync: RunActionAsync;
}) {
  const [campaignId, setCampaignId] = useState<string>("");
  const [startDate, setStartDate] = useState<string>(defaultStart());
  const [endDate, setEndDate] = useState<string>("");
  const [windowStartHour, setWindowStartHour] = useState<number>(9);
  const [windowEndHour, setWindowEndHour] = useState<number>(21);
  const [delayMinutes, setDelayMinutes] = useState<number>(45);
  const [maxPostsPerDay, setMaxPostsPerDay] = useState<number>(8);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [variationIds, setVariationIds] = useState<string[]>([]);

  const [variations, setVariations] = useState<BuilderVariation[]>([]);
  const [loadingVars, startLoadVars] = useTransition();
  const [previewing, startPreview] = useTransition();
  const [creating, startCreate] = useTransition();
  // A preview is tagged with the config signature it was computed for; if the
  // current signature differs, the preview is stale and we hide it at render —
  // no setState-in-effect needed.
  const [preview, setPreview] = useState<{ sig: string; planned: { groupId: string; variationId: string; scheduledAt: string }[] } | null>(null);
  const [previewError, setPreviewError] = useState<{ sig: string; msg: string } | null>(null);

  // Load variations when a campaign is chosen; default-check the AI-selected ones.
  // All state updates run inside the transition callback (never synchronously in
  // the effect body) so we don't trigger cascading renders.
  useEffect(() => {
    startLoadVars(async () => {
      if (!campaignId) { setVariations([]); setVariationIds([]); return; }
      const { variations: vs } = await getCampaignVariationsAction(campaignId);
      setVariations(vs);
      setVariationIds(vs.filter((v) => v.isSelected).map((v) => v.id));
    });
  }, [campaignId]);

  const configSig = useMemo(
    () => JSON.stringify([campaignId, startDate, endDate, windowStartHour, windowEndHour, delayMinutes, maxPostsPerDay, [...groupIds].sort(), [...variationIds].sort()]),
    [campaignId, startDate, endDate, windowStartHour, windowEndHour, delayMinutes, maxPostsPerDay, groupIds, variationIds],
  );

  const groupOptions = useMemo(() => {
    const target = campaigns.find((c) => c.id === campaignId)?.targetCity;
    return [...groups].sort((a, b) => {
      const am = target && a.city === target ? 0 : 1;
      const bm = target && b.city === target ? 0 : 1;
      if (am !== bm) return am - bm;
      return a.name.localeCompare(b.name, "he");
    });
  }, [groups, campaigns, campaignId]);

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function buildConfig(): ScheduleConfig {
    return {
      campaignId,
      startDate: new Date(startDate).toISOString(),
      windowStartHour, windowEndHour, delayMinutes, maxPostsPerDay,
      groupIds, variationIds,
      endDate: endDate ? new Date(endDate).toISOString() : null,
    };
  }

  // Render-safe validation (no impure Date calls). Disables the action buttons.
  function staticErrors(): string | null {
    if (!campaignId) return "יש לבחור קמפיין";
    if (groupIds.length === 0) return "יש לבחור לפחות קבוצה אחת";
    if (variationIds.length === 0) return "יש לבחור לפחות וריאציה אחת";
    if (!startDate || Number.isNaN(Date.parse(startDate))) return "תאריך התחלה לא תקין";
    if (windowEndHour <= windowStartHour) return "שעת סיום החלון חייבת להיות אחרי שעת ההתחלה";
    return null;
  }

  // Full validation, including the future-date check (called only in handlers,
  // never during render — Date.now() is impure).
  function validateNow(): string | null {
    const s = staticErrors();
    if (s) return s;
    if (new Date(startDate).getTime() <= Date.now()) return "יש לבחור תאריך התחלה עתידי";
    return null;
  }

  function onPreview() {
    const err = validateNow();
    if (err) { setPreviewError({ sig: configSig, msg: err }); setPreview(null); return; }
    const sig = configSig;
    startPreview(async () => {
      const res = await previewPostingQueueAction(buildConfig());
      if (res.error) { setPreviewError({ sig, msg: res.error }); setPreview(null); }
      else { setPreview({ sig, planned: res.planned ?? [] }); setPreviewError(null); }
    });
  }

  function onCreate() {
    const err = validateNow();
    if (err) { setPreviewError({ sig: configSig, msg: err }); return; }
    startCreate(async () => {
      // Run the action ourselves so we can derive the created/skipped toast,
      // then hand a pre-resolved result to runActionAsync (which toasts + refreshes).
      const res = await createPostingQueueAction(buildConfig());
      const okMsg = `נוצרו ${res.created ?? 0} פוסטים בתור${res.skipped ? ` · דולגו ${res.skipped} כפילויות` : ""}`;
      await runActionAsync(async () => res, okMsg);
      if (!res.error) setPreview(null);
    });
  }

  const busy = loadingVars || previewing || creating;
  const cErr = staticErrors();
  // Only surface a preview / error that matches the current configuration.
  const livePreview = preview && preview.sig === configSig ? preview.planned : null;
  const liveError = previewError && previewError.sig === configSig ? previewError.msg : null;

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <SectionHeading title="בניית תור פרסום" subtitle="תזמון חכם של פוסטים על פני קבוצות ווריאציות" icon="CalendarClock" />
        <EmptyState icon="Megaphone" title="אין עדיין קמפיינים" body="צור קמפיין ובחר קבוצות בלשונית בניית הקמפיין — ואז תוכל לתזמן את תור הפרסום כאן." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionHeading title="בניית תור פרסום" subtitle="ZONO מתזמן את הפוסטים בצורה חכמה — חלון שעות, השהיה בין פוסטים ותקרה יומית" icon="CalendarClock" />

      <Glass className="flex flex-col gap-5 p-5">
        {/* Campaign + dates */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className={labelCls}>קמפיין</label>
            <select className={field} value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
              <option value="">בחר קמפיין…</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {CAMPAIGN_STATUS_LABEL[c.status] ?? c.status}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>התחלה</label>
            <input type="datetime-local" className={field} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>סיום (אופציונלי)</label>
            <input type="datetime-local" className={field} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        {/* Timing rules */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <label className={labelCls}>חלון — שעת התחלה</label>
            <select className={field} value={windowStartHour} onChange={(e) => setWindowStartHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>חלון — שעת סיום</label>
            <select className={field} value={windowEndHour} onChange={(e) => setWindowEndHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>השהיה בין פוסטים (דק׳)</label>
            <input type="number" min={1} className={field} value={delayMinutes} onChange={(e) => setDelayMinutes(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div>
            <label className={labelCls}>מקסימום פוסטים ליום</label>
            <input type="number" min={1} className={field} value={maxPostsPerDay} onChange={(e) => setMaxPostsPerDay(Math.max(1, Number(e.target.value) || 1))} />
          </div>
        </div>

        {/* Groups */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className={labelCls + " mb-0"}>קבוצות ({groupIds.length})</label>
            {groups.length > 0 && (
              <button type="button" className="text-brand-strong text-xs font-bold"
                onClick={() => setGroupIds(groupIds.length === groupOptions.length ? [] : groupOptions.map((g) => g.id))}>
                {groupIds.length === groupOptions.length ? "נקה הכל" : "בחר הכל"}
              </button>
            )}
          </div>
          {groups.length === 0 ? (
            <p className="text-muted bg-line/40 rounded-xl px-3 py-2 text-xs font-semibold">אין קבוצות בספרייה — הוסף קבוצות תחילה.</p>
          ) : (
            <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {groupOptions.map((g) => {
                const on = groupIds.includes(g.id);
                return (
                  <button key={g.id} type="button" onClick={() => setGroupIds(toggle(groupIds, g.id))}
                    className={cn("flex items-center gap-2 rounded-xl border px-3 py-2 text-right text-xs font-bold transition",
                      on ? "border-brand bg-brand-soft text-brand-strong" : "border-line bg-card/60 text-ink hover:border-brand/40")}>
                    <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-brand bg-brand text-white" : "border-line")}>
                      {on && <Icon name="Check" size={11} />}
                    </span>
                    <span className="min-w-0 truncate">{g.name}{g.city ? ` · ${g.city}` : ""}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Variations */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className={labelCls + " mb-0"}>וריאציות ({variationIds.length})</label>
            {variations.length > 0 && (
              <button type="button" className="text-brand-strong text-xs font-bold"
                onClick={() => setVariationIds(variationIds.length === variations.length ? [] : variations.map((v) => v.id))}>
                {variationIds.length === variations.length ? "נקה הכל" : "בחר הכל"}
              </button>
            )}
          </div>
          {!campaignId ? (
            <p className="text-muted bg-line/40 rounded-xl px-3 py-2 text-xs font-semibold">בחר קמפיין כדי לטעון את הוריאציות.</p>
          ) : loadingVars ? (
            <p className="text-muted bg-line/40 rounded-xl px-3 py-2 text-xs font-semibold">טוען וריאציות…</p>
          ) : variations.length === 0 ? (
            <p className="text-muted bg-line/40 rounded-xl px-3 py-2 text-xs font-semibold">אין וריאציות לקמפיין זה — צור וריאציות AI תחילה.</p>
          ) : (
            <div className="grid max-h-56 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {variations.map((v) => {
                const on = variationIds.includes(v.id);
                return (
                  <button key={v.id} type="button" onClick={() => setVariationIds(toggle(variationIds, v.id))}
                    className={cn("flex items-start gap-2 rounded-xl border px-3 py-2 text-right transition",
                      on ? "border-brand bg-brand-soft" : "border-line bg-card/60 hover:border-brand/40")}>
                    <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border", on ? "border-brand bg-brand text-white" : "border-line")}>
                      {on && <Icon name="Check" size={11} />}
                    </span>
                    <span className="min-w-0">
                      <span className="text-ink flex items-center gap-1.5 text-xs font-extrabold">
                        <span className="truncate">{v.headline ?? v.angle ?? "וריאציה"}</span>
                        {v.isSelected && <span className="bg-brand-soft text-brand-strong shrink-0 rounded-full px-1.5 text-[10px] font-bold">מומלץ AI</span>}
                      </span>
                      {v.hook && <span className="text-muted mt-0.5 block truncate text-[11px] font-medium">{v.hook}</span>}
                      <span className="text-muted mt-0.5 flex gap-2 text-[10px] font-bold tabular-nums">
                        <span>WOW {Math.round(v.wowScore)}</span>
                        <span>· מעורבות {Math.round(v.engagementScore)}</span>
                        <span>· לידים {Math.round(v.leadScore)}</span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Validation hint */}
        {(cErr || liveError) && (
          <p className="text-danger bg-danger-soft rounded-xl px-3 py-2 text-xs font-bold">
            <Icon name="AlertTriangle" size={12} className="ml-1 inline" />{liveError ?? cErr}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy || !!cErr} onClick={onPreview}
            className="zono-glass text-ink hover:text-brand-strong inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition disabled:opacity-50">
            <Icon name="Eye" size={16} /> {previewing ? "מחשב…" : "תצוגה מקדימה"}
          </button>
          <button type="button" disabled={busy || !!cErr} onClick={onCreate}
            className="zono-gradient inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-[var(--shadow-soft)] transition hover:brightness-105 disabled:opacity-50">
            <Icon name="Send" size={16} /> {creating ? "יוצר…" : "צור תור פרסום"}
          </button>
        </div>
      </Glass>

      {/* Preview result */}
      {livePreview && (
        <Glass className="flex flex-col gap-3 p-5">
          <div className="flex items-center gap-2">
            <Icon name="ListChecks" size={16} className="text-brand-strong" />
            <p className="text-ink text-sm font-extrabold">תצוגה מקדימה</p>
            <span className="bg-brand-soft text-brand-strong rounded-full px-2 py-0.5 text-xs font-bold tabular-nums">{livePreview.length} פוסטים מתוכננים</span>
          </div>
          {livePreview.length === 0 ? (
            <p className="text-muted text-xs font-semibold">לא נוצרו משבצות זמן עבור הקונפיגורציה הזו — נסה להרחיב את טווח התאריכים או החלון.</p>
          ) : (
            <ol className="flex flex-col gap-1.5">
              {livePreview.slice(0, 8).map((p, i) => {
                const g = groups.find((x) => x.id === p.groupId);
                return (
                  <li key={`${p.groupId}-${p.variationId}-${i}`} className="bg-card/60 border-line flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-semibold">
                    <span className="text-ink min-w-0 truncate">{i + 1}. {g?.name ?? "קבוצה"}</span>
                    <span className="text-brand-strong shrink-0 tabular-nums">{fmtTime(p.scheduledAt)}</span>
                  </li>
                );
              })}
              {livePreview.length > 8 && <li className="text-muted px-1 text-[11px] font-semibold">ועוד {livePreview.length - 8} פוסטים…</li>}
            </ol>
          )}
        </Glass>
      )}
    </div>
  );
}
