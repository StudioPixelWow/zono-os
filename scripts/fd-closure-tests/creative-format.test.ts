// ============================================================================
// ZONO — Creative Studio FORMAT FIX: deterministic PURE coverage that the picked
// output format (1:1 / 4:5 / 9:16) drives the EXACT aspect ratio end-to-end.
// The canonical map (creative-preselect) is the single source of truth for
// canvas pixels, the provider request size, and the CSS aspect; the engine reads
// it (no more `format === "story_9_16" ? … : …` footgun that forced portrait).
// Actual image generation + storage intrinsic dims are HUMAN_E2E (provider I/O).
// Run: node --experimental-strip-types --test scripts/fd-closure-tests/creative-format.test.ts
// ============================================================================
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FORMAT_SPEC, FORMAT_RATIO, CREATIVE_FORMATS,
  coerceCreativeFormat, formatCanvas, formatOpenAiSize, formatCssAspect,
} from "../../src/lib/creative-studio/creative-preselect.ts";

const OPENAI_ALLOWED = new Set(["1024x1024", "1024x1536", "1536x1024"]);
const isPortrait = (s: string) => { const [w, h] = s.split("x").map(Number); return h > w; };
const isSquare = (s: string) => { const [w, h] = s.split("x").map(Number); return w === h; };

// ── A: the canonical map covers EXACTLY the three real formats ────────────────
test("A: FORMAT_SPEC keys are exactly the canonical formats", () => {
  assert.deepEqual(Object.keys(FORMAT_SPEC).sort(), [...CREATIVE_FORMATS].sort());
});

// ── B: 1:1 is SQUARE, never portrait (the exact reported P0 bug) ──────────────
test("B: feed_1_1 canvas is 1080x1080 square — never a portrait", () => {
  const c = FORMAT_SPEC.feed_1_1.canvas;
  assert.deepEqual(c, { w: 1080, h: 1080 });
  assert.equal(c.w, c.h); // square: the picker's 1:1 must NOT come back vertical
});

// ── C/D: 4:5 and 9:16 carry their canonical portrait canvases ─────────────────
test("C: feed_4_5 canvas is 1080x1350 (4:5)", () => {
  assert.deepEqual(FORMAT_SPEC.feed_4_5.canvas, { w: 1080, h: 1350 });
});
test("D: story_9_16 canvas is 1080x1920 (9:16)", () => {
  assert.deepEqual(FORMAT_SPEC.story_9_16.canvas, { w: 1080, h: 1920 });
});

// ── E: canvas pixel ratio equals the picker ratio for every format ────────────
test("E: canvas aspect ratio matches FORMAT_RATIO for every format", () => {
  for (const f of CREATIVE_FORMATS) {
    const [rw, rh] = FORMAT_RATIO[f];
    const { w, h } = FORMAT_SPEC[f].canvas;
    // cross-multiply to avoid float error: w/h === rw/rh  ⇔  w*rh === h*rw
    assert.equal(w * rh, h * rw, `ratio mismatch for ${f}`);
  }
});

// ── F: provider request size matches the picked orientation ───────────────────
test("F: openaiSize is square for 1:1 and portrait bucket for 4:5 / 9:16", () => {
  assert.equal(FORMAT_SPEC.feed_1_1.openaiSize, "1024x1024"); // square request → square output
  assert.equal(FORMAT_SPEC.feed_4_5.openaiSize, "1024x1536"); // nearest portrait bucket
  assert.equal(FORMAT_SPEC.story_9_16.openaiSize, "1024x1536");
});

// ── G: every openaiSize is a real gpt-image-1 size ────────────────────────────
test("G: every openaiSize is an allowed gpt-image-1 size", () => {
  for (const f of CREATIVE_FORMATS) assert.ok(OPENAI_ALLOWED.has(FORMAT_SPEC[f].openaiSize), `bad size for ${f}`);
});

// ── H: cssAspect strings are the canonical W / H ──────────────────────────────
test("H: cssAspect is the canonical W / H per format", () => {
  assert.equal(FORMAT_SPEC.feed_1_1.cssAspect, "1 / 1");
  assert.equal(FORMAT_SPEC.feed_4_5.cssAspect, "4 / 5");
  assert.equal(FORMAT_SPEC.story_9_16.cssAspect, "9 / 16");
});

// ── I: coerce is identity on valid formats ────────────────────────────────────
test("I: coerceCreativeFormat passes valid formats through unchanged", () => {
  for (const f of CREATIVE_FORMATS) assert.equal(coerceCreativeFormat(f), f);
});

// ── J: coerce NEVER silently yields portrait/story for junk (footgun removed) ─
test("J: unknown / null / legacy format coerces to feed_1_1, never portrait", () => {
  for (const bad of [null, undefined, "", "square", "feed", "story", "portrait", "feed_16_9", 42, {}]) {
    assert.equal(coerceCreativeFormat(bad as unknown), "feed_1_1");
  }
  // and the helpers built on it default to the SQUARE canvas / square request
  assert.deepEqual(formatCanvas("nonsense"), { w: 1080, h: 1080 });
  assert.equal(formatOpenAiSize("nonsense"), "1024x1024");
  assert.equal(formatCssAspect("nonsense"), "1 / 1");
});

// ── K: the accessor helpers agree with the map for every format ───────────────
test("K: formatCanvas / formatOpenAiSize / formatCssAspect match FORMAT_SPEC", () => {
  for (const f of CREATIVE_FORMATS) {
    assert.deepEqual(formatCanvas(f), FORMAT_SPEC[f].canvas);
    assert.equal(formatOpenAiSize(f), FORMAT_SPEC[f].openaiSize);
    assert.equal(formatCssAspect(f), FORMAT_SPEC[f].cssAspect);
  }
});

// ── L: orientation invariant — the request orientation follows the canvas ─────
// Anti-footgun guard: a SQUARE canvas must request a SQUARE size (so 1:1 can
// never come back vertical), and a PORTRAIT canvas must request a PORTRAIT size.
test("L: provider request orientation matches the canvas orientation", () => {
  for (const f of CREATIVE_FORMATS) {
    const { w, h } = FORMAT_SPEC[f].canvas;
    const size = FORMAT_SPEC[f].openaiSize;
    if (w === h) assert.ok(isSquare(size), `${f}: square canvas must request a square size`);
    else if (h > w) assert.ok(isPortrait(size), `${f}: portrait canvas must request a portrait size`);
  }
  // Explicit: the reported bug — 1:1 must be square on BOTH canvas and request.
  assert.ok(isSquare(FORMAT_SPEC.feed_1_1.openaiSize));
  assert.equal(FORMAT_SPEC.feed_1_1.canvas.w, FORMAT_SPEC.feed_1_1.canvas.h);
});
