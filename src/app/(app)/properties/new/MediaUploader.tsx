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
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const images = media.filter((m) => m.type === "image");
  const externals = media.filter((m) => m.type !== "image");

  const sync = (next: MediaRow[]) => {
    setMedia(next);
    onChange?.(next);
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    for (const file of Array.from(files)) {
      if (!ACCEPT.includes(file.type)) {
        setError("פורמט לא נתמך. אפשר JPG, PNG או WEBP.");
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError("הקובץ גדול מ-20MB.");
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const isPrimary = images.length === 0;
        const row = await uploadPropertyImage(file, {
          orgId,
          propertyId,
          sortOrder: media.length,
          isPrimary,
        });
        sync([...media, row]);
      } catch (e) {
        console.error(e);
        setError("העלאת הקובץ נכשלה.");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const remove = async (row: MediaRow) => {
    if (!confirm("למחוק את הפריט?")) return;
    try {
      await deletePropertyMedia(row);
      sync(media.filter((m) => m.id !== row.id));
    } catch {
      setError("מחיקה נכשלה.");
    }
  };

  const makePrimary = async (row: MediaRow) => {
    try {
      await setPrimaryMedia(propertyId, row.id);
      sync(media.map((m) => ({ ...m, is_primary: m.id === row.id })));
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
        sortOrder: media.length,
      });
      sync([...media, row]);
    } catch {
      setError("הוספת הקישור נכשלה.");
    }
  };

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
        <p className="text-muted text-xs">JPG, PNG, WEBP · עד 20MB לקובץ</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT.join(",")}
          multiple
          hidden
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </div>

      {/* Thumbnails */}
      {(images.length > 0 || uploading > 0) && (
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
              <div className="bg-card/95 flex items-center justify-between gap-1 px-2 py-1.5">
                <div className="flex gap-1">
                  <button type="button" onClick={() => move(i, -1)} className="text-muted hover:text-brand" title="הזז ימינה">
                    <Icon name="ChevronRight" size={15} />
                  </button>
                  <button type="button" onClick={() => move(i, 1)} className="text-muted hover:text-brand" title="הזז שמאלה">
                    <Icon name="ChevronLeft" size={15} />
                  </button>
                </div>
                <div className="flex gap-1.5">
                  {!m.is_primary && (
                    <button type="button" onClick={() => makePrimary(m)} className="text-muted hover:text-brand" title="הגדר כראשית">
                      <Icon name="Sparkles" size={15} />
                    </button>
                  )}
                  <button type="button" onClick={() => remove(m)} className="text-muted hover:text-danger" title="מחק">
                    <Icon name="Minus" size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {Array.from({ length: uploading }).map((_, i) => (
            <div key={`up-${i}`} className="border-line bg-surface h-[152px] animate-pulse rounded-2xl border" />
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
        מומלץ לפחות 6 תמונות. נבחרו {images.length} תמונות.
      </p>
    </div>
  );
}
