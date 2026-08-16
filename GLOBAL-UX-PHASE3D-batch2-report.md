# GLOBAL UX PHASE 3D — BATCH 2 (advancing, not complete)

You chose to finish Phase 3D, so I went all-in on it (GROW + Facebook set aside). This is a real, build-verified batch that advances the sweep; it does **not** yet reach the zero criteria, and I won't label it complete.

## Done this batch (12 files, build-verified)
**Non-AI Sparkles → semantic icons** (genuine-AI kept):
- settings/distribution-connections: Instagram→Camera, analytics→BarChart3, info box→Info
- acquisition: opportunity/compute→Target · competitors: compute intel→Radar · team: team intel→Users, coaching→Users
- properties/ExternalListings: "new today" KPI→Inbox, sync→Radar (kept "מודיעין שוק AI")
- graph: agent-specialization→Award, signal fallback→Radar · marketing: compute→Megaphone (kept AI campaigns/creative)
- home-control: daily→Sunrise, area fallback→Layers, close-probability→TrendingUp
- dashboard-home: Mission Control→Radar
- Icon registry: added `Camera` (Instagram brand icon isn't in this lucide version — swapped to Camera)

**Legacy icon-box texture removed (§3)** — stripped decorative pale-box section-header icons (typography-led headings now): `LeadDetailView` (8→1), `SellerDetailView` (4→0), `PropertyDetailView` (0), `BuyerDetailView` (1 non-header remains).

tsc 0 · eslint 0 · build READY (99s) · applies cleanly on `origin/main` (`f5c52c2`).

## Honest completion status
- **SPARKLES_UNCLASSIFIED** = **NOT 0** — ~94 non-AI-heuristic occurrences remain across ~40 files. On inspection a large share are genuine AI/creative (copilot, ai-office, zi-expert, AISuggestions, command centers, demand, creative-dna, "צור/הפק/נתח") that must be **kept**; a real subset are still decorative non-AI needing replacement (more per-file classification).
- **LEGACY_USER_FACING_TO_REPLACE** = **NOT 0** — detail-view headers largely cleared; remaining KPI/section icon-boxes in tasks(action-center)/viewings/market/office-intelligence/notifications/settings and secondary dashboard sections not yet swept.
- **RTL_UNAUDITED_PRIMARY_SURFACES** = **NOT 0** — full semantic RTL audit not performed this batch.
- **TYPECHECK / LINT / BUILD** = PASS · **BUSINESS_LOGIC / SCHEMA / MIGRATION** = NO changes.
- **CODE_RENDER_PATH_ROLLOUT** = advancing; **not GO** (the three zero-criteria aren't met).

Reaching certified zero across all three criteria requires several more per-file-classified batches (correctly discriminating genuine-AI from decorative on each of the ~40 remaining files, plus the RTL semantic pass) — more than one turn produces reliably, which is why I'm reporting honestly rather than claiming completion.

## Apply
```bash
cd ~/code/zono-os && git pull origin main
git apply GLOBAL-UX-PHASE3D-batch2.patch
git add -A && git commit -m "UX 3D batch2: non-AI Sparkles across 10 modules + detail-view section-header de-boxing"
git push origin main
```
