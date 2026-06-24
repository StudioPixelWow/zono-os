"use client";

// ============================================================================
// ZONO — Creative DNA dashboard. A premium, glassmorphic library of reference
// ads that ZONO learns the design language from and applies when generating
// creative — without copying any competitor's ad or logo 1:1. RTL Hebrew.
// All data flows through the server actions; nothing is mocked.
// ============================================================================
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useActionRunner } from "@/components/ui/useActionRunner";
import { ActionFeedback } from "@/components/ui/ActionFeedback";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/dashboard/Icon";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { ProfileWithHealth } from "@/lib/creative-dna/service";
import type {
  CreativeReferenceAssetRow,
  CreativeDnaStatus,
  ReferenceAnalysisStatus,
} from "@/lib/creative-dna/types";
import {
  MAX_REFERENCES_PER_PROFILE,
  MIN_REFERENCES_RECOMMENDED,
  ALLOWED_REFERENCE_MIME,
} from "@/lib/creative-dna/types";
import {
  listCreativeDNAProfilesAction,
  listCreativeReferenceAssetsAction,
  createCreativeDNAProfileAction,
  deleteCreativeDNAProfileAction,
  setDefaultCreativeDNAProfileAction,
  addCreativeReferenceAssetAction,
  deleteCreativeReferenceAssetAction,
  analyzeCreativeDNAProfileAction,
  reanalyzeCreativeDNAProfileAction,
} from "@/lib/creative-dna/actions";
import { uploadCreativeReferenceFile } from "@/lib/creative-dna/upload";

// ── Status visuals ──────────────────────────────────────────────────────────────
const STATUS_BADGE: Record<CreativeDnaStatus, { label: string; cls: string }> = {
  draft: { label: "טיוטה", cls: "bg-line/60 text-muted" },
  analyzing: { label: "מנתח...", cls: "bg-brand-soft text-brand-strong" },
  ready: { label: "מוכן", cls: "bg-success-soft text-success" },
  error: { label: "שגיאה", cls: "bg-danger-soft text-danger" },
};

const ASSET_BADGE: Record<ReferenceAnalysisStatus, { label: string; cls: string }> = {
  pending: { label: "ממתין", cls: "bg-line/70 text-muted" },
  analyzing: { label: "מנתח", cls: "bg-brand-soft text-brand-strong" },
  done: { label: "נותח", cls: "bg-success-soft text-success" },
  error: { label: "שגיאה", cls: "bg-danger-soft text-danger" },
};

const ACCEPT = ALLOWED_REFERENCE_MIME.join(",");

interface UploadProgress { id: string; name: string; status: "uploading" | "done" | "error"; error?: string }

