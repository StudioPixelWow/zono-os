/**
 * LOCAL-DEV-ONLY check for the valuation self-learning accuracy engine. Pure
 * functions only (no DB). Verifies: per-transaction error, aggregate accuracy,
 * bounded calibration factor (insufficient-sample guard + ±6% bound), calibration
 * application, estimated-accuracy text, negotiation percentage, determinism.
 *
 * Run: npx tsx scripts/valuation-accuracy-dev-check.ts
 */
import {
  computeError, aggregateAccuracy, calibrationFactor, applyCalibration,
  buildEstimatedAccuracy, negotiationPercent, MIN_CALIBRATION_SAMPLES,
} from "../src/lib/valuation/accuracy";
import type { AccuracyPoint } from "../src/lib/valuation/accuracy";

let failures = 0;
function assert(c: boolean, label: string): void { if (c) console.log(`  ✓ ${label}`); else { failures++; console.error(`  ✗ ${label}`); } }

function main(): void {
  console.log("Valuation accuracy (self-learning) dev-check\n");

  // 1) Per-transaction error.
  console.log("Prediction error:");
  const e = computeError(2_000_000, 2_100_000);
  assert(e.difference === 100_000, "difference = actual - predicted");
  assert(e.percentageError === 5, "percentage error +5% (under-predicted)");
  assert(e.accuracyPercent === 95, "accuracy = 100 - |error| = 95");
  assert(computeError(0, 100).accuracyPercent === 0, "zero prediction → 0 accuracy (no crash)");

  // 2) Aggregate accuracy.
  console.log("\nAggregate:");
  const pts: AccuracyPoint[] = [
    { predicted: 2_000_000, actual: 2_100_000 }, // +5%
    { predicted: 3_000_000, actual: 3_060_000 }, // +2%
    { predicted: 2_500_000, actual: 2_450_000 }, // -2%
  ];
  const agg = aggregateAccuracy(pts);
  assert(agg.count === 3, "counts valid points");
  assert(agg.avgAccuracy != null && agg.avgAccuracy > 95, "avg accuracy high for small errors");
  assert(agg.meanSignedErrorPercent != null && Math.abs(agg.meanSignedErrorPercent - 1.67) < 0.1, "mean signed error ≈ +1.67% (slight under-prediction)");
  assert(aggregateAccuracy([]).count === 0 && aggregateAccuracy([]).avgAccuracy === null, "empty → null aggregate (not 0)");

  // 3) Calibration factor — insufficient-sample guard.
  console.log("\nCalibration:");
  assert(calibrationFactor(agg) === 1, `< ${MIN_CALIBRATION_SAMPLES} samples → no calibration (1.0)`);
  const many: AccuracyPoint[] = Array.from({ length: 12 }, () => ({ predicted: 2_000_000, actual: 2_200_000 })); // +10% consistent
  const f = calibrationFactor(aggregateAccuracy(many));
  assert(f > 1 && f <= 1.06, "consistent under-prediction → upward factor, bounded ≤ +6%");
  const manyOver: AccuracyPoint[] = Array.from({ length: 12 }, () => ({ predicted: 2_000_000, actual: 1_600_000 })); // -20%
  assert(calibrationFactor(aggregateAccuracy(manyOver)) >= 0.94, "consistent over-prediction → downward factor, bounded ≥ -6%");

  // 4) Apply calibration.
  console.log("\nApply calibration:");
  assert(applyCalibration(2_000_000, 1.03) === 2_060_000, "applies factor + rounds to ₪1,000");
  assert(applyCalibration(2_000_000, 1) === 2_000_000, "factor 1.0 → unchanged");

  // 5) Estimated-accuracy text.
  console.log("\nEstimated accuracy text:");
  const ea = buildEstimatedAccuracy("תל אביב", aggregateAccuracy(many));
  assert(ea.accuracyPercent != null && ea.sampleSize === 12, "carries accuracy + sample size");
  assert(ea.text.includes("תל אביב") && ea.text.includes("12") && ea.text.includes("%"), "Hebrew summary mentions city, count, %");
  assert(buildEstimatedAccuracy(null, aggregateAccuracy([])).accuracyPercent === null, "no data → null accuracy + honest message");

  // 6) Negotiation percentage.
  console.log("\nNegotiation %:");
  assert(negotiationPercent(2_100_000, 2_000_000) != null && negotiationPercent(2_100_000, 2_000_000)! < 0, "final below asking → negative (discount)");
  assert(negotiationPercent(null, 2_000_000) === null, "no asking → null");

  // 7) Determinism.
  console.log("\nDeterminism:");
  assert(JSON.stringify(aggregateAccuracy(many)) === JSON.stringify(aggregateAccuracy(many)), "identical input → identical aggregate");

  console.log(`\n${failures === 0 ? "✅ ALL VALUATION ACCURACY CHECKS PASSED" : `❌ ${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exit(1);
}

main();
