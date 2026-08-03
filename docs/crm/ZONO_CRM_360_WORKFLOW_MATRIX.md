# ZONO CRM 360 — Workflow Test Matrix

30 real-world lifecycle scenarios, each judged against the current build (evidence-based). Verdict: ✅ works end-to-end · ⚠️ partial (breaks at a named step) · ❌ cannot be completed. This is the ground truth for launch: a CRM 360 requires the ✅ set to cover the full lead→commission spine.

| # | Scenario | Verdict | Breaks at / evidence |
|---|----------|---------|----------------------|
| 1 | Website lead → buyer → completed deal | ⚠️ | capture✅ convert✅ but no auto lead→deal; deal via match/manual; offer not persisted; commission manual |
| 2 | Marketplace opportunity → seller listing | ⚠️ | opportunity→**property** only; never creates a seller/lead person (dead-end for CRM) |
| 3 | Manual seller lead signs exclusivity | ⚠️ | seller create✅; exclusivity lives on property as bool+date; no agreement file link on seller; no e-sign |
| 4 | Buyer changes budget → new matches | ⚠️ | budget edit✅; recompute✅; but matches are a scorecard — no send/notify to buyer |
| 5 | Buyer rejects a match, system learns reason | ❌ | `feedbackPositive` hard-coded false; no learning loop |
| 6 | Property price changes → buyers re-evaluated | ⚠️ | price change logs event✅; recompute exists; no buyer notification/propagation |
| 7 | Viewing → feedback → follow-up | ❌ | **no viewings/feedback tables** |
| 8 | Buyer submits an offer | ❌ | **no offers table** — offer is ephemeral |
| 9 | Seller counteroffer | ❌ | no offer/counteroffer persistence |
| 10 | Deal through legal & financing stages | ⚠️ | stages advance✅ + history✅; but no financing/due-diligence/handover stages; legal docs link but e-sign manual |
| 11 | Deal closes → commission calculated | ⚠️ | close writes real WON deal✅; commission = one manual number; **no split/VAT/collection** |
| 12 | Deal lost & reopened | ⚠️ | lost✅; **no reopen transition** |
| 13 | Lead reassigned between agents | ⚠️ | `assignLeadToAgent` writes owner_id✅; unverifiable single-owner; no bulk transfer |
| 14 | Agent leaves, records transferred | ❌ | disable only; **no record transfer**; disabled user still has access |
| 15 | Duplicate contact imported | ❌ | **no CRM import**; dedup not wired to any import |
| 16 | Duplicate property from another source | ⚠️ | external dedup✅; **internal property dedup absent** |
| 17 | WhatsApp conversation → task | ⚠️ | AI extracts action as *suggestion*; durable task-from-message not fully wired |
| 18 | Missed follow-up → recovery workflow | ❌ | no stale-lead scanner/automation dispatch |
| 19 | Exclusivity about to expire | ⚠️ | date stored; classify-only; no scheduled alert/automation |
| 20 | Manager reviews weak pipeline | ⚠️ | office/exec dashboards live-computed✅; unverifiable single-owner; no agent/source filters |
| 21 | Two agents cooperate on one deal | ❌ | no cooperating-broker field/split |
| 22 | Office/agent commission split changes | ❌ | no split model at all |
| 23 | Cross-org record access blocked | ⚠️ | RLS on core✅; **109 tables no RLS + public doc bucket** → not provably isolated |
| 24 | System operates with zero data | ✅ | honest empty-states throughout (verified in libs) |
| 25 | System operates with high data volume | ⚠️ | intelligence tables large & performant; CRM transactional volume untested (empty) |
| 26 | Full mobile field workflow | ⚠️ | RTL + field-ops exist; not verified on real device |
| 27 | Connection lost & restored | ⚠️ | offline detector fixed (QA Stage 1); offline write-queue has zero callers |
| 28 | Background automation fails & retries | ⚠️ | kernel retries/dead-letter real; but business automations aren't dispatched |
| 29 | Import with partial invalid rows | ❌ | **no import pipeline** |
| 30 | AI recommendation rejected & recorded | ⚠️ | broker-intelligence outcome loop records some; not universal |

## Score
- ✅ end-to-end: **1 / 30** (zero-data empty states)
- ⚠️ partial: **20 / 30**
- ❌ cannot complete: **9 / 30**

The lead→commission spine (scenarios 1, 7–11, 21–22) is dominated by ❌/⚠️. **No single agent could run 30 days as sole system of record today** — they could not import their book, capture offers, calculate commissions, log viewings, or safely store contracts.

## Per-scenario spec (template applied to all 30 during implementation)
Each scenario's build ticket must specify: starting data · user role · route sequence · actions · expected state changes · expected timeline entries · expected tasks · expected notifications · expected reporting deltas · permissions · failure cases · rollback/recovery · automated coverage · manual QA. (Captured per-item in the backlog acceptance criteria.)
