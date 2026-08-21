// ============================================================================
// ZONO — AI presence P0: deterministic PURE coverage for the presentational
// system's semantic maps and the agent-drawer "max one" recommendation picker.
// Proves: one persona voice per variant, all mascot states map to the ONE
// canonical asset (no fabricated poses), the size scale is bounded to P0 sizes,
// and the drawer surfaces AT MOST ONE real recommendation (none when empty).
// Rendering + real intelligence are HUMAN/VISUAL — not faked here.
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/zono-presence.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ZONO_VARIANT_META, ZONO_STATE_ASSET, ZONO_ASSET_DEFAULT, ZONO_SIZE_PX, ZONO_OPEN_CHAT_EVENT,
} from "../../src/components/zono/states.ts";
import { pickAgentZonoRecommendation } from "../../src/lib/office/agent-zono.ts";

// ── Persona voice: one canonical Hebrew label + tone per variant ──────────────
test("every variant maps to the approved ZONO voice + a real state", () => {
  assert.equal(ZONO_VARIANT_META.notice.label, "זונו שם לב");
  assert.equal(ZONO_VARIANT_META.recommendation.label, "זונו ממליץ");
  assert.equal(ZONO_VARIANT_META.opportunity.label, "זונו מצא הזדמנות");
  assert.equal(ZONO_VARIANT_META.warning.label, "אזהרה של זונו");
  assert.equal(ZONO_VARIANT_META.success.label, "זונו סיים");
  assert.equal(ZONO_VARIANT_META.insight.label, "התובנה של זונו");
  // tone is carried by a chip class (color) AND an icon — never color alone
  for (const v of Object.values(ZONO_VARIANT_META)) {
    assert.ok(v.chip.includes("bg-") && v.chip.includes("text-"), "chip has bg+text tone");
    assert.ok(v.icon.length > 0, "variant carries an icon (not color-only)");
  }
});

// ── No fabricated poses: all states resolve to the ONE canonical asset ────────
test("all mascot states point to the single canonical self-hosted asset", () => {
  const values = Object.values(ZONO_STATE_ASSET);
  assert.equal(values.length, 7);
  for (const p of values) assert.equal(p, ZONO_ASSET_DEFAULT);
  assert.match(ZONO_ASSET_DEFAULT, /^\/zono\//); // self-hosted, not a remote URL
});

// ── Size scale is bounded and ascending; P0 uses micro/compact/standard ───────
test("size scale is sane and ascending", () => {
  assert.ok(ZONO_SIZE_PX.micro < ZONO_SIZE_PX.compact);
  assert.ok(ZONO_SIZE_PX.compact < ZONO_SIZE_PX.standard);
  assert.ok(ZONO_SIZE_PX.standard < ZONO_SIZE_PX.hero);
  assert.ok(ZONO_SIZE_PX.micro >= 20 && ZONO_SIZE_PX.micro <= 28);
});

test("the open-chat trigger name is stable (AskZono ↔ ZIWidget contract)", () => {
  assert.equal(ZONO_OPEN_CHAT_EVENT, "zono:open-chat");
});

// ── Agent drawer: AT MOST ONE recommendation, priority-ordered, none when idle ─
test("drawer picks exactly one recommendation by priority", () => {
  // overdue leads win over everything
  assert.deepEqual(
    pickAgentZonoRecommendation({ overdueLeads: 5, stuckDeals: 2, overdueTasks: 3 }),
    { title: "5 לידים דורשים מעקב", label: "טפל בלידים" },
  );
  // then stuck deals
  assert.equal(pickAgentZonoRecommendation({ overdueLeads: 0, stuckDeals: 2, overdueTasks: 3 })?.label, "פתח עסקאות");
  // then overdue tasks
  assert.equal(pickAgentZonoRecommendation({ overdueLeads: 0, stuckDeals: 0, overdueTasks: 3 })?.label, "פתח משימות");
});
test("no fake insight: an agent with nothing overdue gets NO recommendation", () => {
  assert.equal(pickAgentZonoRecommendation({ overdueLeads: 0, stuckDeals: 0, overdueTasks: 0 }), null);
});
