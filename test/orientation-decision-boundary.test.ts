import assert from "node:assert/strict";
import test from "node:test";
import {
  decideMetricOrientation,
  type OrientationMetrics,
} from "../src/orientation-decision.js";

function metrics(overrides: Partial<OrientationMetrics> = {}): OrientationMetrics {
  return {
    singleCharItemRatio: 0,
    verticalRunRatio: 0,
    horizontalRunRatio: 0,
    verticalBaselineRatio: 0,
    horizontalBaselineRatio: 0,
    sequenceVerticalRatio: 0,
    sequenceHorizontalRatio: 0,
    ...overrides,
  };
}

test("glyph dominance and sequence support thresholds are inclusive", () => {
  assert.deepEqual(decideMetricOrientation(metrics({
    singleCharItemRatio: 0.7,
    sequenceVerticalRatio: 0.6,
    sequenceHorizontalRatio: 0.4,
  })), { orientation: "vertical", source: "sequence" });

  assert.deepEqual(decideMetricOrientation(metrics({
    singleCharItemRatio: 0.6999,
    sequenceVerticalRatio: 0.6,
    sequenceHorizontalRatio: 0.4,
  })), { orientation: "unknown", source: "none" });

  assert.deepEqual(decideMetricOrientation(metrics({
    singleCharItemRatio: 0.7,
    sequenceVerticalRatio: 0.5999,
    sequenceHorizontalRatio: 0.4,
  })), { orientation: "unknown", source: "none" });
});

test("equal sequence channels fail closed instead of selecting source order", () => {
  assert.deepEqual(decideMetricOrientation(metrics({
    singleCharItemRatio: 0.9,
    sequenceVerticalRatio: 0.6,
    sequenceHorizontalRatio: 0.6,
  })), { orientation: "unknown", source: "none" });
});

test("run threshold is inclusive but still requires a strict channel winner", () => {
  assert.deepEqual(decideMetricOrientation(metrics({
    verticalRunRatio: 0.6,
    horizontalRunRatio: 0.59,
  })), { orientation: "vertical", source: "run" });

  assert.deepEqual(decideMetricOrientation(metrics({
    verticalRunRatio: 0.6,
    horizontalRunRatio: 0.6,
  })), { orientation: "unknown", source: "none" });

  assert.deepEqual(decideMetricOrientation(metrics({
    verticalRunRatio: 0.5999,
    horizontalRunRatio: 0.2,
  })), { orientation: "unknown", source: "none" });
});

test("glyph-dominant baseline threshold is inclusive at 0.6", () => {
  assert.deepEqual(decideMetricOrientation(metrics({
    singleCharItemRatio: 0.7,
    verticalBaselineRatio: 0.6,
    horizontalBaselineRatio: 0.4,
  })), { orientation: "vertical", source: "baseline" });

  assert.deepEqual(decideMetricOrientation(metrics({
    singleCharItemRatio: 0.7,
    verticalBaselineRatio: 0.5999,
    horizontalBaselineRatio: 0.4,
  })), { orientation: "unknown", source: "none" });
});

test("non-glyph baseline dominance is strict above 1.5x", () => {
  assert.deepEqual(decideMetricOrientation(metrics({
    verticalBaselineRatio: 0.6,
    horizontalBaselineRatio: 0.4,
  })), { orientation: "unknown", source: "none" });

  assert.deepEqual(decideMetricOrientation(metrics({
    verticalBaselineRatio: 0.6001,
    horizontalBaselineRatio: 0.4,
  })), { orientation: "vertical", source: "baseline" });
});

test("glyph sequence evidence keeps precedence over an opposite run tendency", () => {
  assert.deepEqual(decideMetricOrientation(metrics({
    singleCharItemRatio: 0.9,
    sequenceVerticalRatio: 0.7,
    sequenceHorizontalRatio: 0.2,
    verticalRunRatio: 0.1,
    horizontalRunRatio: 0.9,
  })), { orientation: "vertical", source: "sequence" });
});
