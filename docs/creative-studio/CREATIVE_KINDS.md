# Creative Kinds

`creative-kinds.ts` — additive. Existing kinds (`property_ad_post`, `sold_post`, `testimonial_post`) are unchanged. Added: `agent_brand`, `office_brand`, `market_stat`.

- **agent_brand** subtypes: introduction, expertise, neighborhood_specialist, testimonial, success_story, personal_insight, contact_cta. Requires agent photo + logo.
- **office_brand** subtypes: introduction, team_strength, recruitment, achievement, market_presence, community_activity, branch_announcement, service_message. Requires logo + office contact.
- **market_stat** subtypes: neighborhood_update, city_update, price_change, listing_volume_change, time_on_market, price_per_sqm, new_opportunities, price_anomaly, period_summary.

**Market-stat sourcing (never invent a number):** `validateMarketStat` requires `source`, `period`, `geography`, `freshnessTimestamp`, `value`, `comparisonBasis`, and `classification` (`factual|inferred`). Missing provenance → rejected. Market data is supplied by ZONO-native orchestration; the engine never queries arbitrary market data itself. `requiredAssetsFor(kind)` drives brand resolution + QA.
