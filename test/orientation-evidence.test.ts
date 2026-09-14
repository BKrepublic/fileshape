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

test("orientation evidence exposes disagreement hidden by a hard page label", () => {
  const evidence = summarizeOrientationEvidence("vertical", conflictedMetrics);

  assert.equal(evidence.provisional, "vertical");
  assert.equal(evidence.vertical, 1);
  assert.equal(evidence.horizontal, 1);
  assert.equal(evidence.margin, 0);
  assert.deepEqual(evidence.channels.run, { vertical: 1, horizontal: 0 });
  assert.deepEqual(evidence.channels.baseline, { vertical: 0, horizontal: 1 });
});

test("document orientation resolution preserves compact evidence unchanged", () => {
  const evidence = summarizeOrientationEvidence("vertical", conflictedMetrics);
  const [resolved] = resolveDocumentOrientations([
    { page: 7, orientation: "vertical", evidence },
  ]);

  assert.equal(resolved?.resolved, "vertical");
  assert.deepEqual(resolved?.evidence, evidence);
});
