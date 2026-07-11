// ============================================================================
// 🧭 ZONO OS 2.0 — STAGE 5 · Batch 5.5B · COCKPIT ASSEMBLER QA (OFFLINE).
//
// Every scenario here is a rule the cockpit has broken before, or a rule 5.5 is
// making. Runs with no database:  npx tsx src/lib/journey-cockpit/qa.ts
// ============================================================================
import type { CanonicalJourneyRow } from "@/lib/journey-center/canonical";
import {
  allowedCommandsFor, assembleCockpitJourney, buildHistory, buildLadder, fallbackCockpitJourney,
  lastLadderStage, NO_FACTS, progressFor, transitionSource,
  type CockpitEventRow,
} from "./assemble";

export interface QaResult { name: string; pass: boolean; detail: string }

const NOW = Date.parse("2026-07-11T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

const journey = (over: Partial<CanonicalJourneyRow> = {}): CanonicalJourneyRow => ({
  id: "j-1",
  orgId: "org-1",
  journeyType: "seller",
  entityType: "seller",
  entityId: "s-1",
  currentStage: "marketing",
  status: "active",
  ownerUserId: "u-1",
  stageEnteredAt: daysAgo(3),
  lastActivityAt: daysAgo(1),
  startedAt: daysAgo(40),
  source: "event",
  metadata: null,
  ...over,
});

const ev = (over: Partial<CockpitEventRow> = {}): CockpitEventRow => ({
  id: "e-1",
  journeyId: "j-1",
  eventType: "stage_change",
  fromStage: "pricing",
  toStage: "marketing",
  occurredAt: daysAgo(3),
  reason: "seller.listing_published",
  actorUserId: "u-1",
  evidence: { sourceEvent: "property.published" },
  ...over,
});

export function runCockpitQa(): QaResult[] {
  const r: QaResult[] = [];
  const ok = (name: string, pass: boolean, detail: string) => r.push({ name, pass, detail });

  // 1 — The ladder comes from the canonical machine, and only rungs BEHIND us are done.
  {
    const c = assembleCockpitJourney({ journey: journey(), events: [ev()], facts: NO_FACTS, nowMs: NOW });
    const cur = c.ladder.find((s) => s.current);
    const doneCount = c.ladder.filter((s) => s.done).length;
    ok("1 · ladder from the canonical machine",
      cur?.key === "marketing" && doneCount === 6 && c.stageLabel === "שיווק",
      `current=${cur?.key} done=${doneCount} label=${c.stageLabel}`);
  }

  // 2 — History is REAL journey_events, newest first. Never synthesised.
  {
    const events = [
      ev({ id: "e-a", fromStage: null, toStage: "new", eventType: "journey_opened", occurredAt: daysAgo(40), reason: null }),
      ev({ id: "e-b", fromStage: "new", toStage: "valuation", occurredAt: daysAgo(20) }),
      ev({ id: "e-c", fromStage: "valuation", toStage: "marketing", occurredAt: daysAgo(3) }),
    ];
    const c = assembleCockpitJourney({ journey: journey(), events, facts: NO_FACTS, nowMs: NOW });
    ok("2 · history = real events, newest first",
      c.history.length === 3 && c.history[0].id === "e-c" && c.history[2].id === "e-a"
      && c.history[2].fromStage === null && c.history[2].reason === null,
      `ids=${c.history.map((h) => h.id).join(",")} oldestReason=${c.history[2]?.reason}`);
  }

  // 3 — NO events ⇒ empty history. The assembler does not invent a transition
  //     from the journey row's current stage.
  {
    const c = assembleCockpitJourney({ journey: journey(), events: [], facts: NO_FACTS, nowMs: NOW });
    ok("3 · no events ⇒ empty history (nothing fabricated)",
      c.history.length === 0, `history=${c.history.length}`);
  }

  // 4 — stageAgeDays is null when unmeasurable — NEVER 0.
  {
    const c = assembleCockpitJourney({
      journey: journey({ stageEnteredAt: null, startedAt: null }),
      events: [], facts: NO_FACTS, nowMs: NOW,
    });
    ok("4 · unmeasurable stage age ⇒ null, not 0",
      c.stageAgeDays === null, `stageAgeDays=${String(c.stageAgeDays)}`);
  }

  // 5 — A kernel transition has a null actor. That is honest, not "System".
  {
    const c = assembleCockpitJourney({
      journey: journey(), events: [ev({ actorUserId: null })], facts: NO_FACTS, nowMs: NOW,
    });
    ok("5 · kernel actor stays null", c.history[0].actorUserId === null,
      `actor=${String(c.history[0].actorUserId)}`);
  }

  // 6 — STALLED is an observed fact (>= 14 days on the same stage).
  {
    const c = assembleCockpitJourney({
      journey: journey({ stageEnteredAt: daysAgo(21) }), events: [], facts: NO_FACTS, nowMs: NOW,
    });
    const stalled = c.blockers.find((b) => b.kind === "stalled");
    ok("6 · stalled blocker is observed, not guessed",
      !!stalled && c.stageAgeDays === 21, `age=${String(c.stageAgeDays)} blocker=${stalled?.kind}`);
  }

  // 7 — A PAUSED journey keeps the progress it earned. It does not read as 0%.
  {
    const events = [
      ev({ id: "e-1", fromStage: "pricing", toStage: "marketing", occurredAt: daysAgo(10) }),
      ev({ id: "e-2", fromStage: "marketing", toStage: "churn_risk", occurredAt: daysAgo(2) }),
    ];
    const c = assembleCockpitJourney({
      journey: journey({ currentStage: "churn_risk", status: "active" }),
      events, facts: NO_FACTS, nowMs: NOW,
    });
    const back = lastLadderStage("seller", c.history);
    ok("7 · lateral stage holds its real ladder progress",
      back === "marketing" && c.progress > 0 && c.progress === progressFor("seller", "marketing", []),
      `lastRung=${String(back)} progress=${c.progress}`);
  }

  // 8 — …and with no history to prove a position, it claims none (0), not a guess.
  {
    const c = assembleCockpitJourney({
      journey: journey({ currentStage: "churn_risk" }), events: [], facts: NO_FACTS, nowMs: NOW,
    });
    ok("8 · lateral with no history ⇒ progress 0 (claims nothing)",
      c.progress === 0, `progress=${c.progress}`);
  }

  // 9 — WON completes the ladder and is terminal.
  {
    const c = assembleCockpitJourney({
      journey: journey({ currentStage: "won", status: "won" }), events: [], facts: NO_FACTS, nowMs: NOW,
    });
    const allDone = c.ladder.filter((s) => !s.terminal).every((s) => s.done);
    ok("9 · won ⇒ 100%, terminal, whole ladder done",
      c.progress === 100 && c.terminal && allDone && c.ladder.at(-1)?.current === true,
      `progress=${c.progress} terminal=${c.terminal} allDone=${allDone}`);
  }

  // 10 — A non-canonical stage is REPORTED, never rendered as a ladder position.
  {
    const c = assembleCockpitJourney({
      journey: journey({ currentStage: "deal_signed" }), events: [], facts: NO_FACTS, nowMs: NOW,
    });
    const flagged = c.blockers.some((b) => b.kind === "non_canonical_stage");
    const noCurrent = !c.ladder.some((s) => s.current);
    ok("10 · non-canonical stage ⇒ blocker + no fake ladder position",
      flagged && noCurrent && c.progress === 0,
      `flagged=${flagged} noCurrent=${noCurrent} progress=${c.progress}`);
  }

  // 11 — 5.5G: a fallback record has NO commands. There is no journey to command,
  //      and writing the legacy table from the UI is the defect this batch kills.
  {
    const f = fallbackCockpitJourney({
      entityType: "property", entityId: "p-1",
      reason: "טרם נוצר מסע קנוני", canonicalStage: "marketing",
      facts: NO_FACTS, nowMs: NOW,
    });
    ok("11 · fallback ⇒ zero commands, marked, empty history",
      f.allowedCommands.length === 0 && f.journeyId === null && f.fallback
      && f.history.length === 0 && f.source === "fallback" && f.stageAgeDays === null,
      `cmds=${f.allowedCommands.length} journeyId=${String(f.journeyId)}`);
  }

  // 12 — 5.5G: a terminal journey offers ONLY override. Not pause. Not advance.
  {
    const cmds = allowedCommandsFor("seller", journey({ currentStage: "won", status: "won" }), true);
    ok("12 · terminal ⇒ override only",
      cmds.length === 1 && cmds[0] === "override", `cmds=${cmds.join(",")}`);
  }

  // 13 — 5.5G: paused ⇒ resume before advance. Blocked ⇒ unblock before advance.
  {
    const paused = allowedCommandsFor("seller", journey({ status: "paused" }), false);
    const blocked = allowedCommandsFor("seller", journey({ metadata: { blocked: true } }), false);
    ok("13 · paused ⇒ resume; blocked ⇒ unblock (never advance)",
      paused.includes("resume") && !paused.includes("advance")
      && blocked.includes("unblock") && !blocked.includes("advance"),
      `paused=[${paused.join(",")}] blocked=[${blocked.join(",")}]`);
  }

  // 14 — 5.5G: no next rung ⇒ NO advance command. A dead control is never rendered.
  {
    const atTop = allowedCommandsFor("seller", journey({ currentStage: "deal" }), false);
    const mid = allowedCommandsFor("seller", journey({ currentStage: "marketing" }), false);
    ok("14 · last rung ⇒ no advance command",
      !atTop.includes("advance") && mid.includes("advance"),
      `top=[${atTop.join(",")}] mid=[${mid.join(",")}]`);
  }

  // 15 — nextMilestone is the real next rung, and null at the end of the ladder.
  {
    const c = assembleCockpitJourney({ journey: journey({ currentStage: "offers" }), events: [], facts: NO_FACTS, nowMs: NOW });
    const end = assembleCockpitJourney({ journey: journey({ currentStage: "deal" }), events: [], facts: NO_FACTS, nowMs: NOW });
    ok("15 · nextMilestone = real next rung, null at the top",
      c.nextMilestone?.key === "negotiation" && end.nextMilestone === null,
      `next=${c.nextMilestone?.key} end=${String(end.nextMilestone)}`);
  }

  // 16 — Provenance survives: journeys.source on the record, evidence.source per event.
  {
    const backfilled = ev({ evidence: { source: "legacy_backfill", mappingQuality: "exact" } });
    const kernel = ev({ id: "e-k", evidence: { sourceEvent: "property.published" } });
    const bare = ev({ id: "e-x", evidence: null });
    const c = assembleCockpitJourney({
      journey: journey({ source: "legacy_backfill" }),
      events: [backfilled], facts: NO_FACTS, nowMs: NOW,
    });
    ok("16 · provenance is carried, never guessed",
      c.canonicalSource === "legacy_backfill"
      && transitionSource(backfilled) === "legacy_backfill"
      && transitionSource(kernel) === "event"
      && transitionSource(bare) === null,
      `journeySrc=${String(c.canonicalSource)} bare=${String(transitionSource(bare))}`);
  }

  // 17 — An owner-less open journey is a blocker. A closed one is not.
  {
    const open = assembleCockpitJourney({ journey: journey({ ownerUserId: null }), events: [], facts: NO_FACTS, nowMs: NOW });
    const closed = assembleCockpitJourney({
      journey: journey({ ownerUserId: null, currentStage: "won", status: "won" }),
      events: [], facts: NO_FACTS, nowMs: NOW,
    });
    ok("17 · no_owner blocks an open journey only",
      open.blockers.some((b) => b.kind === "no_owner") && !closed.blockers.some((b) => b.kind === "no_owner"),
      `open=${open.blockers.map((b) => b.kind).join("|")} closed=${closed.blockers.map((b) => b.kind).join("|")}`);
  }

  // 18 — Events belonging to ANOTHER journey never leak into this cockpit.
  {
    const c = assembleCockpitJourney({
      journey: journey(),
      events: [ev(), ev({ id: "e-other", journeyId: "j-999" })],
      facts: NO_FACTS, nowMs: NOW,
    });
    ok("18 · foreign journey events are excluded",
      c.history.length === 1 && c.history[0].id === "e-1",
      `history=${c.history.map((h) => h.id).join(",")}`);
  }

  // 19 — recommendation is null unless a real engine produced one.
  {
    const c = assembleCockpitJourney({ journey: journey(), events: [], facts: NO_FACTS, nowMs: NOW });
    ok("19 · recommendation null unless an engine produced one",
      c.recommendation === null, `rec=${String(c.recommendation)}`);
  }

  // 20 — The property machine (the cockpit 5.5E is about to fix) assembles too.
  {
    const p = assembleCockpitJourney({
      journey: journey({ journeyType: "property", entityType: "property", entityId: "p-1", currentStage: "marketing" }),
      events: [], facts: NO_FACTS, nowMs: NOW,
    });
    const l = buildLadder("property", "marketing");
    ok("20 · property machine assembles (5.5E target)",
      p.journeyType === "property" && p.ladder.length === l.length && p.allowedCommands.includes("advance"),
      `stage=${p.currentStage} rungs=${p.ladder.length} cmds=${p.allowedCommands.join(",")}`);
  }

  // 21 — A transition with no destination is not a transition.
  {
    const h = buildHistory("seller", [ev({ id: "e-null", toStage: null })]);
    ok("21 · destination-less events are dropped", h.length === 0, `history=${h.length}`);
  }

  return r;
}

if (typeof process !== "undefined" && process.argv?.[1]?.includes("journey-cockpit/qa")) {
  const res = runCockpitQa();
  for (const x of res) console.log(`${x.pass ? "✅" : "❌"} ${x.name} — ${x.detail}`);
  const failed = res.filter((x) => !x.pass).length;
  console.log(`\n${res.length - failed}/${res.length} passed`);
  if (failed) process.exit(1);
}
