"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import {
  addExternalMedia,
  deletePropertyMedia,
  persistMediaOrder,
  setPrimaryMedia,
  uploadPropertyImage,
  type MediaRow,
} from "@/lib/properties/media";

const ACCEPT = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_IMAGES = 40;

type PendingUpload = {
  key: string;
  name: string;
  status: "uploading" | "error";
  file: File;
};

export function MediaUploader({
  orgId,
  propertyId,
  initial,
  onChange,
}: {
  orgId: string;
  propertyId: string;
  initial: MediaRow[];
  onChange?: (media: MediaRow[]) => void;
}) {
  const [media, setMedia] = useState<MediaRow[]>(initial);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // A ref mirror of media so sequential uploads in one batch see the latest
  // accumulated list (avoids the stale-closure bug that capped uploads at 1).
  const mediaRef = useRef<MediaRow[]>(initial);

  const images = media.filter((m) => m.type === "image");
  const externals = media.filter((m) => m.type !== "image");

  const sync = (next: MediaRow[]) => {
    mediaRef.current = next;
    setMedia(next);
    onChange?.(next);
  };

  /** Upload a single validated file, appending to the accumulated list. */
  const uploadOne = async (file: File, pendingKey: string) => {
    const current = mediaRef.current;
    const imagesNow = current.filter((m) => m.type === "image");
    // Only the very first image of the property becomes primary.
    const isPrimary = imagesNow.length === 0 && !current.some((m) => m.is_primary);
    const row = await uploadPropertyImage(file, {
      orgId,
      propertyId,
      sortOrder: current.length,
      isPrimary,
    });
    sync([...mediaRef.current, row]);
    setPending((p) => p.filter((u) => u.key !== pendingKey));
  };

  const runUpload = async (file: File, pendingKey: string) => {
    try {
      await uploadOne(file, pendingKey);
    } catch (e) {
      console.error("[media] upload failed:", e);
      setPending((p) =>
        p.map((u) => (u.key === pendingKey ? { ...u, status: "error" } : u)),
      );
      setError("העלאת חלק מהקבצים נכשלה — אפשר לנסות שוב.");
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    const accepted: File[] = [];
    let remaining =
      MAX_IMAGES - mediaRef.current.filter((m) => m.type === "image").length;
    for (const file of Array.from(files)) {
      if (!ACCEPT.includes(file.type)) {
        setError("פורמט לא נתמך. אפשר JPG, PNG או WEBP בלבד.");
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`הקובץ "${file.name}" גדול מ-20MB ולא הועלה.`);
        continue;
      }
      if (remaining <= 0) {
        setError(`ניתן להעלות עד ${MAX_IMAGES} תמונות לנכס.`);
        break;
      }
      accepted.push(file);
      remaining -= 1;
    }
    if (accepted.length === 0) return;

    const queued: PendingUpload[] = accepted.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      name: file.name,
      status: "uploading",
      file,
    }));
    setPending((p) => [...p, ...queued]);
    // Sequential upload keeps sort_order stable and avoids primary races.
    for (const q of queued) {
      await runUpload(q.file, q.key);
    }
  };

  const retry = async (u: PendingUpload) => {
    setPending((p) =>
      p.map((x) => (x.key === u.key ? { ...x, status: "uploading" } : x)),
    );
    await runUpload(u.file, u.key);
  };

  const dismissPending = (key: string) =>
    setPending((p) => p.filter((u) => u.key !== key));

  const remove = async (row: MediaRow) => {
    if (!confirm("למחוק את הפריט?")) return;
    try {
      await deletePropertyMedia(row);
      const next = mediaRef.current.filter((m) => m.id !== row.id);
      // If we removed the primary image, promote the first remaining image.
      if (row.is_primary && row.type === "image") {
        const firstImg = next.find((m) => m.type === "image");
        if (firstImg) {
          await setPrimaryMedia(propertyId, firstImg.id);
          sync(next.map((m) => ({ ...m, is_primary: m.id === firstImg.id })));
          return;
        }
      }
      sync(next);
    } catch {
      setError("מחיקה נכשלה.");
    }
  };

  const makePrimary = async (row: MediaRow) => {
    try {
      await setPrimaryMedia(propertyId, row.id);
      sync(mediaRef.current.map((m) => ({ ...m, is_primary: m.id === row.id })));
    } catch {
      setError("עדכון תמונה ראשית נכשל.");
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const list = [...images];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    const reordered = list.map((m, i) => ({ ...m, sort_order: i }));
    sync([...reordered, ...externals]);
    try {
      await persistMediaOrder(reordered.map((m) => ({ id: m.id, sort_order: m.sort_order })));
    } catch {
      /* order is best-effort */
    }
  };

  const addLink = async (type: MediaRow["type"], label: string) => {
    const url = prompt(`הדבק/י קישור ל${label}:`);
    if (!url) return;
    try {
      const row = await addExternalMedia({
        orgId,
        propertyId,
        type,
        externalUrl: url,
        sortOrder: mediaRef.current.length,
      });
      sync([...mediaRef.current, row]);
    } catch {
      setError("הוספת הקישור נכשלה.");
    }
  };

  const uploadingCount = pending.filter((u) => u.status === "uploading").length;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="bg-danger-soft text-danger rounded-xl px-3 py-2 text-xs font-semibold">
          {error}
        </p>
      )}

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-[20px] border-2 border-dashed px-6 py-10 text-center transition",
          dragOver ? "border-brand bg-brand-soft" : "border-line bg-surface",
        )}
      >
        <span className="bg-brand-soft text-brand grid h-14 w-14 place-items-center rounded-2xl">
          <Icon name="Building2" size={26} />
        </span>
        <p className="text-ink font-bold">גרור תמונות לכאן או</p>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="bg-brand hover:bg-brand-strong rounded-xl px-4 py-2 text-sm font-bold text-white transition"
        >
          בחר קבצים מהמחשב
        </button>
        <p className="text-muted text-xs">
          JPG, PNG, WEBP · עד 20MB לקובץ · אפשר לבחור כמה תמונות יחד
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(",")}
          multiple
          hidden
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = ""; // allow re-selecting the same file
          }}
        />
      </div>

      {/* Thumbnails */}
      {(images.length > 0 || pending.length > 0) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((m, i) => (
            <div
              key={m.id}
              className="border-line group relative overflow-hidden rounded-2xl border"
            >
              <div className="relative h-28 w-full bg-surface">
                <Image src={m.url} alt={m.alt_text ?? ""} fill className="object-cover" unoptimized />
              </div>
              {m.is_primary && (
                <span className="bg-brand absolute start-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold text-white">
                  ראשית
                </span>
              )}
              <span className="bg-ink/55 absolute end-2 top-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white">
                {i + 1}
              </span>
              <div className="bg-card/95 flex items-center justify-between gap-1 px-2 py-1.5">
                <div className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-muted hover:text-brand disabled:opacity-30" title="הזז קדימה">
                    <Icon name="ChevronRight" size={15} />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === images.length - 1} className="text-muted hover:text-brand disabled:opacity-30" title="הזז אחורה">
                    <Icon name="ChevronLeft" size={15} />
                  </button>
                </div>
                <div className="flex gap-1.5">
                  {!m.is_primary && (
                    <button type="button" onClick={() => makePrimary(m)} className="text-muted hover:text-brand" title="הגדר כתמונה ראשית">
                      <Icon name="Star" size={15} />
                    </button>
                  )}
                  <button type="button" onClick={() => remove(m)} className="text-muted hover:text-danger" title="מחק">
                    <Icon name="Trash2" size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {pending.map((u) => (
            <div
              key={u.key}
              className={cn(
                "border-line relative flex h-[152px] flex-col items-center justify-center gap-2 rounded-2xl border p-2 text-center",
                u.status === "error" ? "bg-danger-soft" : "bg-surface animate-pulse",
              )}
            >
              {u.status === "uploading" ? (
                <>
                  <Icon name="Loader" size={20} className="text-brand animate-spin" />
                  <span className="text-muted truncate text-[11px] font-semibold" dir="ltr">{u.name}</span>
                  <span className="text-muted text-[10px]">מעלה…</span>
                </>
              ) : (
                <>
                  <Icon name="AlertTriangle" size={20} className="text-danger" />
                  <span className="text-danger truncate text-[11px] font-semibold" dir="ltr">{u.name}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => retry(u)} className="text-brand text-[11px] font-bold hover:underline">נסה שוב</button>
                    <button type="button" onClick={() => dismissPending(u.key)} className="text-muted text-[11px] font-bold hover:underline">הסר</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* External media */}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => addLink("tour_360", "סיור 360°")} className="bg-card border-line text-ink hover:border-brand-light rounded-xl border px-3 py-2 text-sm font-semibold">
          + סיור 360°
        </button>
        <button type="button" onClick={() => addLink("video", "וידאו / YouTube")} className="bg-card border-line text-ink hover:border-brand-light rounded-xl border px-3 py-2 text-sm font-semibold">
          + וידאו / YouTube
        </button>
        <button type="button" onClick={() => addLink("floor_plan", "תוכנית דירה")} className="bg-card border-line text-ink hover:border-brand-light rounded-xl border px-3 py-2 text-sm font-semibold">
          + תוכנית דירה
        </button>
      </div>
      {externals.length > 0 && (
        <ul className="text-muted flex flex-col gap-1 text-xs">
          {externals.map((m) => (
            <li key={m.id} className="flex items-center justify-between">
              <span dir="ltr" className="truncate">{m.url}</span>
              <button type="button" onClick={() => remove(m)} className="hover:text-danger">
                <Icon name="Minus" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-muted text-xs">
        מומלץ לפחות 6 תמונות. נבחרו {images.length} תמונות
        {uploadingCount > 0 ? ` · מעלה ${uploadingCount}…` : ""}.
        {" "}גרור פינות כדי לסדר, ✨ קובע תמונה ראשית.
      </p>
    </div>
  );
}
