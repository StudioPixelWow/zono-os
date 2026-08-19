"use client";
/* eslint-disable @next/next/no-img-element -- external CDN property photos + signed studio URLs; next/image would require remotePatterns config */
// ============================================================================
// ZONO — Live Facebook-style post preview (approximation — NOT pixel-perfect).
// The SINGLE preview used by both the Campaign Wizard and the Marketing Plan
// workboard, so what the user reviews is exactly what the caption/media/identity
// will publish (preview = approved snapshot = published payload). Extracted from
// CampaignWizard so there is never a second, diverging preview.
// ============================================================================
import { Icon } from "@/components/dashboard/Icon";

export interface FbIdentity { name: string; avatarUrl: string | null }

export function fbInitials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("") || "ז";
}

/** Facebook-like media collage — approximation, NOT pixel-perfect Meta rendering.
 *  1 image = full; 2–4 = grid; 5+ = first 4 with a "+N" overlay on the last tile.
 *  Order is preserved (reading order), so the collage reflects the persisted list. */
function MediaCollage({ urls }: { urls: string[] }) {
  if (urls.length === 1) {
    return <img src={urls[0]} alt="תמונת הפוסט" className="max-h-[360px] w-full bg-slate-100 object-cover" />;
  }
  const shown = urls.slice(0, 4);
  const extra = urls.length - shown.length;
  // 2 → 1×2, 3 → first spans both columns then 2, 4+ → 2×2.
  return (
    <div className="grid grid-cols-2 gap-0.5 bg-white">
      {shown.map((u, i) => {
        const span3First = urls.length === 3 && i === 0;
        return (
          <div key={i} className={span3First ? "relative col-span-2" : "relative"}>
            <img src={u} alt={`תמונה ${i + 1}`} className={`w-full bg-slate-100 object-cover ${span3First ? "max-h-[240px]" : "aspect-square"}`} />
            {i === shown.length - 1 && extra > 0 && (
              <div className="absolute inset-0 grid place-items-center bg-black/45 text-lg font-black text-white">+{extra}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FacebookPreview({ identity, text, imageUrls, onPickMedia }: { identity: FbIdentity; text: string; imageUrls: string[]; onPickMedia?: () => void }) {
  const urls = (imageUrls ?? []).filter(Boolean);
  return (
    <div dir="rtl" className="border-line overflow-hidden rounded-2xl border bg-white shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-2 p-3">
        {identity.avatarUrl
          ? <img src={identity.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
          : <span className="grid h-9 w-9 place-items-center rounded-full bg-[#1877f2] text-[13px] font-black text-white">{fbInitials(identity.name)}</span>}
        <div className="leading-tight">
          <div className="text-[13px] font-bold text-[#050505]">{identity.name}</div>
          <div className="text-[11px] text-[#65676b]">עכשיו · 🌐</div>
        </div>
      </div>
      {text.trim() && <div className="whitespace-pre-wrap px-3 pb-2 text-[13px] leading-relaxed text-[#050505]">{text}</div>}
      {urls.length > 0
        ? <MediaCollage urls={urls} />
        : (
          <button type="button" onClick={onPickMedia} className="flex aspect-[1.91/1] w-full flex-col items-center justify-center gap-1 bg-slate-100 text-[#65676b]">
            <Icon name="Image" size={22} />
            <span className="px-6 text-center text-[12px]">בחרו תמונה או צרו קריאייטיב כדי לראות את הפוסט המלא</span>
          </button>
        )}
      {urls.length > 1 && <p className="text-muted px-3 pt-1 text-[10px]">{urls.length} תמונות · יפורסמו לפי הסדר המוצג</p>}
      <div className="flex items-center justify-around border-t border-[#e4e6eb] px-2 py-1.5 text-[13px] font-semibold text-[#65676b]">
        <span className="flex items-center gap-1">👍 אהבתי</span>
        <span className="flex items-center gap-1">💬 תגובה</span>
        <span className="flex items-center gap-1">↗️ שיתוף</span>
      </div>
      <p className="bg-surface text-muted px-3 py-1.5 text-center text-[10px]">התצוגה להמחשה. המראה בפייסבוק עשוי להשתנות מעט.</p>
    </div>
  );
}
