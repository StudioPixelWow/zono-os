"use client";
// ============================================================================
// ZONO — agent profile edit popup. Opens from the header avatar. Lets the user
// update their display name, title and photo. Saves to their own users row.
// ============================================================================
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { updateMyProfileAction } from "@/lib/profile/actions";

export function ProfileEditPopup({
  open, onClose, initial,
}: {
  open: boolean;
  onClose: () => void;
  initial: { fullName: string; title: string | null; avatarUrl: string | null };
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState(initial.fullName);
  const [title, setTitle] = useState(initial.title ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const save = async () => {
    setSaving(true); setError(null);
    const r = await updateMyProfileAction({ fullName, title, avatarUrl });
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    router.refresh();
    onClose();
  };

  const initialLetter = (fullName.trim() || "מ").charAt(0);

  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/40 p-4 pt-20" onClick={onClose} dir="rtl">
      <div className="bg-surface border-line w-full max-w-sm rounded-3xl border p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-ink text-base font-black">עריכת פרופיל</h2>
          <button onClick={onClose} className="text-muted hover:text-ink rounded-lg p-1"><Icon name="X" size={18} /></button>
        </div>

        <div className="mb-4 flex items-center gap-3">
          <div className="from-brand to-brand-light h-16 w-16 shrink-0 rounded-full bg-gradient-to-br p-[2px]">
            <div className="bg-card grid h-full w-full place-items-center overflow-hidden rounded-full">
              {avatarUrl.trim() ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={fullName} className="h-full w-full rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : <span className="text-brand text-xl font-black">{initialLetter}</span>}
            </div>
          </div>
          <p className="text-muted text-[12px]">הדבק/י קישור לתמונה. היא תופיע בעיגול עם מסגרת סגולה בראש המסך.</p>
        </div>

        {error && <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}

        <Field label="שם מלא"><input value={fullName} onChange={(e) => setFullName(e.target.value)} className="bg-card border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none transition focus:ring-2 focus:ring-brand/15" /></Field>
        <Field label="תפקיד"><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="לדוגמה: סוכן בכיר" className="bg-card border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none transition focus:ring-2 focus:ring-brand/15" /></Field>
        <Field label="קישור לתמונה"><input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} dir="ltr" placeholder="https://…" className="bg-card border-line text-ink focus:border-brand-light h-10 w-full rounded-xl border px-3 text-sm outline-none transition focus:ring-2 focus:ring-brand/15" /></Field>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-muted rounded-xl px-3 py-2 text-sm font-bold">ביטול</button>
          <button onClick={save} disabled={saving} className="bg-brand hover:bg-brand-strong rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {saving ? "שומר…" : "שמירה"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="text-muted mb-1 block text-[12px] font-bold">{label}</span>
      {children}
    </label>
  );
}
