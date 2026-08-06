# Creative-Studio — Runtime Baseline (now GREEN)

Real commands, this cloud sandbox, on `origin/main` + the Creative-Studio Extension + this Local-Runtime phase.

| Step | Command | Result |
|---|---|---|
| Install | `npm ci` | PASS (exit 0) |
| Lint | `npm run lint` | **PASS — 0 errors, 28 warnings** (the 2 prior errors fixed) |
| TypeScript | `npx tsc --noEmit` | **PASS — 0 errors** |
| Production build | `npm run build` | **PASS — offline** (no Google-Fonts network fetch) |
| Extension unit suite | `tsx …/visual-gen-extensions.qa.ts` | PASS — 52/52 |
| Local runtime integration | `tsx …/content-orchestration/runtime.qa.ts` | PASS — 34/34 |
| Migration replay | 210 migrations on a clean PG16 | PASS — 210/210 |

## Phase 1 repairs
- **Lint:** `src/components/draft-studio/CommunicationStudio.tsx` — the two `"` in the Workflow banner escaped as `&quot;` (rule not suppressed).
- **Offline build:** `src/app/layout.tsx` — removed `next/font/google` (Heebo). The `--font-heebo` CSS variable is now resolved to a Hebrew-capable **system font stack** (Heebo/Assistant/Rubik → system-ui → Arial Hebrew). No build-time network fetch; no font files downloaded/committed. Swap to `next/font/local` if a licensed Heebo `.woff2` is added later — no other code changes.

Warnings (28, pre-existing, non-blocking) are recorded but not fixed here.
