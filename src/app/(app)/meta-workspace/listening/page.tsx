// ============================================================================
// 🌐 ZONO — Meta Workspace (Batch 6.9) · Social Listening feed. Phase 5 UI (RTL).
// A provider-isolated feed of Meta-SUPPORTED mentions + tagged content for CONNECTED
// assets. Filters (source/platform/kind/match/sentiment/intent/urgency/status/search/
// date), incremental pagination, intelligence badges, matched-post context, and safe
// operational controls. Every field shown is canonical + safe — never a token, raw
// Graph payload, raw cursor, webhook body, or raw AI output. The browser never calls
// Meta; refresh only schedules work. Capability/token-health blocked states surfaced.
// ============================================================================
import { getSessionContext } from "@/lib/auth/session";
import { resolveRoleKey } from "@/lib/auth/role";
import { listSources, listMentions, canViewListening, canConfigureListening, canRefreshListening, canChangeMentionStatus } from "@/lib/meta/listening/service";
import type { MentionFilter, MentionSort, MentionKind, MentionStatus } from "@/lib/meta/listening/domain";
import type { MetaPlatform } from "@/lib/meta/types";
import { ListeningControls, MentionActions } from "./_controls";

export const dynamic = "force-dynamic";

const PLATFORM = new Set(["facebook", "instagram"]);
const KIND = new Set(["page_mention", "account_mention", "media_tag", "caption_mention", "comment_mention", "tagged_media", "unknown_supported"]);
const STATUS = new Set(["new", "reviewed", "actionable", "ignored", "resolved", "unavailable"]);
const PLATFORM_LABEL: Record<string, string> = { facebook: "פייסבוק", instagram: "אינסטגרם" };
const STATUS_LABEL: Record<string, string> = { new: "חדש", reviewed: "נבדק", actionable: "לטיפול", ignored: "בוטל", resolved: "נסגר", unavailable: "לא זמין" };
const MATCH_LABEL: Record<string, string> = { asset: "נכס", provider_object: "פוסט", canonical_mapping: "פוסט", parent_child: "פוסט", unmatched: "לא משויך" };
const PAGE = 25;
type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function ListeningPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sc = await getSessionContext();
  if (sc.state !== "ready" || !sc.profile?.org_id) return <main dir="rtl" className="p-8 text-center text-gray-600">נדרשת התחברות.</main>;
  const role = await resolveRoleKey(sc.profile);
  if (!canViewListening(role)) return <main dir="rtl" className="p-8 text-center text-gray-600">אין הרשאה להאזנה חברתית.</main>;
  const orgId = sc.profile.org_id;
  const sp = await searchParams;

  const filter: MentionFilter = {};
  const src = one(sp.source); if (src) filter.sourceId = src;
  const platform = one(sp.platform); if (platform && PLATFORM.has(platform)) filter.platform = platform as MetaPlatform;
  const kind = one(sp.kind); if (kind && KIND.has(kind)) filter.mentionKind = kind as MentionKind;
  const match = one(sp.match); if (match === "matched" || match === "unmatched") filter.matchState = match;
  const status = one(sp.status); if (status && STATUS.has(status)) filter.status = status as MentionStatus;
  const sentiment = one(sp.sentiment); if (sentiment) filter.sentiment = sentiment;
  const intent = one(sp.intent); if (intent) filter.intent = intent;
  const urgency = one(sp.urgency); if (urgency) filter.urgency = urgency;
  const q = one(sp.q); if (q && q.trim()) filter.query = q.trim().slice(0, 200);
  const since = one(sp.since); if (since) filter.sinceIso = since;
  const until = one(sp.until); if (until) filter.untilIso = until;
  const sort: MentionSort = one(sp.sort) === "oldest" ? "oldest" : "recent";
  const offset = Math.max(0, Number(one(sp.offset) ?? 0) || 0);

  const [sources, feed] = await Promise.all([listSources(orgId), listMentions(orgId, filter, sort, { limit: PAGE, offset })]);
  const blocked = sources.filter((s) => s.enabled && s.capabilityState !== "allowed");
  const degraded = sources.filter((s) => s.lastSyncStatus === "degraded" || s.lastSyncStatus === "error");
  const srcName = (id: string) => { const s = sources.find((x) => x.id === id); return s ? `${PLATFORM_LABEL[s.platform] ?? s.platform} · ${s.sourceKind}` : id; };

  const mk = (patch: Record<string, string | undefined>) => { const u = new URLSearchParams(); const cur: Record<string, string | undefined> = { source: src, platform, kind, match, status, sentiment, intent, urgency, q, since, until, sort: one(sp.sort), offset: String(offset), ...patch }; for (const [k, v] of Object.entries(cur)) if (v) u.set(k, v); const s = u.toString(); return s ? `?${s}` : ""; };

  return (
    <main dir="rtl" className="mx-auto max-w-4xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-gray-500">{feed.total} אזכורים</span>
        <h1 className="text-2xl font-bold">האזנה חברתית</h1>
      </div>
      <p className="mb-4 text-sm text-gray-500">אזכורים ותיוגים מנכסים מחוברים בלבד (פייסבוק/אינסטגרם) — קריאה בלבד דרך Meta. הדפדפן אינו פונה ל‑Meta; רענון מתזמן עבודה בלבד.</p>

      {sources.length === 0 && <p className="mb-4 rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-500">לא הוגדרו מקורות האזנה. ניתן להגדיר מקור מנכס מחובר.</p>}
      {blocked.length > 0 && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{blocked.length} מקורות חסומים (יכולת/הרשאה — ייתכן Advanced Access / App Review). הפעולה מושבתת עד לאישור.</p>}
      {degraded.length > 0 && <p className="mb-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-800">{degraded.length} מקורות במצב מוגבל אצל הספק.</p>}

      <ListeningControls
        sources={sources.map((s) => ({ id: s.id, label: srcName(s.id), enabled: s.enabled, capabilityState: s.capabilityState, lastSyncStatus: s.lastSyncStatus, safeBlockReason: s.safeBlockReason }))}
        canConfigure={canConfigureListening(role)} canRefresh={canRefreshListening(role)}
      />

      {feed.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-400">אין אזכורים התואמים לסינון.</p>
      ) : (
        <ul className="space-y-2">
          {feed.items.map((m) => (
            <li key={m.id} className="rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{m.authorDisplay ?? "משתמש"}</span>
                <span className="text-xs text-gray-500">{PLATFORM_LABEL[m.platform] ?? m.platform} · {MATCH_LABEL[m.matchState] ?? m.matchState} · {STATUS_LABEL[m.status] ?? m.status}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-gray-800">{m.text || "—"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-400">
                {m.providerCreatedAt && <span>{new Date(m.providerCreatedAt).toLocaleString("he-IL")}</span>}
                <span className="rounded bg-gray-100 px-1.5 py-0.5">{srcName(m.sourceId)}</span>
                {m.sentiment && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">רגש: {m.sentiment}</span>}
                {m.intent && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">כוונה: {m.intent}</span>}
                {m.urgency && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700">דחיפות: {m.urgency}</span>}
                {m.hasInboxProjection && <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">בתיבת הדואר</span>}
              </div>
              {canChangeMentionStatus(role) && <MentionActions id={m.id} matched={m.matchState !== "unmatched"} projected={m.hasInboxProjection} />}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 flex items-center justify-between text-sm">
        <div className="flex gap-2">
          {offset > 0 && <a href={mk({ offset: String(Math.max(0, offset - PAGE)) })} className="rounded border border-gray-300 px-3 py-1">→ הקודם</a>}
          {offset + PAGE < feed.total && <a href={mk({ offset: String(offset + PAGE) })} className="rounded border border-gray-300 px-3 py-1">הבא ←</a>}
        </div>
        <span className="text-gray-400">{feed.total} אזכורים</span>
      </div>
    </main>
  );
}
