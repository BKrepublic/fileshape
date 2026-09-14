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

test("normal spacing keeps the lower-quartile order statistic explicit", () => {
  const spacing = estimateNormalSpacing([8, 10, 11, 12, 50], 14);
  assert.deepEqual(spacing, {
    normal: 10,
    sampleCount: 5,
    source: "distribution",
  });
});

test("one observed gap remains low-confidence and falls back to body scale", () => {
  const spacing = estimateNormalSpacing([56], 14);
  assert.ok(Math.abs(spacing.normal - 23.1) < 1e-12);
  assert.equal(spacing.sampleCount, 1);
  assert.equal(spacing.source, "font-fallback");
});

test("sparse spacing provenance distinguishes all evidence sources", () => {
  assert.deepEqual(estimateNormalSpacing([24, 25], 14), {
    normal: 24,
    sampleCount: 2,
    source: "distribution",
  });
  const fallback = estimateNormalSpacing([], 14);
  assert.ok(Math.abs(fallback.normal - 23.1) < 1e-12);
  assert.equal(fallback.sampleCount, 0);
  assert.equal(fallback.source, "font-fallback");
  assert.deepEqual(estimateNormalSpacing([24], 0), {
    normal: 24,
    sampleCount: 1,
    source: "single-observation",
  });
  assert.deepEqual(estimateNormalSpacing([], 0), {
    normal: 0,
    sampleCount: 0,
    source: "none",
  });
});

test("invalid and non-positive gaps do not enter spacing evidence", () => {
  assert.deepEqual(estimateNormalSpacing([24, Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 25], 14), {
    normal: 24,
    sampleCount: 2,
    source: "distribution",
  });
});

test("minimum gap filtering excludes equality and accepts the next positive gap", () => {
  assert.deepEqual(estimateNormalSpacing([10], 0, 10), {
    normal: 0,
    sampleCount: 0,
    source: "none",
  });

  const justAbove = 10 + 1e-9;
  assert.deepEqual(estimateNormalSpacing([justAbove], 0, 10), {
    normal: justAbove,
    sampleCount: 1,
    source: "single-observation",
  });
});

test("uniform scale preserves spacing provenance and scales the estimate", () => {
  const gaps = [24, 25, 60, 26];
  const bodyFontSize = 14;
  const baseline = estimateNormalSpacing(gaps, bodyFontSize);

  for (const scale of [0.5, 1.75, 3]) {
    const scaled = estimateNormalSpacing(
      gaps.map((gap) => gap * scale),
      bodyFontSize * scale,
    );
    assert.equal(scaled.source, baseline.source);
    assert.equal(scaled.sampleCount, baseline.sampleCount);
    assert.ok(Math.abs(scaled.normal - baseline.normal * scale) < 1e-10);
  }
});

test("minimum-gap scale normalization preserves which samples are eligible", () => {
  const gaps = [8, 12, 20];
  const minimumGap = 10;
  const baseline = estimateNormalSpacing(gaps, 0, minimumGap);

  for (const scale of [0.5, 2]) {
    const scaled = estimateNormalSpacing(
      gaps.map((gap) => gap * scale),
      0,
      minimumGap * scale,
    );
    assert.equal(scaled.source, baseline.source);
    assert.equal(scaled.sampleCount, baseline.sampleCount);
    assert.ok(Math.abs(scaled.normal - baseline.normal * scale) < 1e-10);
  }
});

test("paragraph gap threshold is shared without changing existing calibration", () => {
  assert.equal(paragraphGapThreshold(24, 14), 41.5);
  assert.equal(paragraphGapThreshold(0, 14), Number.POSITIVE_INFINITY);
});

test("paragraph threshold exposes both calibration branches and their tie", () => {
  assert.equal(paragraphGapThreshold(50, 10), 77.5);
  assert.equal(paragraphGapThreshold(24, 14), 41.5);
  assert.equal(paragraphGapThreshold(25, 11), 38.75);
});

test("paragraph threshold is scale-normalized with the spacing and body font", () => {
  const normalSpacing = 24;
  const bodyFontSize = 14;
  const baseline = paragraphGapThreshold(normalSpacing, bodyFontSize);

  for (const scale of [0.5, 2, 3.25]) {
    const scaled = paragraphGapThreshold(normalSpacing * scale, bodyFontSize * scale);
    assert.ok(Math.abs(scaled - baseline * scale) < 1e-10);
  }
});
