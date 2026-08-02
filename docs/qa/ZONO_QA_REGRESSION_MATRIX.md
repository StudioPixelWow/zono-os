# ZONO — QA Regression Matrix

For each fix, the surfaces that must be re-tested because they share code paths, data, or components. "Automated" = covered by a test to add; "Manual" = UI/prod check.

| Fix | Regression surfaces to retest | Automated | Manual |
|---|---|---|---|
| **P0-1 map** | `/market-intelligence/map` (main), Heatmap tab, property-detail map, territory map, any other `ZonoMap` embed | ZonoMap init / style-fallback / no-data / invalid-coord tests | Prod: map paints on nav + refresh; kill style URL → error state not blank |
| **P0-2 offline** | Every `(app)` screen (global toast), `VisitMode` field ops, offline queue (dead today) | transient/repeated/real-offline/recovery/server-error/route-transition | DevTools offline↔online toggle across 3 screens |
| **P0-3 valuation** | `/valuation` list, `/valuation/[id]` detail, `/valuation/new` wizard, seller-portal valuation read, listing-agent pricing (`valuation.ts:41`), any dashboard consuming valuations | missing/invalid city, null, zero, valid, provider timeout/error, duplicate, refresh-mid-process | Run valuation in data-poor area → "לא חושב" not ₪0-completed; legacy rows reclassified |
| **P1-1 location** | `/graph`, `/territory`, `/valuation` comps, marketplace/matching, geocoding, buyer-supply matching, search filters | resolver units (HE/EN/קרית-קריית/typo/unknown), "never-merge-distinct", idempotent re-run, before/after aggregate diff | Graph shows one Kiryat Bialik node; territory aggregates merge; spot-check ambiguous list |
| **P1-2 counters** | `/mission-control` (הזדמנויות היום), `/market-intelligence/map` sidebar, `/marketplace` (התאמות), any KPI tile reading `intelligence-explorer` / `marketplace-intelligence` | count==list-length per screen; loading shows no false 0 | Prod: header numbers match visible cards |
| **P1-3 prediction** | `/predictions` (missed_followup, broker_overload), Daily/Executive tiles reading follow-up rate | 0-population⇒insufficient; N-population⇒real %; expiry | Prod: 0 leads ⇒ insufficient card, no 100% |
| **P1-4 validation** | `/valuation/new`, property-detail valuation entry, `createAndRunValuationAction` | step-advance blocked without city; server rejects missing city | Manual wizard attempt |
| **P1-5 scores** | Marketplace cards, territory scores, deal/matching scores, prediction confidence | score-chip renders scale+breakdown; snapshot | Visual scan of each score surface |
| **P1-7 self-match** | Daily/Executive/Action Center matches, comment→lead ingestion, matching-intelligence | self-match excluded; cross-role collision | Prod: owner no longer appears as own buyer |
| **P1-6 dedup** | Daily OS, Home, Executive, Action Center feeds | duplicate street item appears once; cross-lane dedup | Prod: "גפן 29"/"הגפן" not double-listed |
| **P2-1 graph exposure** | Left nav, `/graph`, any link to graph | nav has no dead link when disabled | Manual nav check |
| **P2-2 territory** | `/territory` tabs | empty-state renders when share=0 | Manual |

**Cross-cutting regression guard:** after Stage-2 location resolution, re-run the P1-2 counter checks and P1-6 dedup checks — canonicalization changes aggregate/dedup keys and could shift counts.
