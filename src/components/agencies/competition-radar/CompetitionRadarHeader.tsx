"use client";
import { Button } from "@/components/ui/Button";
import { AgencyConfidenceBadge } from "./AgencyConfidenceBadge";

/** Title block + refresh control for the competition radar. */
export function CompetitionRadarHeader({
  onRefresh, refreshing, lastConfidence,
}: { onRefresh: () => void; refreshing: boolean; lastConfidence?: number | null }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-ink flex items-center gap-2 text-2xl font-extrabold">
          רדאר מתחרים
          <span className="text-brand-strong text-base font-bold">™</span>
        </h1>
        <p className="text-muted mt-1 max-w-2xl text-sm leading-relaxed">
          מודיעין תחרותי על משרדי תיווך באזורי הפעילות שלך — מבוסס אך ורק על נתונים גלויים שZONO אסף וניתח.
        </p>
      </div>
      <div className="flex items-center gap-2">
        {lastConfidence != null && <AgencyConfidenceBadge value={lastConfidence} size="md" />}
        <Button variant="primary" onClick={onRefresh} loading={refreshing}>
          {refreshing ? "מעדכן מודיעין…" : "עדכן מודיעין"}
        </Button>
      </div>
    </div>
  );
}
