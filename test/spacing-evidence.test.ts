import assert from "node:assert/strict";
import test from "node:test";
import { estimateNormalSpacing, paragraphGapThreshold } from "../src/spacing-evidence.js";

test("normal spacing uses a robust distribution only with multiple observations", () => {
  const spacing = estimateNormalSpacing([24, 25, 60, 26], 14);
  assert.deepEqual(spacing, {
    normal: 24,
    sampleCount: 4,
    source: "distribution",
  });
});

test("one observed gap remains low-confidence and falls back to body scale", () => {
  const spacing = estimateNormalSpacing([56], 14);
  assert.ok(Math.abs(spacing.normal - 23.1) < 1e-12);
  assert.equal(spacing.sampleCount, 1);
  assert.equal(spacing.source, "font-fallback");
});

test("paragraph gap threshold is shared without changing existing calibration", () => {
  assert.equal(paragraphGapThreshold(24, 14), 41.5);
  assert.equal(paragraphGapThreshold(0, 14), Number.POSITIVE_INFINITY);
});
