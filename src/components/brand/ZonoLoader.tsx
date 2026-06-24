// ============================================================================
// ZONO — premium branded route-loading screen. Full-screen lavender stage with
// a soft radial glow, the ZONO logo cradled in an orbiting ring + expanding
// pulse rings, and a shimmering progress bar. Used by every route loading.tsx.
// ============================================================================
import { ZonoLogo } from "./ZonoLogo";

export function ZonoLoader({ label = "טוען…" }: { label?: string }) {
  return (
    <div
      dir="rtl"
      className="bg-surface relative flex min-h-screen flex-col items-center justify-center gap-7 overflow-hidden"
    >
      {/* soft ambient glow */}
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(560px circle at 50% 42%, rgba(124,58,237,0.12), transparent 70%)",
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="zload-stage">
          <span className="zload-ring" />
          <span className="zload-ring r2" />
          <span className="zload-ring r3" />
          <span className="zload-orbit" />
          <ZonoLogo priority width={104} height={104} className="zload-logo !h-[104px] !w-[104px] object-contain" />
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="zload-bar" />
          <p className="text-muted text-sm font-bold">
            <span className="text-brand-strong">{label}</span>
            <span className="zload-dots" />
          </p>
        </div>
      </div>
    </div>
  );
}
