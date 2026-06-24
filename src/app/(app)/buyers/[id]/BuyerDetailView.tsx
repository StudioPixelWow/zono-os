"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  DEAL_KIND_LABELS,
  PROPERTY_TYPE_LABELS,
  SOURCE_LABELS,
  TEMPERATURE_LABELS,
  TEMPERATURE_TONES,
  buyerBudgetLine,
  buyerPreferences,
  buyerRoomsLine,
  type BuyerRow,
} from "@/lib/buyers/labels";
import { BuyerTasksPanel } from "./BuyerTasksPanel";
import type { Database } from "@/lib/supabase/types";
import { BuyerCommandCenter } from "./BuyerCommandCenter";
import type { BuyerCommandCenter as BuyerCCData } from "@/lib/buyer-intelligence/service";
import type { RecoItemView } from "@/components/activity/RecommendedMatches";
import type { BuyerPropertyMatch } from "@/lib/matching-intelligence/service";
import { recalcMatchesAction } from "@/lib/matching-intelligence/actions";

type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
type TaskRow = Database["public"]["Tables"]["tasks"]["Row"];
type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
type MeetingRow = Database["public"]["Tables"]["meetings"]["Row"];

type Tab =
  | "command"
  | "overview"
  | "preferences"
  | "activities"
  | "tasks"
  | "notes"
  | "meetings"
  | "matches";
const TABS: { id: Tab; label: string }[] = [
  { id: "command", label: "מרכז ניהול קונה" },
  { id: "overview", label: "סקירה" },
  { id: "preferences", label: "העדפות" },
  { id: "activities", label: "פעילות" },
  { id: "tasks", label: "משימות" },
  { id: "notes", label: "הערות" },
  { id: "meetings", label: "פגישות" },
  { id: "matches", label: "התאמות" },
];

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString("he-IL") : "—";

function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="text-muted flex flex-col items-center gap-2 py-12 text-center text-sm">
      <span className="bg-surface text-muted grid h-12 w-12 place-items-center rounded-2xl">
        <Icon name={icon} size={22} />
      </span>
      {text}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="border-line flex items-center justify-between border-b py-2.5 last:border-0">
      <span className="text-muted text-sm">{k}</span>
      <span className="text-ink text-sm font-semibold">{v}</span>
    </div>
  );
}

