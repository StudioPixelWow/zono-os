# ZONO Agent Website — `/agent` ⟷ `/ai-agent` PARITY & CONSOLIDATION

> Decision (owner): **`/agent` is the ONE canonical Agent Website** — one builder, model, service, public route, management surface, analytics/lead pipeline. **AI is a capability of the Agent Website, not a separate product.** `/ai-agent` is retired *only* after parity is absorbed and regression passes; legacy URLs preserved via redirect.

## 0. The two systems (as-built)

| Dimension | `/agent/[slug]` (CANONICAL) | `/ai-agent/[slug]` (to absorb+retire) |
|---|---|---|
| Lib | `src/lib/agent-website/` | `src/lib/agent-site/` (+ `brokerage-site/`) |
| Table | `agent_websites` (by slug, `published`) | `agent_websites` (same row) |
| **Lead capture** | ✅ real → `leads`+`agent_website_leads`+event+kernel | ❌ wa.me deep-link only (captures nothing) |
| Analytics | ✅ `logAgentSiteEvent` + `view_count` | ❌ |
| KPIs | ✅ `agent_intelligence_profiles`, sold count | partial |
| Design | ⬆️ now premium (this build) | premium `site-ui/*` |
| AI copy | ⬆️ folded into DTO as a capability | `assemble.ts` |
| SEO/JSON-LD | ✅ Person+RealEstateAgent+Breadcrumb | sitemap/robots/per-page |
| Map | ✅ `ZonoMap` expertise map (this build) | none on public |

## 1. What this build delivered on `/agent` (canonical)

- **One template engine**: `src/components/agent-website/AgentWebsiteTemplate.tsx` — STRUCTURE fixed (ZONO grid), IDENTITY per brand. Unlimited agent brands from one template.
- **Brand Resolution Engine**: reuses `resolveEffectiveBrand(agent, office)` → `buildBrandTokens()` (`src/lib/agent-website/brand-tokens.ts`) → semantic `--brand-*` tokens. Office colors + agent overrides; **WCAG accessible-variant fallback** (pale brand color auto-darkened for text; on-color auto-picked for CTA). Verified on 3 radically different brands + a no-color fallback (all AA).
- **Sanitised public DTO**: `getAgentSite(slug)` (`src/lib/agent-website/site-data.ts`) — public-safe only; no CRM notes/leads/commissions.
- **Data-driven conditional sections** (render / fallback / hide): Hero (alternate layout when no photo), Property Search, Featured, Expertise Map (real coords → `ZonoMap`; else Area-Expertise fallback — never a broken map), Area Expertise, Advantages, About (bio or facts-only), Trust Numbers (hidden when <2 real stats), Testimonials (hidden when none — no fakes), Recommended (excludes featured), Contact CTA (real lead form → CRM), Footer (office logo or agent wordmark fallback).
- **Branded filtered listing**: `/agent/[slug]/properties` now consumes search filters (area/type/price/rooms/free-text) and renders the branded card.
- **SEO/GEO**: dynamic metadata + OpenGraph/Twitter + JSON-LD (`Person` + `RealEstateAgent` + `PostalAddress` + `BreadcrumbList`).
- **Lead capture + analytics preserved** (no regression): existing `submitAgentLead` + `logAgentSiteEvent` reused unchanged.

## 2. Capabilities still to ABSORB from `/ai-agent` before retiring it

1. Multi-page depth: `/about`, `/areas`, `/property/[id]`, `/area/[name]` → canonical `/agent/[slug]/*` (reuse `PropertyMicrosite`, `AreaGuide`).
2. AI insights + Ask-AI widget (`AskWidget`) → repoint to a canonical `/api/agent/[slug]` and mount inside the template.
3. sitemap.xml / robots.txt for `/agent`.
4. Richer AI area model (`buildAgentAreas`) if it beats the current locality merge.

## 3. Retirement / migration (safe, non-breaking) — NOT YET EXECUTED

Sequencing (owner-approved: *retire the duplicate only after regression passes*):

1. ✅ Build canonical premium `/agent` (this PR). **No schema change** — same `agent_websites` row + lead/event tables. Published sites keep slug+status.
2. ⏳ Deploy → runtime-verify `/agent/<slug>` render + a live lead submit (the 40-scenario ZZ-TEST covers 9–14).
3. ⏳ Absorb the §2 capabilities into `/agent`.
4. ⏳ Add path-preserving redirects `\/ai-agent\/[slug]\/*` → `\/agent\/[slug]\/*` (middleware or route `redirect()`), so indexed `/ai-agent` links keep resolving.
5. ⏳ After redirects + regression pass, delete the duplicate `agent-site` renderers (keep shared helpers still referenced by office/landing sites).

**Redirects are intentionally NOT added in this PR** — adding them before the new `/agent` is deployed and verified would break `/ai-agent` prematurely. This matches the owner rule "retire the duplicate implementation only after regression tests pass."

## 4. Data mapping (design field → real source; MISSING flagged)

| Design field | Source | Status |
|---|---|---|
| Agent name/title/headline/bio/photo/phone/whatsapp/email | `agent_websites` | ✅ |
| Brand primary/secondary/accent, logo variants, palette | `brand_identity_profiles` (agent `entity_id=user`, office `entity_id=org`) → `resolveEffectiveBrand` | ✅ |
| Areas | `agent_websites.service_areas` + `agent_locality_performance` | ✅ |
| Properties (price/rent/rooms/sqm/floor/type/status/image/tag) | `properties` (+ `has_exclusivity`, `listing_tag`) | ✅ |
| Coordinates (map) | `properties.latitude/longitude` | ✅ (sparse: 1/15 geocoded live → map falls back to Area Expertise) |
| Stats (deals/sold/satisfaction/years) | `agent_intelligence_profiles`, sold count, `years_experience` | ✅ (hidden when absent) |
| Testimonials | `agent_websites.testimonials` (jsonb) | ✅ (hidden when none) |
| Office address | `organizations.city` (no `address` column) | ⚠️ city used as address; **`organizations.address` = MISSING** |
| Agent achievements/awards | — | ❌ MISSING (omitted, not faked) |
| Production map tiles | `NEXT_PUBLIC_MAP_STYLE_URL` env | ⚠️ required for prod map; dev falls back to OSM |

## 5. Verification done in this build

- Typecheck: `tsc --noEmit` → **0 errors under `src/`** (only pre-existing e2e/playwright dev-dep errors, unrelated).
- Lint: **0 errors** (only `<img>` warnings, matching existing public cards).
- Guards: `check:use-server` clean (147 modules).
- **Multi-brand QA (spec §33)**: `buildBrandTokens` on dark-navy, pale-gold luxury, strong-rose, and no-color fallback → all AA (link ≥4.5, CTA ≥4.5); pale gold `#c8a24a` auto-darkened to `#7e6a3d` for text; 4/4 distinct primaries. STRUCTURE constant, IDENTITY varies.
- **Data-layer validated on real published site** `agent-139e649a` (טל זטלמן): 10 public props (8 featured + 2 recommended), brand `#024C96` resolved from `brand_identity_profiles`, no office logo → wordmark fallback, empty stats → strip hidden. Zero query errors.

## 6. Remaining (post-deploy)

Runtime render + live lead-submit certification; absorb §2 capabilities; add `/ai-agent`→`/agent` redirects; retire duplicate after regression; add `organizations.address` if a precise office address is wanted; set `NEXT_PUBLIC_MAP_STYLE_URL` for production map tiles.
