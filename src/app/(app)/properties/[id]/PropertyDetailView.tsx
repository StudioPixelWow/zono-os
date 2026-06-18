"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn, formatShekels } from "@/lib/utils";
import { Icon } from "@/components/dashboard/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import {
  LISTING_KIND_LABELS,
  PROPERTY_STATUS_LABELS,
  PROPERTY_STATUS_OPTIONS,
  PROPERTY_STATUS_TONES,
  PROPERTY_TYPE_LABELS,
  propertyAddressLine,
  type PropertyRow,
} from "@/lib/properties/labels";
import {
  archivePropertyAction,
  setPropertyStatusAction,
} from "@/lib/properties/actions";
import type { Database, JourneyStage, PropertyStatus } from "@/lib/supabase/types";
import type { JourneyContext } from "@/lib/journey/stages";
import { JourneyPanel } from "./JourneyPanel";

type ActivityRow = Database["public"]["Tables"]["activities"]["Row"];
type NoteRow = Database["public"]["Tables"]["notes"]["Row"];
type DocumentRow = Database["public"]["Tables"]["documents"]["Row"];
type MediaRow = Database["public"]["Tables"]["property_media"]["Row"];

interface JourneyData {
  stage: JourneyStage;
  lastActivityAt: string | null;
  stageEnteredAt: string | null;
  context: JourneyContext;
}

type Tab =
  | "overview"
  | "journey"
  | "details"
  | "images"
  | "documents"
  | "activities"
  | "notes";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "סקירה" },
  { id: "journey", label: "מסע הנכס" },
  { id: "details", label: "פרטים" },
  { id: "images", label: "תמונות" },
  { id: "documents", label: "מסמכים" },
  { id: "activities", label: "פעילות" },
  { id: "notes", label: "הערות" },
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

