"use client";

const field =
  "bg-surface border-line text-ink focus:border-brand-light h-11 w-full rounded-xl border px-3 text-sm outline-none transition";
const label = "text-muted text-xs font-semibold";

/**
 * Location coordinates + map preview. Shows a keyless Google Maps embed once
 * coordinates exist. A draggable-pin JS integration can be added when
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is configured.
 */
export function LocationMap({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
}) {
  const hasCoords = latitude != null && longitude != null;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className={label}>קו רוחב (lat)</span>
          <input
            type="number"
            step="any"
            dir="ltr"
            className={`${field} mt-1`}
            value={latitude ?? ""}
            onChange={(e) =>
              onChange(e.target.value ? Number(e.target.value) : null, longitude)
            }
          />
        </label>
        <label className="block">
          <span className={label}>קו אורך (lng)</span>
          <input
            type="number"
            step="any"
            dir="ltr"
            className={`${field} mt-1`}
            value={longitude ?? ""}
            onChange={(e) =>
              onChange(latitude, e.target.value ? Number(e.target.value) : null)
            }
          />
        </label>
      </div>

      {hasCoords ? (
        <div className="border-line overflow-hidden rounded-2xl border">
          <iframe
            title="מפה"
            className="h-56 w-full"
            loading="lazy"
            src={`https://www.google.com/maps?q=${latitude},${longitude}&z=15&output=embed`}
          />
        </div>
      ) : (
        <p className="text-muted bg-surface rounded-2xl px-4 py-6 text-center text-xs">
          הזן/י קואורדינטות כדי לראות תצוגת מפה. (פין נגרר יתווסף עם הגדרת מפתח
          Google Maps.)
        </p>
      )}
    </div>
  );
}
