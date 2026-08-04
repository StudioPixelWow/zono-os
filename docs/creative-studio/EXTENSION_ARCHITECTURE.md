# Creative-Studio Extension — Architecture

The existing `src/lib/creative-studio/` remains the **single** visual-generation engine. This phase adds capabilities *inside* it (classified Extend / Disconnected / Missing-in-studio in the accepted gap audit) plus ZONO-native orchestration seams *outside* it. Nothing existing was rebuilt.

## Ownership boundary
- **creative-studio owns:** brief interpretation, creative direction, visual generation, deterministic Hebrew composition, brand application, variants, creative QA, refinement, approved outputs.
- **ZONO-native orchestration owns:** campaigns, calendar/Gantt, content items, scheduling, publishing (distribution/meta), performance, learning feedback.

## New/changed modules (this phase)
| Module | Purpose | Kind |
|---|---|---|
| `model-config.ts` | single model+provider resolver, startup validation, verified `gpt-image-2` default | changed |
| `image-provider.ts` | `ImageProvider` interface + `MockImageProvider` + `OpenAIImageProvider` (thin adapter over existing pipeline; **no 2nd client**), normalized `ProviderError` | new |
| `provider-retry.ts` | transient-only retry (429/502/503/timeouts), backoff+jitter+budget; separate from QA regen & refinement | new |
| `brand-asset-resolver.ts` | single brand resolver with precedence + approval-status gating | new |
| `creative-kinds.ts` | additive `agent_brand` / `office_brand` / `market_stat` + market-stat sourcing guard | new |
| `visual-gen-math.ts` | pure placement + contrast (light/dark) + safe-zone + platform-size logic | changed |
| `logo-composite.ts` | deterministic sharp compositing, contrast-correct variant, safe-zone aware | changed |
| `size-variants.ts` | platform export variants (IG sq/portrait, Story, FB, WhatsApp) | changed |
| `output-lineage.ts` | parent/root/round lineage + immutable-history guard | new |
| `usage-logging.ts` | redacted `usage_events` logging (no secrets/prompts/blobs), honest cost basis | new |

## Layering
`CreativeGenerationService (existing) → ImageProvider → OpenAI|Mock`; brand resolution, retry, lineage and usage logging wrap the existing generate/QA flow without replacing it. Pure logic (math, classification, resolution, lineage, redaction) is isolated for deterministic unit testing.
