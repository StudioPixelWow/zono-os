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

export function FacebookPreview({ identity, text, imageUrl, onPickMedia }: { identity: FbIdentity; text: string; imageUrl: string | null; onPickMedia?: () => void }) {
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
      {imageUrl
        ? <img src={imageUrl} alt="תמונת הפוסט" className="max-h-[360px] w-full bg-slate-100 object-cover" />
        : (
          <button type="button" onClick={onPickMedia} className="flex aspect-[1.91/1] w-full flex-col items-center justify-center gap-1 bg-slate-100 text-[#65676b]">
            <Icon name="Image" size={22} />
            <span className="px-6 text-center text-[12px]">בחרו תמונה או צרו קריאייטיב כדי לראות את הפוסט המלא</span>
          </button>
        )}
      <div className="flex items-center justify-around border-t border-[#e4e6eb] px-2 py-1.5 text-[13px] font-semibold text-[#65676b]">
        <span className="flex items-center gap-1">👍 אהבתי</span>
        <span className="flex items-center gap-1">💬 תגובה</span>
        <span className="flex items-center gap-1">↗️ שיתוף</span>
      </div>
      <p className="bg-surface text-muted px-3 py-1.5 text-center text-[10px]">התצוגה להמחשה. המראה בפייסבוק עשוי להשתנות מעט.</p>
    </div>
  );
}