export function CreativeDnaView({
  profiles: initialProfiles,
  presets,
  orgId,
}: {
  profiles: ProfileWithHealth[];
  presets: { presetKey: string; name: string; description: string }[];
  orgId: string;
}) {
  const r = useActionRunner();
  const [profiles, setProfiles] = useState<ProfileWithHealth[]>(initialProfiles);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Create-profile form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const refreshProfiles = useCallback(async () => {
    try {
      const next = await listCreativeDNAProfilesAction();
      setProfiles(next);
      return next;
    } catch {
      return profiles;
    }
  }, [profiles]);

  const createProfile = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    r.run(
      async () => {
        const res = await createCreativeDNAProfileAction({ name: trimmed, description: description.trim() || undefined });
        if (!res.ok) throw new Error(res.message ?? "יצירת הפרופיל נכשלה.");
        await refreshProfiles();
        if (res.data?.id) setExpandedId(res.data.id);
        return res;
      },
      { id: "create", pendingMessage: "יוצר פרופיל...", successMessage: "הפרופיל נוצר.", refresh: false },
    );
    setName("");
    setDescription("");
  };

  const analyze = (profileId: string, isReady: boolean) =>
    r.run(
      async () => {
        const res = isReady
          ? await reanalyzeCreativeDNAProfileAction(profileId)
          : await analyzeCreativeDNAProfileAction(profileId);
        await refreshProfiles();
        if (!res.ok) throw new Error(res.message || "הניתוח נכשל.");
        return res;
      },
      { id: `analyze-${profileId}`, pendingMessage: "מנתח את ה-DNA...", success: (res) => res.message, refresh: false },
    );

  const makeDefault = (profileId: string) =>
    r.run(
      async () => {
        const res = await setDefaultCreativeDNAProfileAction(profileId);
        if (!res.ok) throw new Error(res.message ?? "הגדרת ברירת המחדל נכשלה.");
        await refreshProfiles();
        return res;
      },
      { id: `default-${profileId}`, pendingMessage: "מגדיר ברירת מחדל...", successMessage: "הוגדר כברירת מחדל.", refresh: false },
    );

  const remove = (profileId: string) =>
    r.run(
      async () => {
        const res = await deleteCreativeDNAProfileAction(profileId);
        if (!res.ok) throw new Error(res.message ?? "המחיקה נכשלה.");
        if (expandedId === profileId) setExpandedId(null);
        await refreshProfiles();
        return res;
      },
      { id: `delete-${profileId}`, pendingMessage: "מוחק...", successMessage: "הפרופיל נמחק.", refresh: false },
    );

  return (
    <main dir="rtl" className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6">
      {/* HEADER */}
      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div className="flex items-start gap-3">
          <div className="from-brand to-brand-strong grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-sm">
            <Icon name="Fingerprint" size={24} className="text-white" />
          </div>
          <div>
            <p className="text-brand text-xs font-bold">ZONO Studio → Creative DNA</p>
            <h1 className="text-ink mt-0.5 text-2xl font-black">Creative DNA</h1>
            <p className="text-muted mt-1 max-w-2xl text-sm leading-relaxed">
              ספריית מודעות ייחוס שממנה ZONO לומד את שפת העיצוב שלך ומיישם אותה ביצירת קריאייטיב — מבלי
              להעתיק מודעה או לוגו של מתחרה 1:1.
            </p>
          </div>
        </div>
      </motion.header>

      <ActionFeedback runner={r} />

      {/* CREATE PROFILE */}
      <section className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-4 shadow-sm">
        <h2 className="text-ink text-sm font-black">צור פרופיל DNA חדש</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-muted text-[11px] font-bold">שם הפרופיל</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="לדוגמה: סגנון בוטיק 2026"
              className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted text-[11px] font-bold">תיאור (אופציונלי)</span>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="במה הפרופיל הזה מאפיין"
              className="border-line bg-surface text-ink h-9 rounded-lg border px-3 text-sm"
            />
          </label>
        </div>
        <div>
          <Button loading={r.busyId === "create"} disabled={!name.trim()} onClick={createProfile}>
            <Icon name="Plus" size={16} />
            צור פרופיל
          </Button>
        </div>
      </section>

      {/* PROFILES */}
      <section className="flex flex-col gap-3">
        <h2 className="text-ink text-sm font-black">פרופילי DNA</h2>
        {profiles.length === 0 ? (
          <div className="bg-card border-line flex flex-col items-center gap-2 rounded-2xl border border-dashed p-8 text-center">
            <div className="bg-brand-soft text-brand grid h-12 w-12 place-items-center rounded-full">
              <Icon name="Fingerprint" size={24} />
            </div>
            <p className="text-ink text-sm font-bold">עדיין אין פרופילי DNA</p>
            <p className="text-muted max-w-sm text-[13px]">
              צור פרופיל ראשון, העלה מודעות ייחוס שאתה אוהב, והרץ ניתוח — וZONO ילמד את שפת העיצוב שלך.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {profiles.map((p) => (
              <ProfileCard
                key={p.profile.id}
                data={p}
                orgId={orgId}
                runner={r}
                expanded={expandedId === p.profile.id}
                onToggle={() => setExpandedId((id) => (id === p.profile.id ? null : p.profile.id))}
                onAnalyze={() => analyze(p.profile.id, p.health.ready)}
                onMakeDefault={() => makeDefault(p.profile.id)}
                onDelete={() => remove(p.profile.id)}
                onAssetsChanged={refreshProfiles}
              />
            ))}
          </div>
        )}
      </section>

      {/* PRESETS */}
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-ink text-sm font-black">סגנונות מוכנים</h2>
          <p className="text-muted text-[12px]">
            סגנונות מובנים של ZONO הזמינים ביצירת קריאייטיב. הם השראה בלבד וניתן לבחור בהם בעת היצירה — לא ניתן לערוך אותם כאן.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {presets.map((preset) => (
            <div key={preset.presetKey} className="bg-card border-line flex flex-col gap-1.5 rounded-2xl border p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Icon name="Sparkles" size={16} className="text-brand" />
                <h3 className="text-ink text-sm font-bold">{preset.name}</h3>
              </div>
              <p className="text-muted text-[12px] leading-relaxed">{preset.description}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

// ── Profile card ──────────────────────────────────────────────────────────────
function ProfileCard({
  data,
  orgId,
  runner,
  expanded,
  onToggle,
  onAnalyze,
  onMakeDefault,
  onDelete,
  onAssetsChanged,
}: {
  data: ProfileWithHealth;
  orgId: string;
  runner: ReturnType<typeof useActionRunner>;
  expanded: boolean;
  onToggle: () => void;
  onAnalyze: () => void;
  onMakeDefault: () => void;
  onDelete: () => void;
  onAssetsChanged: () => Promise<ProfileWithHealth[]>;
}) {
  const { profile, health } = data;
  const badge = STATUS_BADGE[profile.status] ?? STATUS_BADGE.draft;
  const palette = profile.color_palette ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-card border-line flex flex-col gap-3 rounded-2xl border p-4 shadow-sm"
    >
      {/* header row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-ink truncate text-base font-black">{profile.name}</h3>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", badge.cls)}>{badge.label}</span>
            {profile.is_default && (
              <span className="bg-brand-soft text-brand-strong flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold">
                <Icon name="Star" size={11} />
                ברירת מחדל
              </span>
            )}
          </div>
          {profile.description && <p className="text-muted mt-1 text-[13px]">{profile.description}</p>}
        </div>
        <button
          onClick={onToggle}
          className="border-line text-muted hover:text-ink flex h-8 items-center gap-1 rounded-lg border px-3 text-[12px] font-bold transition-colors"
        >
          {expanded ? "סגור" : "פתח"}
          <Icon name="ChevronDown" size={14} className={cn("transition-transform", expanded && "rotate-180")} />
        </button>
      </div>

      {/* meta row */}
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <span className="text-muted flex items-center gap-1 font-semibold">
          <Icon name="Image" size={14} />
          {health.assetCount} / {MAX_REFERENCES_PER_PROFILE} מודעות ייחוס
        </span>
        {palette.length > 0 && (
          <span className="flex items-center gap-1">
            {palette.slice(0, 8).map((c, i) => (
              <span
                key={`${c}-${i}`}
                className="border-line h-4 w-4 rounded-full border"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </span>
        )}
      </div>
      <p className="text-muted text-[12px]">{health.message}</p>

      {/* actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          loading={runner.busyId === `analyze-${profile.id}`}
          disabled={health.assetCount === 0}
          onClick={onAnalyze}
        >
          <Icon name={health.ready ? "RefreshCw" : "Sparkles"} size={15} />
          {health.ready ? "נתח מחדש" : "נתח"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          loading={runner.busyId === `default-${profile.id}`}
          disabled={profile.is_default}
          onClick={onMakeDefault}
        >
          <Icon name="Star" size={15} />
          הגדר כברירת מחדל
        </Button>
        <Button
          size="sm"
          variant="danger"
          loading={runner.busyId === `delete-${profile.id}`}
          onClick={onDelete}
        >
          <Icon name="Trash2" size={15} />
          מחק
        </Button>
      </div>

      {/* expanded detail — remount when the upstream asset set changes so local
          state re-initializes from fresh props (e.g. after analyze/refresh). */}
      {expanded && (
        <ProfileDetail
          key={data.assets.map((a) => `${a.id}:${a.analysis_status}`).join("|")}
          data={data}
          orgId={orgId}
          onAssetsChanged={onAssetsChanged}
        />
      )}
    </motion.div>
  );
}

// ── Expanded detail (Style DNA + reference grid + uploader) ─────────────────────
function ProfileDetail({
  data,
  orgId,
  onAssetsChanged,
}: {
  data: ProfileWithHealth;
  orgId: string;
  onAssetsChanged: () => Promise<ProfileWithHealth[]>;
}) {
  const { profile } = data;
  const [assets, setAssets] = useState<CreativeReferenceAssetRow[]>(data.assets);
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [busy, setBusy] = useState(false);

  const refreshAssets = useCallback(async () => {
    try {
      const next = await listCreativeReferenceAssetsAction(profile.id);
      setAssets(next);
    } catch {
      /* tolerate */
    }
    await onAssetsChanged();
  }, [profile.id, onAssetsChanged]);

  const atCap = assets.length >= MAX_REFERENCES_PER_PROFILE;

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!orgId) {
      setUploads([{ id: "noorg", name: "—", status: "error", error: "חסר מזהה ארגון. ודא שאתה מחובר." }]);
      return;
    }
    const remaining = MAX_REFERENCES_PER_PROFILE - assets.length;
    const list = Array.from(files).slice(0, Math.max(0, remaining));
    if (list.length === 0) return;

    setBusy(true);
    const progress: UploadProgress[] = list.map((f, i) => ({ id: `${Date.now()}-${i}`, name: f.name, status: "uploading" }));
    setUploads(progress);

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      const entry = progress[i];
      try {
        const { path, fileName, mimeType } = await uploadCreativeReferenceFile(file, { orgId, profileId: profile.id });
        const res = await addCreativeReferenceAssetAction({ profileId: profile.id, storagePath: path, fileName, mimeType });
        if (!res.ok) throw new Error(res.message ?? "הוספת המודעה נכשלה.");
        entry.status = "done";
      } catch (e) {
        entry.status = "error";
        entry.error = e instanceof Error ? e.message : "ההעלאה נכשלה.";
      }
      setUploads([...progress]);
    }

    await refreshAssets();
    setBusy(false);
    // clear the progress list shortly after, keep errors visible a bit longer
    setTimeout(() => setUploads((u) => u.filter((x) => x.status === "error")), 2500);
  };

  const deleteAsset = async (assetId: string) => {
    setAssets((a) => a.filter((x) => x.id !== assetId));
    try {
      await deleteCreativeReferenceAssetAction(assetId);
    } finally {
      await refreshAssets();
    }
  };

  return (
    <div className="border-line mt-1 flex flex-col gap-4 border-t pt-4">
      {/* Style DNA summary */}
      {(profile.analysis_summary || profile.style_prompt || profile.negative_prompt) && (
        <div className="bg-surface border-line flex flex-col gap-3 rounded-xl border p-3">
          <h4 className="text-ink flex items-center gap-1.5 text-[13px] font-black">
            <Icon name="Sparkles" size={14} className="text-brand" />
            Style DNA
          </h4>
          {profile.analysis_summary && (
            <DnaField label="סיכום ניתוח" value={profile.analysis_summary} />
          )}
          {profile.style_prompt && <DnaField label="Style Prompt" value={profile.style_prompt} mono />}
          {profile.negative_prompt && <DnaField label="Negative Prompt" value={profile.negative_prompt} mono />}
        </div>
      )}

      {/* Upload */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-ink text-[13px] font-black">מודעות ייחוס</h4>
          <span className="text-muted text-[11px] font-semibold">
            {assets.length} / {MAX_REFERENCES_PER_PROFILE}
            {assets.length < MIN_REFERENCES_RECOMMENDED && ` · מומלץ לפחות ${MIN_REFERENCES_RECOMMENDED}`}
          </span>
        </div>
        <label
          className={cn(
            "border-line bg-surface flex cursor-pointer flex-col items-center gap-1 rounded-xl border border-dashed p-5 text-center transition-colors",
            atCap || busy ? "cursor-not-allowed opacity-50" : "hover:border-brand/50",
          )}
        >
          <Icon name="Upload" size={20} className="text-muted" />
          <span className="text-ink text-[12px] font-bold">
            {atCap ? `הגעת למקסימום (${MAX_REFERENCES_PER_PROFILE})` : "גרור או בחר תמונות (PNG / JPG / WEBP)"}
          </span>
          <span className="text-muted text-[11px]">ניתן להעלות כמה קבצים יחד</span>
          <input
            type="file"
            accept={ACCEPT}
            multiple
            disabled={atCap || busy}
            className="hidden"
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </label>

        {/* upload progress */}
        {uploads.length > 0 && (
          <div className="flex flex-col gap-1">
            {uploads.map((u) => (
              <div key={u.id} className="flex items-center gap-2 text-[11px]">
                {u.status === "uploading" && <Icon name="Loader" size={13} className="text-brand animate-spin" />}
                {u.status === "done" && <Icon name="Check" size={13} className="text-success" />}
                {u.status === "error" && <Icon name="AlertTriangle" size={13} className="text-danger" />}
                <span className="text-muted truncate">{u.name}</span>
                {u.error && <span className="text-danger">— {u.error}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* asset grid */}
      {assets.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {assets.map((asset) => (
            <AssetThumb key={asset.id} asset={asset} onDelete={() => deleteAsset(asset.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DnaField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted text-[11px] font-bold">{label}</span>
      <p className={cn("text-ink text-[12px] leading-relaxed whitespace-pre-wrap", mono && "font-mono text-[11px]")}>{value}</p>
    </div>
  );
}

// ── Reference thumbnail (lazy signed URL) ───────────────────────────────────────
function AssetThumb({ asset, onDelete }: { asset: CreativeReferenceAssetRow; onDelete: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const badge = ASSET_BADGE[asset.analysis_status] ?? ASSET_BADGE.pending;

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.storage
          .from("creative-references")
          .createSignedUrl(asset.storage_path, 600);
        if (!active) return;
        if (error || !data?.signedUrl) setFailed(true);
        else setUrl(data.signedUrl);
      } catch {
        if (active) setFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [asset.storage_path]);

  return (
    <div className="border-line bg-surface group relative overflow-hidden rounded-xl border">
      <div className="bg-line/40 aspect-square w-full">
        {url && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={asset.file_name ?? ""} className="h-full w-full object-cover" onError={() => setFailed(true)} />
        ) : (
          <div className="text-muted grid h-full w-full place-items-center">
            <Icon name={failed ? "Image" : "Loader"} size={20} className={failed ? "" : "animate-spin"} />
          </div>
        )}
      </div>
      <div className="absolute inset-x-0 top-0 flex items-center justify-between p-1.5">
        <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold backdrop-blur-sm", badge.cls)}>{badge.label}</span>
        <button
          onClick={async () => {
            setDeleting(true);
            try {
              await onDelete();
            } finally {
              setDeleting(false);
            }
          }}
          disabled={deleting}
          className="bg-danger/90 grid h-6 w-6 place-items-center rounded-full text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
          title="מחק"
        >
          <Icon name={deleting ? "Loader" : "Trash2"} size={12} className={cn("text-white", deleting && "animate-spin")} />
        </button>
      </div>
    </div>
  );
}