export function PropertyDetailView({
  property: p,
  activities,
  notes,
  documents,
  media,
  journey,
}: {
  property: PropertyRow;
  activities: ActivityRow[];
  notes: NoteRow[];
  documents: DocumentRow[];
  media: MediaRow[];
  journey: JourneyData;
}) {
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const yes = "כן";
  const no = "—";

  const changeStatus = (status: PropertyStatus) => {
    setError(null);
    start(async () => {
      const r = await setPropertyStatusAction(p.id, status);
      if (r?.error) setError(r.error);
    });
  };

  const archive = () => {
    setError(null);
    start(async () => {
      const r = await archivePropertyAction(p.id);
      if (r?.error) setError(r.error);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <Link
          href="/properties"
          className="text-muted hover:text-ink inline-flex items-center gap-1 text-sm font-semibold"
        >
          <Icon name="ChevronRight" size={16} />
          חזרה לנכסים
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-ink text-2xl font-black">{p.title}</h1>
              <Badge tone={PROPERTY_STATUS_TONES[p.status]}>
                {PROPERTY_STATUS_LABELS[p.status]}
              </Badge>
            </div>
            <p className="text-muted mt-1 text-sm">
              {PROPERTY_TYPE_LABELS[p.type]} · {propertyAddressLine(p)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={p.status === "archived" ? "" : p.status}
              onChange={(e) => changeStatus(e.target.value as PropertyStatus)}
              disabled={pending}
              className="bg-card border-line text-ink h-10 rounded-xl border px-3 text-sm font-semibold outline-none"
            >
              {p.status === "archived" && <option value="">בארכיון</option>}
              {PROPERTY_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <Link href={`/properties/${p.id}/edit`}>
              <Button variant="secondary" leadingIcon={<Icon name="Settings" size={16} />}>
                עריכה
              </Button>
            </Link>
            <Button variant="ghost" onClick={archive} disabled={pending}>
              ארכיון
            </Button>
          </div>
        </div>
        {error && (
          <p className="bg-danger-soft text-danger mt-3 rounded-xl px-3 py-2 text-sm font-semibold">
            {error}
          </p>
        )}
      </div>

      {/* Price banner */}
      <div className="bg-brand-soft text-brand-strong flex items-baseline gap-2 rounded-[20px] px-5 py-4">
        <span className="text-2xl font-black">{formatShekels(p.price)}</span>
        <span className="text-sm font-semibold">{LISTING_KIND_LABELS[p.listing_kind]}</span>
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
      <div className="bg-card border-line rounded-[20px] border p-5">
        {tab === "overview" && (
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div>
              <Row k="סוג נכס" v={PROPERTY_TYPE_LABELS[p.type]} />
              <Row k="סוג עסקה" v={LISTING_KIND_LABELS[p.listing_kind]} />
              <Row k="מחיר" v={formatShekels(p.price)} />
              {p.monthly_rent != null && (
                <Row k="שכ״ד חודשי" v={formatShekels(p.monthly_rent)} />
              )}
              <Row k="חדרים" v={p.rooms ?? no} />
              <Row k="שטח" v={p.size_sqm ? `${p.size_sqm} מ״ר` : no} />
            </div>
            <div>
              <Row k="קומה" v={p.floor ?? no} />
              <Row k="עיר" v={p.city ?? no} />
              <Row k="כתובת" v={propertyAddressLine(p)} />
              <Row k="בלעדיות" v={p.has_exclusivity ? yes : no} />
              {p.has_exclusivity && (
                <Row k="בלעדיות עד" v={fmtDate(p.exclusivity_ends_at)} />
              )}
              <Row k="נוצר" v={fmtDate(p.created_at)} />
            </div>
            {p.description && (
              <p className="text-muted mt-4 text-sm leading-relaxed sm:col-span-2">
                {p.description}
              </p>
            )}
          </div>
        )}

        {tab === "journey" && (
          <JourneyPanel
            propertyId={p.id}
            stage={journey.stage}
            lastActivityAt={journey.lastActivityAt}
            stageEnteredAt={journey.stageEnteredAt}
            context={journey.context}
            activities={activities}
          />
        )}

        {tab === "details" && (
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
            <div>
              <Row k="חניה" v={p.has_parking ? yes : no} />
              <Row k="מעלית" v={p.has_elevator ? yes : no} />
              <Row k="מרפסת" v={p.has_balcony ? yes : no} />
              <Row k='ממ"ד' v={p.has_safe_room ? yes : no} />
            </div>
            <div>
              <Row k="מחסן" v={p.has_storage ? yes : no} />
              <Row k="נגישות" v={p.is_accessible ? yes : no} />
              <Row k="מ״ר חוץ" v={p.outdoor_sqm ?? no} />
              <Row k="סה״כ קומות" v={p.total_floors ?? no} />
            </div>
          </div>
        )}

        {tab === "images" &&
          (media.length === 0 ? (
            <EmptyState icon="Building2" text="אין תמונות עדיין. ניתן להוסיף תמונות דרך עריכת הנכס." />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {media.map((m) => (
                <div
                  key={m.id}
                  className="border-line bg-surface relative aspect-[4/3] overflow-hidden rounded-2xl border"
                >
                  <Image
                    src={m.url}
                    alt={m.alt_text ?? p.title}
                    fill
                    sizes="(max-width: 640px) 50vw, 33vw"
                    className="object-cover"
                  />
                  {m.is_primary && (
                    <span className="bg-brand absolute end-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white">
                      ראשית
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}

        {tab === "documents" &&
          (documents.length === 0 ? (
            <EmptyState icon="Presentation" text="אין מסמכים מקושרים לנכס זה." />
          ) : (
            <ul className="flex flex-col gap-2">
              {documents.map((d) => (
                <li
                  key={d.id}
                  className="border-line flex items-center justify-between border-b py-2.5 last:border-0"
                >
                  <span className="text-ink text-sm font-semibold">{d.title}</span>
                  <span className="text-muted text-xs">{fmtDate(d.created_at)}</span>
                </li>
              ))}
            </ul>
          ))}

        {tab === "activities" &&
          (activities.length === 0 ? (
            <EmptyState icon="Clock" text="אין פעילות מתועדת לנכס זה." />
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

        {tab === "notes" &&
          (notes.length === 0 ? (
            <EmptyState icon="MessageCircle" text="אין הערות לנכס זה." />
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
      </div>
    </div>
  );
}