export function BuyerDetailView({
  buyer: b,
  activities,
  tasks,
  notes,
  meetings,
  commandCenter,
  recommendations,
  buyerMatches,
}: {
  buyer: BuyerRow;
  activities: ActivityRow[];
  tasks: TaskRow[];
  notes: NoteRow[];
  meetings: MeetingRow[];
  commandCenter: BuyerCCData | null;
  recommendations: RecoItemView[];
  buyerMatches: BuyerPropertyMatch[];
}) {
  const [tab, setTab] = useState<Tab>("command");
  const prefs = buyerPreferences(b);
  const yes = "כן";
  const no = "—";

  const typesText = b.preferred_types.length
    ? b.preferred_types.map((t) => PROPERTY_TYPE_LABELS[t]).join(", ")
    : no;
  const areasText = b.preferred_areas.length ? b.preferred_areas.join(", ") : no;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <Link
          href="/buyers"
          className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold"
        >
          <Icon name="ChevronRight" size={16} />
          חזרה לקונים
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-ink text-2xl font-black">{b.full_name}</h1>
              {b.temperature && (
                <Badge tone={TEMPERATURE_TONES[b.temperature]}>
                  {TEMPERATURE_LABELS[b.temperature]}
                </Badge>
              )}
            </div>
            <p className="text-muted mt-1 text-sm">
              {b.phone ?? "—"}
              {b.email ? ` · ${b.email}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {b.phone && (
              <a href={`tel:${b.phone}`}>
                <Button variant="secondary" leadingIcon={<Icon name="MessageCircle" size={16} />}>
                  התקשר
                </Button>
              </a>
            )}
            <Link href={`/buyers/${b.id}/edit`}>
              <Button variant="ghost" leadingIcon={<Icon name="Settings" size={16} />}>
                עריכה
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Budget banner */}
      <div className="bg-brand-soft text-brand-strong flex items-baseline gap-2 rounded-[20px] px-5 py-4">
        <span className="text-2xl font-black">{buyerBudgetLine(b)}</span>
        <span className="text-sm font-semibold">{buyerRoomsLine(b)}</span>
      </div>

      {/* Tabs */}
      <div className="border-line flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "relative whitespace-nowrap px-4 py-2.5 text-sm font-bold transition",
              tab === t.id ? "text-brand-strong" : "text-muted hover:text-ink",
            )}
          >
            {t.label}
            {tab === t.id && (
              <span className="bg-brand absolute inset-x-2 -bottom-px h-0.5 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Panels */}
      <div className={cn(tab !== "command" && "bg-card border-line rounded-[20px] border p-5")}>
        {tab === "command" && (
          <BuyerCommandCenter buyerId={b.id} buyerName={b.full_name} data={commandCenter} recommendations={recommendations} />
        )}

        {tab === "overview" && (
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div>
              <Row k="טלפון" v={b.phone ?? no} />
              <Row k="אימייל" v={b.email ?? no} />
              <Row k="תקציב" v={buyerBudgetLine(b)} />
              <Row k="חדרים" v={buyerRoomsLine(b)} />
            </div>
            <div>
              <Row k="סוג עסקה" v={prefs.deal_kind ? DEAL_KIND_LABELS[prefs.deal_kind] : no} />
              <Row k="מקור" v={prefs.source ? SOURCE_LABELS[prefs.source] : no} />
              <Row k="נוצר" v={fmtDate(b.created_at)} />
              <Row k="קשר אחרון" v={fmtDate(b.last_contacted_at)} />
            </div>
            {b.notes && (
              <p className="text-muted mt-4 text-sm leading-relaxed sm:col-span-2">{b.notes}</p>
            )}
          </div>
        )}

        {tab === "preferences" && (
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div>
              <Row k="ערים מועדפות" v={areasText} />
              <Row k="סוגי נכס" v={typesText} />
              <Row k="תקציב" v={buyerBudgetLine(b)} />
              <Row k="חדרים" v={buyerRoomsLine(b)} />
            </div>
            <div>
              <Row k="מעלית (חובה)" v={b.must_have_elevator ? yes : no} />
              <Row k="חניה (חובה)" v={b.must_have_parking ? yes : no} />
              <Row k="ממ״ד (חובה)" v={b.must_have_safe_room ? yes : no} />
              <Row k="אישור עקרוני" v={b.has_preapproval ? yes : no} />
            </div>
          </div>
        )}

        {tab === "activities" &&
          (activities.length === 0 ? (
            <EmptyState icon="Clock" text="אין פעילות מתועדת לקונה זה." />
          ) : (
            <ul className="flex flex-col gap-3">
              {activities.map((a) => (
                <li key={a.id} className="flex items-start gap-3">
                  <span className="bg-brand-soft text-brand mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl">
                    <Icon name="Clock" size={15} />
                  </span>
                  <div>
                    <p className="text-ink text-sm font-semibold">{a.subject ?? a.type}</p>
                    {a.body && <p className="text-muted text-xs">{a.body}</p>}
                    <p className="text-muted text-[11px]">{fmtDate(a.occurred_at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ))}

        {tab === "tasks" && <BuyerTasksPanel buyerId={b.id} tasks={tasks} />}

        {tab === "notes" &&
          (notes.length === 0 ? (
            <EmptyState icon="MessageCircle" text="אין הערות לקונה זה." />
          ) : (
            <ul className="flex flex-col gap-3">
              {notes.map((n) => (
                <li key={n.id} className="bg-surface rounded-xl p-3">
                  <p className="text-ink text-sm">{n.body}</p>
                  <p className="text-muted mt-1 text-[11px]">{fmtDate(n.created_at)}</p>
                </li>
              ))}
            </ul>
          ))}

        {tab === "meetings" &&
          (meetings.length === 0 ? (
            <EmptyState icon="Clock" text="אין פגישות מתוזמנות לקונה זה." />
          ) : (
            <ul className="flex flex-col gap-2">
              {meetings.map((m) => (
                <li
                  key={m.id}
                  className="border-line flex items-center justify-between border-b py-2.5 last:border-0"
                >
                  <div>
                    <p className="text-ink text-sm font-semibold">{m.title}</p>
                    <p className="text-muted text-xs">{fmtDate(m.start_at)}</p>
                  </div>
                  <Badge tone="neutral" size="sm">
                    {m.status}
                  </Badge>
                </li>
              ))}
            </ul>
          ))}

        {tab === "matches" && <BuyerMatchesTab matches={buyerMatches} />}
      </div>
    </div>
  );
}

const fmtShekels = (n: number | null) =>
  n && n > 0 ? `₪${Math.round(n).toLocaleString("he-IL")}` : null;
const scoreTone = (n: number) =>
  n >= 70 ? "text-success" : n >= 45 ? "text-brand-strong" : "text-danger";

/**
 * Buyer detail "התאמות" tab — real matched properties from the matching engine
 * (match_intelligence_profiles). No mock properties or hardcoded cards: when the
 * engine has produced nothing for this buyer, an honest empty state is shown.
 */
function BuyerMatchesTab({ matches }: { matches: BuyerPropertyMatch[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    setError(null);
    startTransition(async () => {
      const res = await recalcMatchesAction();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted text-sm">
          {matches.length > 0
            ? `${matches.length} נכסים תואמים לקונה לפי מנוע ההתאמות`
            : "מנוע ההתאמות מצליב את העדפות הקונה מול מלאי הנכסים"}
        </p>
        <Button
          variant="secondary"
          size="sm"
          loading={pending}
          leadingIcon={<Icon name="Sparkles" size={15} />}
          onClick={refresh}
        >
          רענן התאמות
        </Button>
      </div>

      {error && (
        <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-sm font-semibold">{error}</p>
      )}

      {matches.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <span className="bg-surface text-muted grid h-14 w-14 place-items-center rounded-2xl">
            <Icon name="Sparkles" size={26} />
          </span>
          <p className="text-ink text-lg font-extrabold">אין עדיין התאמות לקונה הזה</p>
          <p className="text-muted max-w-sm text-sm">
            הוסף נכסים או הרץ מנוע התאמות כדי ליצור התאמות אמיתיות.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {matches.map((m) => (
            <li key={m.matchId} className="border-line rounded-[16px] border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-ink truncate text-sm font-extrabold">{m.title}</p>
                  <p className="text-muted truncate text-xs">
                    {m.locality ?? m.address ?? "—"}
                    {fmtShekels(m.price) ? ` · ${fmtShekels(m.price)}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-[11px] font-bold">
                  <span className={cn(scoreTone(m.compatibility))}>התאמה {m.compatibility}</span>
                  <span className={cn(scoreTone(m.closing))}>סגירה {m.closing}%</span>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral" size="sm">{m.stageLabel}</Badge>
                {m.openRisks > 0 && (
                  <Badge tone="danger" size="sm">{m.openRisks} סיכונים</Badge>
                )}
                {m.openObjections > 0 && (
                  <Badge tone="warning" size="sm">{m.openObjections} התנגדויות</Badge>
                )}
              </div>

              {m.reason && (
                <p className="text-muted mt-2 text-xs">
                  <span className="text-ink font-semibold">סיבת ההתאמה: </span>{m.reason}
                </p>
              )}
              {m.blocker && (
                <p className="text-danger mt-1 text-xs">
                  <span className="font-semibold">חסם עיקרי: </span>{m.blocker}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Link href={`/matches/${m.matchId}`}>
                  <Button variant="secondary" size="sm" leadingIcon={<Icon name="Sparkles" size={14} />}>
                    פתח התאמה מלאה
                  </Button>
                </Link>
                <Link href={`/properties/${m.propertyId}`}>
                  <Button variant="ghost" size="sm" leadingIcon={<Icon name="Building2" size={14} />}>
                    פתח נכס
                  </Button>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
