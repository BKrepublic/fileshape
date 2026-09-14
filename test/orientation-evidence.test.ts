import assert from "node:assert/strict";
import test from "node:test";
import { resolveDocumentOrientations } from "../src/document-orientation.js";
import { summarizeOrientationEvidence } from "../src/orientation-evidence.js";

const conflictedMetrics = {
  singleCharItemRatio: 0,
  verticalRunRatio: 1,
  horizontalRunRatio: 0,
  verticalBaselineRatio: 0,
  horizontalBaselineRatio: 1,
  sequenceVerticalRatio: 0,
  sequenceHorizontalRatio: 0,
};

const horizontalRunWithVerticalSequence = {
  singleCharItemRatio: 0.98,
  verticalRunRatio: 0,
  horizontalRunRatio: 1,
  verticalBaselineRatio: 0.12,
  horizontalBaselineRatio: 0.88,
  sequenceVerticalRatio: 1,
  sequenceHorizontalRatio: 0,
};

test("orientation evidence exposes disagreement without discarding the decisive source", () => {
  const evidence = summarizeOrientationEvidence("vertical", conflictedMetrics);

  assert.equal(evidence.provisional, "vertical");
  assert.equal(evidence.decisionSource, "run");
  assert.equal(evidence.vertical, 1);
  assert.equal(evidence.horizontal, 1);
  assert.equal(evidence.margin, 0);
  assert.deepEqual(evidence.channels.run, { vertical: 1, horizontal: 0 });
  assert.deepEqual(evidence.channels.baseline, { vertical: 0, horizontal: 1 });
});

test("glyph-dominant sequence evidence outranks the minority multi-character run channel", () => {
  const evidence = summarizeOrientationEvidence("vertical", horizontalRunWithVerticalSequence);

  assert.equal(evidence.vertical, 1);
  assert.equal(evidence.horizontal, 1);
  assert.equal(evidence.margin, 0);
  assert.equal(evidence.decisionSource, "sequence");
  assert.deepEqual(evidence.channels.run, { vertical: 0, horizontal: 1 });
  assert.deepEqual(evidence.channels.sequence, { vertical: 1, horizontal: 0 });
});

test("a known label without a metric-backed decision is identified as attached-run fallback", () => {
  const evidence = summarizeOrientationEvidence("vertical", {
    singleCharItemRatio: 0.2,
    verticalRunRatio: 0.5,
    horizontalRunRatio: 0,
    verticalBaselineRatio: 0.5,
    horizontalBaselineRatio: 0.5,
    sequenceVerticalRatio: 0,
    sequenceHorizontalRatio: 0,
  });

  assert.equal(evidence.decisionSource, "attached-run");
});

test("document orientation resolution preserves compact evidence unchanged", () => {
  const evidence = summarizeOrientationEvidence("vertical", conflictedMetrics);
  const [resolved] = resolveDocumentOrientations([
    { page: 7, orientation: "vertical", evidence },
  ]);

  assert.equal(resolved?.resolved, "vertical");
  assert.deepEqual(resolved?.evidence, evidence);
});
