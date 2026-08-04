# Provider & Model Configuration

Single source: `model-config.ts`. No image-model string is hardcoded in business logic.

- **Model precedence:** `OPENAI_IMAGE_MODEL` → legacy `ZONO_OPENAI_IMAGE_MODEL` → default `gpt-image-2`.
- **Default verified:** `gpt-image-2` is available in the OpenAI API (OpenAI "Introducing gpt-image-2 — available today in the API", 2026); `gpt-image-1` remains a supported fallback. `SUPPORTED_IMAGE_MODELS = [gpt-image-2, gpt-image-1]`.
- **Provider:** `resolveProviderName()` → `openai` when `OPENAI_API_KEY` is set, else `mock`.
- **Startup validation:** `validateImageConfig()` returns `{ provider, model, hasKey, modelRecognized, liveReady, notes }` and **never exposes the key**. When no key is present, `liveReady=false` and callers must run the **mock provider** and mark live generation **configuration-blocked** — not complete.
- **Interface:** `ImageProvider { generate, edit }` with `MockImageProvider` (deterministic) and `OpenAIImageProvider` (delegates to the existing `visual-providers`/`openai-ad-pipeline` calls; **no second OpenAI client**). Every result carries the resolved `model`. Provider failures are normalized to `ProviderError { klass, status }`.

**Live status in this environment:** no `OPENAI_API_KEY` → mock only; live generation is configuration-blocked (not certified).
